import fs from 'fs';
import type Database from 'better-sqlite3';
import { Command, CommanderError } from 'commander';
import { getDb, closeDb } from '../infra/db/sqlite-client.js';
import { FileConfigService } from '../infra/config/config-service.js';
import { YamlConfigWriter } from '../infra/config/yaml-config-writer.js';
import { NodeCsvParser } from '../infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../core/ingest/transaction-builder.js';
import { SqliteHashRepository } from '../infra/db/repositories/sqlite-hash-repository.js';
import { SqliteTransactionRepository } from '../infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../infra/db/repositories/sqlite-domain-event-recorder.js';
import { SqliteConfigStateStore } from '../infra/db/repositories/sqlite-config-state-store.js';
import { observeConfigChange } from './utils/observe-config-change.js';
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
import { runCorrectCommand } from './commands/correct-command.js';
import { runExplainCommand } from './commands/explain-command.js';
import { runExportCommand } from './commands/export-command.js';
import { runDissolveCommand } from './commands/dissolve-command.js';
import { runMigrate } from './migrate.js';
import { assertMigrated } from '../infra/db/migration-check.js';
import { validateDbPath } from '../infra/db/db-path-validator.js';
import { verifyBundle } from '../infra/export/bundle-verifier.js';
import { writeDissolutionReceipt } from '../infra/fs/dissolution-receipt.js';
import { FsStoreReset, planWipeTargets } from '../infra/db/fs-store-reset.js';
import { SplitRulesService } from '../core/splits/split-rules-service.js';
import { BufferStateService } from '../core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../core/recurring/recurring-forecast-service.js';
import { SafeTransferCalculator } from '../core/transfer/safe-transfer-calculator.js';
import { SqliteBufferLedgerQuery } from '../infra/db/repositories/sqlite-buffer-ledger-query.js';
import { SqliteContributionQuery } from '../infra/db/repositories/sqlite-contribution-query.js';
import { nodeClock } from './utils/node-clock.js';
import { nodeTimestampClock } from './utils/node-timestamp-clock.js';
import { FsDataExporter } from '../infra/export/fs-data-exporter.js';
import { writeJsonErrorIf } from './utils/json-envelope.js';
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

// Ambient audit observation (FR23, story-4.5a): one shared call per ledger-opening command,
// right after assertMigrated (or, for `migrate`, after a successful migration). Best-effort —
// never blocks the command it's wired into (see observeConfigChange's own doc comment).
// `categorize` is deliberately excluded: it never opens the DB (story-D no-DB invariant,
// enforced by tests/integration/cli/categorize-end-to-end-wiring.test.ts).
function observeConfigChangeFor(db: Database.Database, config: AppConfig, stderr: NodeJS.WritableStream): void {
  observeConfigChange({
    config,
    configStateStore: new SqliteConfigStateStore(db),
    domainEventRecorder: new SqliteDomainEventRecorder(db),
    hashFn: nodeHashFn,
    stderr,
  });
}

const program = new Command();

program
  .name('accounting')
  .description('Couples expense sharing CLI')
  .version('1.0.0');

// story-maint-26: must run before any .command(...) registration below —
// Commander's copyInheritedSettings() copies the parent's exitCallback onto a
// subcommand at .command() call time, not at parse time, so exitOverride()
// called after registration would silently not apply to any subcommand.
program.exitOverride();

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
    const { config, resolvedDbPath } = result.value;
    runMigrate(resolvedDbPath);
    observeConfigChangeFor(getDb(resolvedDbPath), config, process.stderr);
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
    observeConfigChangeFor(db, config, process.stderr);

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
  .command('correct <transactionId>')
  .description('Correct a past transaction (writes a reversal + a correcting entry; the original is never mutated)')
  .option('--amount <decimal>', 'New amount, e.g. 45.30')
  .option('--category <name>', 'New expense category')
  .option('--date <YYYY-MM-DD>', 'New date (bare date; time-of-day and UTC offset are kept from the original)')
  .option('--description <text>', 'New description (pass "" to explicitly clear it)')
  .requiredOption('--reason <text>', 'Why this correction is being made (required, recorded in the audit trail)')
  .option('--json', 'Output JSON instead of human-readable text', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action(async (
    transactionId: string,
    options: { amount?: string; category?: string; date?: string; description?: string; reason: string; json: boolean; dbPathOverride?: string },
  ) => {
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
    observeConfigChangeFor(db, config, process.stderr);

    const transactionRepository = new SqliteTransactionRepository(db);
    const domainEventRecorder = new SqliteDomainEventRecorder(db);

    await runCorrectCommand(
      {
        transactionId,
        amount: options.amount,
        category: options.category,
        date: options.date,
        description: options.description,
        reason: options.reason,
        json: options.json,
      },
      {
        transactionRepository,
        domainEventRecorder,
        uuidGen: nodeUuidGen,
        stdout: process.stdout,
        stderr: process.stderr,
        exitCode: (code) => process.exit(code),
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
    observeConfigChangeFor(db, config, process.stderr);

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
  .command('explain')
  .description('Explain how this month\'s suggested transfer differs from last month\'s and last month\'s follow-through')
  .option('--as-of <YYYY-MM-DD>', 'Override today\'s date (determinism / past-state inspection)')
  .option('--json', 'Output JSON instead of human-readable tables', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action(async (options: { asOf?: string; json: boolean; dbPathOverride?: string }) => {
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
    observeConfigChangeFor(db, config, process.stderr);

    const ledger = new SqliteBufferLedgerQuery(db);
    const splitsService = new SplitRulesService(config.splits);
    const buffersService = new BufferStateService(config.buffers, config.defaultCurrency, ledger);
    const forecastService = new RecurringForecastService(config.recurring);
    const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, config.defaultCurrency);
    const contributionQuery = new SqliteContributionQuery(db, config.settlement?.accounts ?? []);

    const exitCode = await runExplainCommand(
      { asOf: options.asOf, json: options.json },
      {
        transferCalculator,
        contributionQuery,
        settlementConfigured: config.settlement !== undefined,
        clock: () => nodeClock(config.timezone),
        stdout: process.stdout,
        stderr: process.stderr,
      },
    );

    process.exit(exitCode);
  });

program
  .command('export')
  .description('Export the ledger, audit trail, and a copy of accounting.yaml into a portable bundle')
  .option('--out <dir>', 'Destination directory (default: ./exports)')
  .option('--json', 'Output JSON instead of human-readable text', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action(async (options: { out?: string; json: boolean; dbPathOverride?: string }) => {
    const result = resolveDbPathForCommand(options, process.cwd(), process.stderr);
    if (result.isFailure) {
      process.stderr.write(`error: ${result.error.message}\n`);
      process.exit(result.error.code);
    }
    const { config, resolvedDbPath, configService } = result.value;
    const db = getDb(resolvedDbPath);

    const migrationCheck = assertMigrated(db, resolvedDbPath);
    if (migrationCheck.isFailure) {
      process.stderr.write(`error: ${migrationCheck.error}\n`);
      process.exit(2);
    }
    observeConfigChangeFor(db, config, process.stderr);

    const dataExporter = new FsDataExporter(db, configService.getResolvedConfigPath());
    const domainEventRecorder = new SqliteDomainEventRecorder(db);

    await runExportCommand(
      { out: options.out, json: options.json },
      {
        dataExporter,
        domainEventRecorder,
        clock: () => nodeTimestampClock(config.timezone),
        cwd: process.cwd(),
        stdout: process.stdout,
        stderr: process.stderr,
        exitCode: (code) => process.exit(code),
      },
    );
  });

program
  .command('dissolve')
  .description('Verify an export bundle (the export-proof) and permanently wipe the ledger stores — preserves accounting.yaml and leaves a dissolution receipt')
  .requiredOption('--bundle <dir>', 'Path to a previously exported bundle directory (the export-proof)')
  .option('--confirm', 'Skip the typed-phrase confirmation prompt (for scripts/CI)', false)
  .option('--json', 'Output JSON instead of human-readable text', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action(async (options: { bundle: string; confirm: boolean; json: boolean; dbPathOverride?: string }) => {
    const result = resolveDbPathForCommand(options, process.cwd(), process.stderr);
    if (result.isFailure) {
      process.stderr.write(`error: ${result.error.message}\n`);
      process.exit(result.error.code);
    }
    const { config, resolvedDbPath, configService } = result.value;
    const db = getDb(resolvedDbPath);

    const migrationCheck = assertMigrated(db, resolvedDbPath);
    if (migrationCheck.isFailure) {
      process.stderr.write(`error: ${migrationCheck.error}\n`);
      process.exit(2);
    }
    // Dissolve is a normal ledger-opening command (Phase-2 reversal of the
    // draft's skip): an observed config change since the export correctly
    // trips the staleness gate below — the bundle's accounting.yaml copy is
    // outdated, so the archive is incomplete.
    observeConfigChangeFor(db, config, process.stderr);

    const dataExporter = new FsDataExporter(db, configService.getResolvedConfigPath());
    const storeReset = new FsStoreReset(resolvedDbPath);

    await runDissolveCommand(
      { bundle: options.bundle, confirm: options.confirm, json: options.json },
      {
        dataExporter,
        storeReset,
        verifyBundle,
        writeReceipt: writeDissolutionReceipt,
        planWipeTargets,
        prompt: inquirerPrompter,
        closeDb,
        dbPath: resolvedDbPath,
        configPath: configService.getResolvedConfigPath(),
        cwd: process.cwd(),
        stdout: process.stdout,
        stderr: process.stderr,
        exitCode: (code) => process.exit(code),
      },
    );
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

// story-maint-26: Commander's own parse-time failures (missing required
// option/argument, unknown option, excess arguments) are caught by Commander's
// parser before any action handler runs, entirely bypassing json-envelope.ts.
// exitOverride() (registered above, before any .command() call) makes Commander
// throw a CommanderError instead of calling process.exit directly, so we can
// translate the known bad-usage codes into the same --json failure envelope
// every other INVALID_ARGUMENT site produces.
const JSON_CAPABLE_COMMANDS = new Set(['ingest', 'correct', 'status', 'explain', 'categorize', 'export', 'dissolve']);

const COMMANDER_PASSTHROUGH_CODES = new Set([
  'commander.help',
  'commander.helpDisplayed',
  'commander.version',
]);

const COMMANDER_PARSE_ERROR_CODES = new Set([
  'commander.missingMandatoryOptionValue',
  'commander.optionMissingArgument',
  'commander.missingArgument',
  'commander.excessArguments',
  'commander.unknownOption',
  'commander.invalidArgument',
]);

try {
  program.parse(process.argv);
} catch (err) {
  if (!(err instanceof CommanderError)) {
    throw err;
  }
  if (COMMANDER_PASSTHROUGH_CODES.has(err.code)) {
    process.exit(err.exitCode);
  }
  if (COMMANDER_PARSE_ERROR_CODES.has(err.code)) {
    const commandName = process.argv[2];
    if (commandName !== undefined && JSON_CAPABLE_COMMANDS.has(commandName)) {
      writeJsonErrorIf(process.stderr, process.argv.includes('--json'), commandName, {
        code: 'INVALID_ARGUMENT',
        message: err.message.replace(/^error: /, ''),
      });
      process.exit(2);
    }
    // Not one of the 5 --json-capable commands (e.g. migrate, which has no
    // --json mode and no INVALID_ARGUMENT call site — contract § 8): preserve
    // Commander's own exit code, unaffected by this story.
    process.exit(err.exitCode);
  }
  // commander.unknownCommand (and anything else unclassified): deliberately out
  // of scope — no known command name to report. Preserve Commander's own exit
  // code, matching pre-exitOverride behavior.
  process.exit(err.exitCode);
}
