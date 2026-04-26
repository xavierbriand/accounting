import { Command } from 'commander';
import { getDb } from '../infra/db/sqlite-client.js';
import { FileConfigService } from '../infra/config/config-service.js';
import { NodeCsvParser } from '../infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../core/ingest/transaction-builder.js';
import { SqliteHashRepository } from '../infra/db/repositories/sqlite-hash-repository.js';
import { SqliteTransactionRepository } from '../infra/db/repositories/sqlite-transaction-repo.js';
import { NodeSqliteSnapshotService } from '../infra/db/node-sqlite-snapshot-service.js';
import { nodeHashFn } from '../infra/crypto/node-hash-fn.js';
import { nodeUuidGen } from '../infra/crypto/node-uuid-gen.js';
import { pickSourceAccount } from '../infra/fs/pick-source-account.js';
import { readBpceCsv } from '../infra/fs/read-bpce-csv.js';
import { inquirerPrompter } from './utils/interactive.js';
import { runIngestCommand } from './commands/ingest-command.js';
import { runMigrate } from './migrate.js';
import { assertMigrated } from '../infra/db/migration-check.js';
import { validateDbPath } from '../infra/db/db-path-validator.js';

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
    const configService = new FileConfigService({ projectDir: process.cwd() });
    const configResult = configService.load();
    if (configResult.isFailure) {
      process.stderr.write(`error: ${configResult.error}\n`);
      process.exit(1);
    }
    const config = configResult.value;

    if (options.dbPathOverride !== undefined) {
      process.stderr.write('[warning] --db-path-override is set; YAML dbPath ignored. Use only for recovery.\n');
    }
    const effectiveDbPath = options.dbPathOverride ?? config.dbPath;

    const validation = validateDbPath(effectiveDbPath);
    if (validation.isFailure) {
      process.stderr.write(`error: ${validation.error}\n`);
      process.exit(2);
    }
    runMigrate(validation.value);
  });

program
  .command('ingest')
  .description('Ingest a bank CSV file and interactively tag transactions')
  .requiredOption('-f, --file <path>', 'Path to the bank CSV file')
  .option('--non-interactive', 'Fail if any item needs review (CI mode)', false)
  .option('--json', 'Output JSON instead of a table', false)
  .option('--db-path-override <path>', 'Override the YAML dbPath (for recovery only; emits a warning)')
  .action(async (options: { file: string; nonInteractive: boolean; json: boolean; dbPathOverride?: string }) => {
    const configService = new FileConfigService({ projectDir: process.cwd() });
    const configResult = configService.load();
    if (configResult.isFailure) {
      process.stderr.write(`error: ${configResult.error}\n`);
      process.exit(1);
    }
    const config = configResult.value;

    if (options.dbPathOverride !== undefined) {
      process.stderr.write('[warning] --db-path-override is set; YAML dbPath ignored. Use only for recovery.\n');
    }
    const effectiveDbPath = options.dbPathOverride ?? config.dbPath;

    const validation = validateDbPath(effectiveDbPath);
    if (validation.isFailure) {
      process.stderr.write(`error: ${validation.error}\n`);
      process.exit(2);
    }
    const resolvedDb = validation.value;
    const db = getDb(resolvedDb);

    const migrationCheck = assertMigrated(db, resolvedDb);
    if (migrationCheck.isFailure) {
      process.stderr.write(`error: ${migrationCheck.error}\n`);
      process.exit(2);
    }

    const csvParser = new NodeCsvParser();
    const hashRepo = new SqliteHashRepository(db);
    const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
    const transactionBuilder = (accounts: ConstructorParameters<typeof TransactionBuilder>[0]) =>
      new TransactionBuilder(accounts, undefined, nodeUuidGen);
    const transactionRepository = new SqliteTransactionRepository(db);
    const snapshotService = new NodeSqliteSnapshotService(db);

    await runIngestCommand(
      { file: options.file, nonInteractive: options.nonInteractive, json: options.json },
      {
        config,
        csvParser,
        idempotencyService,
        transactionBuilder,
        pickSourceAccount,
        readFile: readBpceCsv,
        prompt: inquirerPrompter,
        stdout: process.stdout,
        stderr: process.stderr,
        exitCode: (code) => process.exit(code),
        transactionRepository,
        snapshotService,
        dbPath: resolvedDb,
      },
    );
  });

program.parse(process.argv);
