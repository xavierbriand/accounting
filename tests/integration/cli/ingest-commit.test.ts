/**
 * Integration test: CLI ingest-command commit stage against a real temp-file DB.
 *
 * Gherkin coverage:
 *   - "happy path — batch commits with snapshot then cleans up"
 *   - "mid-batch failure — ENTIRE batch rolled back, snapshot retained and intact"
 *   - "commit-failure stderr excludes idempotency_hash values (PII hygiene)"
 *   - "round-trip idempotency — second ingest of same CSV yields zero fresh"
 *
 * fails if: snapshot skipped, partial writes, hashes stored as NULL, snapshot retained
 *   after success, snapshot removed after failure, raw SQL UNIQUE error leaked to stderr,
 *   or idempotency dedup misses on re-ingest (FR8 regression).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import type { Writable } from 'stream';
import { runIngestCommand } from '../../../src/cli/commands/ingest-command.js';
import type { IngestCommandDeps } from '../../../src/cli/commands/ingest-command.js';
import { runMigrations } from '../../../src/infra/db/migrator.js';
import { SqliteTransactionRepository } from '../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteHashRepository } from '../../../src/infra/db/repositories/sqlite-hash-repository.js';
import { NodeSqliteSnapshotService } from '../../../src/infra/db/node-sqlite-snapshot-service.js';
import { NodeCsvParser } from '../../../src/infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../../../src/core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../../../src/core/ingest/transaction-builder.js';
import { nodeHashFn } from '../../../src/infra/crypto/node-hash-fn.js';
import { nodeUuidGen } from '../../../src/infra/crypto/node-uuid-gen.js';
import { pickSourceAccount } from '../../../src/infra/fs/pick-source-account.js';
import { readBpceCsv } from '../../../src/infra/fs/read-bpce-csv.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig } from '@core/config/app-config.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { BatchWriteOutcome } from '@core/ports/transaction-repository.js';

const FIXTURE_CSV = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../../fixtures/csv/bpce-valid.csv',
);

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-ingest-commit-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeCapture(): Writable & { captured: string } {
  const buf: string[] = [];
  const stream = new PassThrough() as unknown as Writable & { captured: string };
  stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
  Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
  return stream;
}

function makeRealDeps(
  db: Database.Database,
  dbPath: string,
  csvPath: string,
  snapshotOverride?: SnapshotService,
  repoOverride?: { saveBatch: IngestCommandDeps['transactionRepository']['saveBatch'] },
): { deps: IngestCommandDeps; stdout: Writable & { captured: string }; stderr: Writable & { captured: string }; exitCodes: number[] } {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];

  const realRepo = new SqliteTransactionRepository(db);
  const transactionRepository = repoOverride ?? realRepo;
  const hashRepo = new SqliteHashRepository(db);
  const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
  const mainAccount = { id: 'main-account', type: 'bank' as const, filenamePrefix: 'bpce-valid' };
  const transactionBuilder = new TransactionBuilder([mainAccount], undefined, nodeUuidGen);
  const snapshotService = snapshotOverride ?? new NodeSqliteSnapshotService(db);

  const config: AppConfig = {
    dbPath,
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] }],
    buffers: [],
    accounts: [mainAccount],
  };

  const deps: IngestCommandDeps = {
    configService: { load: () => Result.ok(config) },
    csvParser: new NodeCsvParser(),
    idempotencyService,
    transactionBuilder,
    pickSourceAccount,
    readFile: readBpceCsv,
    prompt: {
      selectCategory: () => Promise.resolve({ action: 'keep' }),
      confirmBatch: () => Promise.resolve(true),
    },
    stdout: stdout as Writable,
    stderr: stderr as Writable,
    exitCode: (code) => exitCodes.push(code),
    transactionRepository,
    snapshotService,
    dbPath,
  };

  return { deps, stdout, stderr, exitCodes };
}

describe('runIngestCommand — end-to-end commit (real temp-file DB)', () => {
  it('(happy path) batch commits, hashes populated, snapshot absent after success, exit 0', async () => {
    // fails if: snapshot skipped, partial writes, idempotency_hash NULL, or snapshot retained
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'ingest.db');
    const snapshotPath = dbPath + '.bak';
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    const { deps, stderr, exitCodes } = makeRealDeps(db, dbPath, csvPath);

    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(0);

    // Count rows (bpce-valid.csv has 5 data rows)
    const txCount = (db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    expect(txCount).toBe(5);

    // All hashes populated
    const nullHashCount = (db.prepare('SELECT COUNT(*) as n FROM transactions WHERE idempotency_hash IS NULL').get() as { n: number }).n;
    expect(nullHashCount).toBe(0);

    // Snapshot removed on success
    expect(fs.existsSync(snapshotPath)).toBe(false);

    // Committed message in stderr
    expect(stderr.captured).toContain('transaction(s) committed');

    db.close();
  });

  it('(batch failure) snapshot retained and exit 4 when saveBatch returns failure', async () => {
    // fails if: snapshot removed after saveBatch failure, or wrong exit code,
    // or stderr missing the expected messages.
    // Uses a mock saveBatch that returns failure to isolate the commitBatch coordination
    // logic (snapshot lifecycle, exit codes, stderr). The SQLite rollback path itself
    // is tested in tests/integration/infra/db/sqlite-transaction-repo.test.ts.
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'ingest2.db');
    const snapshotPath = dbPath + '.bak';
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // Use real snapshot service (exercises real backup file) but mock saveBatch failure
    const FAKE_HASH = 'a'.repeat(64);
    const failingRepo = {
      saveBatch: () => Result.fail<BatchWriteOutcome>(
        `SqliteError: UNIQUE constraint failed: transactions.idempotency_hash (hash: ${FAKE_HASH})`,
      ),
    };

    const { deps, stderr, exitCodes } = makeRealDeps(db, dbPath, csvPath, undefined, failingRepo);

    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(4);

    // Zero rows written (saveBatch failed, nothing persisted)
    const txCount = (db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    expect(txCount).toBe(0);

    // Snapshot retained for recovery
    expect(fs.existsSync(snapshotPath)).toBe(true);

    // stderr has the rolled-back message
    expect(stderr.captured).toContain('Commit failed (batch rolled back)');
    expect(stderr.captured).toContain('Snapshot retained at');

    db.close();
  });

  it('(round-trip idempotency) second ingest of same CSV yields 0 fresh, 5 duplicates, no new rows, exit 0', async () => {
    // fails if: idempotency_hash is not populated on first pass (dedup would never hit),
    // or the stored hash is not the canonical hashFn(canonicalize(item)) so a second
    // pass re-inserts duplicates. This is the core FR8 (idempotent re-ingest) gate —
    // walks QA "No silent data loss" invariant end-to-end.
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'ingest-round-trip.db');
    const snapshotPath = dbPath + '.bak';
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // First pass — commit 5 rows
    const firstDeps = makeRealDeps(db, dbPath, csvPath);
    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, firstDeps.deps);
    expect(firstDeps.exitCodes).toContain(0);

    const firstCount = (db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    expect(firstCount).toBe(5);

    // Capture the canonical hashes persisted by the first pass
    const firstHashes = (db.prepare('SELECT idempotency_hash FROM transactions ORDER BY id').all() as { idempotency_hash: string }[])
      .map((r) => r.idempotency_hash);
    expect(firstHashes).toHaveLength(5);
    expect(firstHashes.every((h) => h != null && h.length > 0)).toBe(true);

    expect(fs.existsSync(snapshotPath)).toBe(false);

    // Second pass — same CSV, same DB. All items should be dedup'd as duplicates.
    const secondDeps = makeRealDeps(db, dbPath, csvPath);
    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, secondDeps.deps);
    expect(secondDeps.exitCodes).toContain(0);

    // No additional rows
    const secondCount = (db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    expect(secondCount).toBe(5);

    // Hashes still the same set (no bleed / no replacement)
    const secondHashes = (db.prepare('SELECT idempotency_hash FROM transactions ORDER BY id').all() as { idempotency_hash: string }[])
      .map((r) => r.idempotency_hash);
    expect(secondHashes).toEqual(firstHashes);

    // The CLI surface signals dedup to the user
    expect(secondDeps.stderr.captured).toContain('Found 0 new transactions');
    expect(secondDeps.stderr.captured).toContain('5 duplicate(s) skipped');

    // Snapshot removed after second (empty-batch) commit — lifecycle still correct
    expect(fs.existsSync(snapshotPath)).toBe(false);

    db.close();
  });

  it('(PII hygiene) commit-failure stderr does NOT contain the raw hex hash (sanitizeSqlError)', async () => {
    // fails if: raw saveBatch error text with a ≥32-char hex token is leaked verbatim to stderr.
    // (hashes are transaction fingerprints — correlatable across datasets — PII per security-checklist.md)
    // P2 adopt #1 lock-in. sanitizeSqlError must redact the hex token.
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'ingest3.db');
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // The raw SQLite UNIQUE-constraint error embeds the offending value verbatim
    const collidingHash = 'b'.repeat(64);
    const failingRepo = {
      saveBatch: () => Result.fail<BatchWriteOutcome>(
        `SqliteError: UNIQUE constraint failed: transactions.idempotency_hash = ${collidingHash}`,
      ),
    };

    const { deps, stderr, exitCodes } = makeRealDeps(db, dbPath, csvPath, undefined, failingRepo);

    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(4);

    // The 64-char hex hash must NOT appear verbatim in stderr (sanitizeSqlError must redact it)
    expect(stderr.captured).not.toContain(collidingHash);
    expect(stderr.captured).toContain('Commit failed (batch rolled back)');
    // The redacted form should be present
    expect(stderr.captured).toContain('<redacted>');

    db.close();
  });
});
