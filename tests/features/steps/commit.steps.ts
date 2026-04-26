import { expect, afterEach } from 'vitest';
import { When, Then } from 'quickpickle';
import fs from 'fs';
import { PassThrough } from 'stream';
import Database from 'better-sqlite3';
import { FileConfigService } from '../../../src/infra/config/config-service.js';
import { NodeCsvParser } from '../../../src/infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../../../src/core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../../../src/core/ingest/transaction-builder.js';
import { SqliteHashRepository } from '../../../src/infra/db/repositories/sqlite-hash-repository.js';
import { SqliteTransactionRepository } from '../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { NodeSqliteSnapshotService } from '../../../src/infra/db/node-sqlite-snapshot-service.js';
import { nodeHashFn } from '../../../src/infra/crypto/node-hash-fn.js';
import { nodeUuidGen } from '../../../src/infra/crypto/node-uuid-gen.js';
import { pickSourceAccount } from '../../../src/infra/fs/pick-source-account.js';
import { readBpceCsv } from '../../../src/infra/fs/read-bpce-csv.js';
import { runIngestCommand } from '../../../src/cli/commands/ingest-command.js';
import { Result } from '../../../src/core/shared/result.js';
import type { BatchWriteOutcome } from '../../../src/core/ports/transaction-repository.js';

// CommitWorld stores state shared across step definitions for commit.feature.
// lastResult uses the same shape as IngestWorld so the shared Then steps
// registered in ingest.steps.ts ('the process exits with code', 'stderr contains')
// can read from it.
interface CommitWorld {
  tmpDir?: string;
  csvPath?: string;
  dbPath?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

async function runIngestInProcess(
  state: CommitWorld,
  saveBatchOverride?: { saveBatch: (outcomes: Parameters<SqliteTransactionRepository['saveBatch']>[0]) => ReturnType<SqliteTransactionRepository['saveBatch']> },
): Promise<void> {
  // Uses runIngestCommand in-process with an auto-confirm prompter.
  // Inquirer's `select` requires a TTY; piped stdin can't drive it. In-process
  // invocation with a mocked prompter is the deterministic equivalent.
  const db = new Database(state.dbPath!);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const configService = new FileConfigService({ projectDir: state.tmpDir! });
  const csvParser = new NodeCsvParser();
  const hashRepo = new SqliteHashRepository(db);
  const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
  const transactionBuilderFactory = (accounts: ConstructorParameters<typeof TransactionBuilder>[0]) =>
    new TransactionBuilder(accounts, undefined, nodeUuidGen);
  const realRepo = new SqliteTransactionRepository(db);
  const transactionRepository = saveBatchOverride ?? realRepo;
  const snapshotService = new NodeSqliteSnapshotService(db);

  const stdoutSink = new PassThrough();
  stdoutSink.resume();

  const stderrChunks: Buffer[] = [];
  const stderrCapture = new PassThrough();
  stderrCapture.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  stderrCapture.resume();

  let capturedExitCode = 0;

  await runIngestCommand(
    { file: state.csvPath!, nonInteractive: false, json: false },
    {
      configService,
      csvParser,
      idempotencyService,
      transactionBuilder: transactionBuilderFactory,
      pickSourceAccount,
      readFile: readBpceCsv,
      prompt: {
        selectCategory: () => Promise.resolve({ action: 'keep' }),
        confirmBatch: () => Promise.resolve(true),
      },
      stdout: stdoutSink,
      stderr: stderrCapture,
      exitCode: (code: number) => { capturedExitCode = code; },
      transactionRepository,
      snapshotService,
      dbPath: state.dbPath!,
    },
  );

  db.close();
  state.lastResult = {
    status: capturedExitCode,
    stdout: '',
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
  };
}

When('I run ingest interactively with auto-confirm', async function (state: CommitWorld) {
  await runIngestInProcess(state);
});

When('I run ingest interactively and the database commit fails', async function (state: CommitWorld) {
  // Simulates a UNIQUE constraint on idempotency_hash — the real DB-level error
  // the production path produces — without requiring a DB-level collision setup.
  // (A DB-level collision would be filtered by the idempotency check before reaching
  // saveBatch, so the only reliable way to test the rollback/snapshot-retained path
  // is to inject a failing repo at the BDD layer.)
  const FAKE_HASH = 'a'.repeat(64);
  const failingRepo = {
    saveBatch: () =>
      Result.fail<BatchWriteOutcome>(
        `SqliteError: UNIQUE constraint failed: transactions.idempotency_hash (hash: ${FAKE_HASH})`,
      ),
  };
  await runIngestInProcess(state, failingRepo);
});

Then('the DB holds {int} transactions', function (state: CommitWorld, count: number) {
  const db = new Database(state.dbPath!);
  const row = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get() as { cnt: number };
  db.close();
  expect(row.cnt).toBe(count);
});

Then('no snapshot file exists after success', function (state: CommitWorld) {
  const snapPath = state.dbPath! + '.bak';
  expect(fs.existsSync(snapPath)).toBe(false);
});

Then('a snapshot file exists after failure', function (state: CommitWorld) {
  const snapPath = state.dbPath! + '.bak';
  expect(fs.existsSync(snapPath)).toBe(true);
});

Then('stderr contains no raw idempotency hash \\(no 64-char hex token\\)', function (state: CommitWorld) {
  // A SHA-256 hex digest is exactly 64 lowercase hex characters.
  // sanitizeSqlError redacts these from SQLite error messages per security-checklist.md.
  const hexPattern = /\b[0-9a-f]{64}\b/;
  expect(hexPattern.test(state.lastResult!.stderr)).toBe(false);
});
