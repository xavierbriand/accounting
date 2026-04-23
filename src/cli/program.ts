import { Command } from 'commander';
import path from 'path';
import { getDb } from '../infra/db/sqlite-client.js';
import { FileConfigService } from '../infra/config/config-service.js';
import { NodeCsvParser } from '../infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../core/ingest/transaction-builder.js';
import { SqliteHashRepository } from '../infra/db/repositories/sqlite-hash-repository.js';
import { nodeHashFn } from '../infra/crypto/node-hash-fn.js';
import { nodeUuidGen } from '../infra/crypto/node-uuid-gen.js';
import { pickSourceAccount } from '../infra/fs/pick-source-account.js';
import { readBpceCsv } from '../infra/fs/read-bpce-csv.js';
import { inquirerPrompter } from './utils/interactive.js';
import { runIngestCommand } from './commands/ingest-command.js';
import { runMigrate } from './migrate.js';

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
    const configService = new FileConfigService({ projectDir: process.cwd() });
    const csvParser = new NodeCsvParser();
    const hashRepo = new SqliteHashRepository(db);
    const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
    const transactionBuilder = new TransactionBuilder([], undefined, nodeUuidGen);

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
      },
    );
  });

program.parse(process.argv);
