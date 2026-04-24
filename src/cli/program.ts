import { Command } from 'commander';
import path from 'path';
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

const program = new Command();

program
  .name('accounting')
  .description('Couples expense sharing CLI')
  .version('1.0.0');

program
  .command('migrate')
  .description('Run database migrations')
  .option('--db-path <path>', 'Path to the SQLite database', 'accounting.db')
  .action((options: { dbPath: string }) => {
    runMigrate(options.dbPath);
  });

program
  .command('ingest')
  .description('Ingest a bank CSV file and interactively tag transactions')
  .requiredOption('-f, --file <path>', 'Path to the bank CSV file')
  .option('--non-interactive', 'Fail if any item needs review (CI mode)', false)
  .option('--json', 'Output JSON instead of a table', false)
  .option('--db-path <path>', 'Path to the SQLite database', 'accounting.db')
  .action(async (options: { file: string; nonInteractive: boolean; json: boolean; dbPath: string }) => {
    const resolvedDb = path.resolve(options.dbPath);
    const db = getDb(resolvedDb);

    const migrationCheck = assertMigrated(db, resolvedDb);
    if (migrationCheck.isFailure) {
      process.stderr.write(`error: ${migrationCheck.error}\n`);
      process.exit(2);
    }

    const configService = new FileConfigService({ projectDir: process.cwd() });
    const csvParser = new NodeCsvParser();
    const hashRepo = new SqliteHashRepository(db);
    const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
    const transactionBuilder = new TransactionBuilder([], undefined, nodeUuidGen);
    const transactionRepository = new SqliteTransactionRepository(db);
    const snapshotService = new NodeSqliteSnapshotService(db);

    await runIngestCommand(
      { file: options.file, nonInteractive: options.nonInteractive, json: options.json },
      {
        configService,
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
