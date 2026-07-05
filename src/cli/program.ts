import fs from 'fs';
import { Command } from 'commander';
import { getDb } from '../infra/db/sqlite-client.js';
import { FileConfigService } from '../infra/config/config-service.js';
import { YamlConfigWriter } from '../infra/config/yaml-config-writer.js';
import { NodeCsvParser } from '../infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../core/ingest/transaction-builder.js';
import { SqliteHashRepository } from '../infra/db/repositories/sqlite-hash-repository.js';
import { SqliteTransactionRepository } from '../infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../infra/db/repositories/sqlite-domain-event-recorder.js';
import { NodeSqliteSnapshotService } from '../infra/db/node-sqlite-snapshot-service.js';
import { nodeHashFn } from '../infra/crypto/node-hash-fn.js';
import { nodeUuidGen } from '../infra/crypto/node-uuid-gen.js';
import { pickSourceAccount } from '../infra/fs/pick-source-account.js';
import { readBpceCsv } from '../infra/fs/read-bpce-csv.js';
import { inquirerPrompter, type InteractivePrompter } from './utils/interactive.js';
import { ScriptedPrompter, scriptHasForceMtimeRace, type Script } from './utils/scripted-prompter.js';
import { runIngestCommand } from './commands/ingest-command.js';
import { runCategorizeCommand } from './commands/categorize-command.js';
import { runStatusCommand } from './commands/status-command.js';
import { runMigrate } from './migrate.js';
import { assertMigrated } from '../infra/db/migration-check.js';
import { validateDbPath } from '../infra/db/db-path-validator.js';
import { SplitRulesService } from '../core/splits/split-rules-service.js';
import { BufferStateService } from '../core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../core/recurring/recurring-forecast-service.js';
import { SafeTransferCalculator } from '../core/transfer/safe-transfer-calculator.js';
import { SqliteBufferLedgerQuery } from '../infra/db/repositories/sqlite-buffer-ledger-query.js';
import { nodeClock } from './utils/node-clock.js';
import type { AppConfig } from '../core/config/app-config.js';
import { Result } from '../core/shared/result.js';

interface DbPathError {
  code: number;
  message: string;
}

interface ResolvedDb {
  config: AppConfig;
  resolvedDbPath: string;
  configService: FileConfigService;
}

function resolveDbPathForCommand(
  options: { dbPathOverride?: string },
  projectDir: string,
  stderr: NodeJS.WritableStream,
): Result<ResolvedDb, DbPathError> {
  const configService = new FileConfigService({ projectDir });
  const configResult = configService.load();
  if (configResult.isFailure) {
    return Result.fail({ code: 1, message: configResult.error });
  }
  const config = configResult.value;

  if (options.dbPathOverride !== undefined) {
    stderr.write('[warning] --db-path-override is set; YAML dbPath ignored. Use only for recovery.\n');
  }
  const effectiveDbPath = options.dbPathOverride ?? config.dbPath;

  const validation = validateDbPath(effectiveDbPath);
  if (validation.isFailure) {
    return Result.fail({ code: 2, message: validation.error });
  }

  return Result.ok({ config, resolvedDbPath: validation.value, configService });
}

const program = new Command();

program
  .name('accounting')
  .description('Couples expense sharing CLI')
  .version('1.0.0');

program
  .command('migrate')
  .description('Run database migrations')
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action((options: { dbPathOverride?: string }) => {
    const result = resolveDbPathForCommand(options, process.cwd(), process.stderr);
    if (result.isFailure) {
      process.stderr.write(`error: ${result.error.message}\n`);
      process.exit(result.error.code);
    }
    const { resolvedDbPath } = result.value;
    runMigrate(resolvedDbPath);
  });

program
  .command('ingest')
  .description('Ingest a bank CSV file and interactively tag transactions')
  .requiredOption('-f, --file <path>', 'Path to the bank CSV file')
  .option('--non-interactive', 'Fail if any item needs review (CI mode)', false)
  .option('--json', 'Output JSON instead of a table', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .option('--scripted-prompts <json>', '(test only) JSON array of canned prompt answers; gated by NODE_ENV=test')
  .action(async (options: { file: string; nonInteractive: boolean; json: boolean; dbPathOverride?: string; scriptedPrompts?: string }) => {
    const result = resolveDbPathForCommand(options, process.cwd(), process.stderr);
    if (result.isFailure) {
      process.stderr.write(`error: ${result.error.message}\n`);
      process.exit(result.error.code);
    }
    const { config, resolvedDbPath: resolvedDb, configService } = result.value;
    const db = getDb(resolvedDb);

    const migrationCheck = assertMigrated(db, resolvedDb);
    if (migrationCheck.isFailure) {
      process.stderr.write(`error: ${migrationCheck.error}\n`);
      process.exit(2);
    }

    const configPath = configService.getResolvedConfigPath();

    // Parse the test-only scripted-prompts flag (gated by NODE_ENV=test) before
    // constructing the writer; a `__forceMtimeRace__` entry in the script makes
    // us pass BigInt(0) as the expected mtime, simulating a mid-session edit.
    let scriptedPrompter: InteractivePrompter | null = null;
    let forceMtimeRace = false;
    if (options.scriptedPrompts !== undefined) {
      if (process.env['NODE_ENV'] !== 'test') {
        process.stderr.write('error: --scripted-prompts is only available with NODE_ENV=test\n');
        process.exit(1);
      }
      let script: readonly Script[];
      try {
        script = JSON.parse(options.scriptedPrompts) as readonly Script[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`error: --scripted-prompts JSON parse failed: ${msg}\n`);
        process.exit(1);
      }
      scriptedPrompter = new ScriptedPrompter(script);
      forceMtimeRace = scriptHasForceMtimeRace(script);
    }

    const configMtimeNs = forceMtimeRace
      ? BigInt(0)
      : fs.statSync(configPath, { bigint: true }).mtimeNs;
    const configWriter = new YamlConfigWriter(configPath, configMtimeNs);

    const csvParser = new NodeCsvParser();
    const hashRepo = new SqliteHashRepository(db);
    const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
    const transactionBuilder = (accounts: ConstructorParameters<typeof TransactionBuilder>[0]) =>
      new TransactionBuilder(accounts, config.autoTagRules, nodeUuidGen);
    const transactionRepository = new SqliteTransactionRepository(db);
    const snapshotService = new NodeSqliteSnapshotService(db);
    const domainEventRecorder = new SqliteDomainEventRecorder(db);

    await runIngestCommand(
      { file: options.file, nonInteractive: options.nonInteractive, json: options.json },
      {
        config,
        csvParser,
        idempotencyService,
        transactionBuilder,
        pickSourceAccount,
        readFile: readBpceCsv,
        prompt: scriptedPrompter ?? inquirerPrompter,
        stdout: process.stdout,
        stderr: process.stderr,
        exitCode: (code) => process.exit(code),
        transactionRepository,
        snapshotService,
        dbPath: resolvedDb,
        configWriter,
        domainEventRecorder,
      },
    );
  });

program
  .command('status')
  .description('Show buffer state, transfer breakdown, and forecast for the next month')
  .option('--as-of <YYYY-MM-DD>', 'Override today\'s date (determinism / past-state inspection)')
  .option('--from <YYYY-MM-DD>', 'Override window start date')
  .option('--to <YYYY-MM-DD>', 'Override window end date')
  .option('--json', 'Output JSON instead of human-readable tables', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action(async (options: { asOf?: string; from?: string; to?: string; json: boolean; dbPathOverride?: string }) => {
    const result = resolveDbPathForCommand(options, process.cwd(), process.stderr);
    if (result.isFailure) {
      process.stderr.write(`error: ${result.error.message}\n`);
      process.exit(result.error.code);
    }
    const { config, resolvedDbPath } = result.value;
    const db = getDb(resolvedDbPath);

    const migrationCheck = assertMigrated(db, resolvedDbPath);
    if (migrationCheck.isFailure) {
      process.stderr.write(`error: ${migrationCheck.error}\n`);
      process.exit(2);
    }

    const ledger = new SqliteBufferLedgerQuery(db);
    const splitsService = new SplitRulesService(config.splits);
    const buffersService = new BufferStateService(config.buffers, config.defaultCurrency, ledger);
    const forecastService = new RecurringForecastService(config.recurring);
    const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, config.defaultCurrency);

    const exitCode = await runStatusCommand(
      { asOf: options.asOf, from: options.from, to: options.to, json: options.json },
      {
        buffersService,
        forecastService,
        transferCalculator,
        clock: () => nodeClock(config.timezone),
        stdout: process.stdout,
        stderr: process.stderr,
      },
    );

    process.exit(exitCode);
  });

program
  .command('categorize')
  .description('Scan a CSV for unmatched descriptions and warm accounting.yaml autotag rules (no DB writes)')
  .requiredOption('-f, --file <path>', 'Path to the bank CSV file')
  .option('--non-interactive', 'Fail if any group would require a prompt (CI mode)', false)
  .option('--json', 'Output JSON summary instead of human-readable text', false)
  .option('--limit <n>', 'Stop after reviewing N groups (default: unbounded)', (v) => Number.parseInt(v, 10))
  .option('--min-count <n>', 'Skip groups with fewer than N occurrences (default: 2)', (v) => Number.parseInt(v, 10), 2)
  .option('--scripted-prompts <json>', '(test only) JSON array of canned prompt answers; gated by NODE_ENV=test')
  .action(async (options: { file: string; nonInteractive: boolean; json: boolean; limit?: number; minCount: number; scriptedPrompts?: string }) => {
    const result = resolveDbPathForCommand({}, process.cwd(), process.stderr);
    if (result.isFailure) {
      process.stderr.write(`error: ${result.error.message}\n`);
      process.exit(result.error.code);
    }
    const { config, configService } = result.value;

    const configPath = configService.getResolvedConfigPath();

    let scriptedPrompter: InteractivePrompter | null = null;
    let forceMtimeRace = false;
    if (options.scriptedPrompts !== undefined) {
      if (process.env['NODE_ENV'] !== 'test') {
        process.stderr.write('error: --scripted-prompts is only available with NODE_ENV=test\n');
        process.exit(1);
      }
      let script: readonly Script[];
      try {
        script = JSON.parse(options.scriptedPrompts) as readonly Script[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`error: --scripted-prompts JSON parse failed: ${msg}\n`);
        process.exit(1);
      }
      scriptedPrompter = new ScriptedPrompter(script);
      forceMtimeRace = scriptHasForceMtimeRace(script);
    }

    const configMtimeNs = forceMtimeRace
      ? BigInt(0)
      : fs.statSync(configPath, { bigint: true }).mtimeNs;
    const configWriter = new YamlConfigWriter(configPath, configMtimeNs);

    const csvParser = new NodeCsvParser();

    await runCategorizeCommand(
      {
        file: options.file,
        nonInteractive: options.nonInteractive,
        json: options.json,
        limit: options.limit,
        minCount: options.minCount,
      },
      {
        config,
        csvParser,
        pickSourceAccount,
        readFile: readBpceCsv,
        prompt: scriptedPrompter ?? inquirerPrompter,
        stdout: process.stdout,
        stderr: process.stderr,
        exitCode: (code) => process.exit(code),
        configWriter,
      },
    );
  });

program.parse(process.argv);
