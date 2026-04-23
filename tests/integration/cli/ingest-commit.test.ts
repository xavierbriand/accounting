/**
 * Integration test: CLI ingest-command commit stage against a real temp-file DB.
 *
 * Gherkin coverage:
 *   - "happy path — batch commits with snapshot then cleans up"
 *   - "mid-batch failure — ENTIRE batch rolled back, snapshot retained and intact"
 *   - "commit-failure stderr excludes idempotency_hash values (PII hygiene)"
 *
 * fails if: snapshot skipped, partial writes, hashes stored as NULL, snapshot retained
 *   after success, snapshot removed after failure, or raw SQL UNIQUE error leaked to stderr.
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
import type { BuildOutcome } from '@core/ingest/types.js';

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
  const stream = new PassThrough() as Writable & { captured: string };
  stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
  Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
  return stream;
}

function makeRealDeps(
  db: Database.Database,
  dbPath: string,
  csvPath: string,
  snapshotOverride?: SnapshotService,
): { deps: IngestCommandDeps; stdout: Writable & { captured: string }; stderr: Writable & { captured: string }; exitCodes: number[] } {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];

  const repo = new SqliteTransactionRepository(db);
  const hashRepo = new SqliteHashRepository(db);
  const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
  const mainAccount = { id: 'main-account', type: 'bank' as const, filenamePrefix: 'bpce-valid' };
  const transactionBuilder = new TransactionBuilder([mainAccount], undefined, nodeUuidGen);
  const snapshotService = snapshotOverride ?? new NodeSqliteSnapshotService(db);

  const config: AppConfig = {
    dbPath,
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    splits: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }],
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
    transactionRepository: { saveBatch: (outcomes) => repo.saveBatch(outcomes) },
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

  it('(batch failure) zero rows written, snapshot retained, exit 4', async () => {
    // fails if: partial write occurs, snapshot removed after failure, or wrong exit code
    // We seed a conflicting hash so the second item causes UNIQUE violation
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'ingest2.db');
    const snapshotPath = dbPath + '.bak';
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // Build real outcomes first to grab a hash
    const csvParser = new NodeCsvParser();
    const hashRepo = new SqliteHashRepository(db);
    const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
    // Provide the account so TransactionBuilder resolves sourceAccount correctly
    const mainAccount = { id: 'main-account', type: 'bank' as const, filenamePrefix: 'bpce-valid' };
    const transactionBuilder = new TransactionBuilder([mainAccount], undefined, nodeUuidGen);

    const rawCsv = fs.readFileSync(FIXTURE_CSV, 'latin1');
    const parseResult = csvParser.parse(rawCsv, { format: 'bpce', currency: 'EUR', timezone: 'Europe/Paris', sourceAccount: 'main-account' });
    expect(parseResult.isSuccess).toBe(true);

    const idempResult = idempotencyService.filterNew(parseResult.value.items);
    expect(idempResult.isSuccess).toBe(true);

    const buildResult = transactionBuilder.buildAll(idempResult.value.fresh);
    expect(buildResult.isSuccess).toBe(true);
    expect(buildResult.value.built.length).toBeGreaterThan(0);

    // Pre-insert the first outcome's hash to force a collision
    const firstOutcome = buildResult.value.built[0] as BuildOutcome;
    db.prepare(
      'INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)',
    ).run('pre-existing', '2026-01-01T00:00:00Z', 'pre-seeded', firstOutcome.idempotencyHash);

    const { deps, stderr, exitCodes } = makeRealDeps(db, dbPath, csvPath);

    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(4);

    // Only the pre-seeded row should exist (batch rolled back)
    const txCount = (db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    expect(txCount).toBe(1);

    // Snapshot retained for recovery
    expect(fs.existsSync(snapshotPath)).toBe(true);

    // stderr has the rolled-back message
    expect(stderr.captured).toContain('Commit failed (batch rolled back)');
    expect(stderr.captured).toContain('Snapshot retained at');

    db.close();
  });

  it('(PII hygiene) commit-failure stderr does NOT contain the raw hex hash (sanitizeSqlError)', async () => {
    // fails if: raw UNIQUE-constraint error text is passed through to stderr verbatim
    // (hashes are transaction fingerprints — correlatable across datasets — PII per security-checklist.md)
    // P2 adopt #1 lock-in
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'ingest3.db');
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    const csvParser = new NodeCsvParser();
    const hashRepo = new SqliteHashRepository(db);
    const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
    const mainAccount = { id: 'main-account', type: 'bank' as const, filenamePrefix: 'bpce-valid' };
    const transactionBuilder = new TransactionBuilder([mainAccount], undefined, nodeUuidGen);

    const rawCsv = fs.readFileSync(FIXTURE_CSV, 'latin1');
    const parseResult = csvParser.parse(rawCsv, { format: 'bpce', currency: 'EUR', timezone: 'Europe/Paris', sourceAccount: 'main-account' });
    const idempResult = idempotencyService.filterNew(parseResult.value.items);
    const buildResult = transactionBuilder.buildAll(idempResult.value.fresh);

    const firstOutcome = buildResult.value.built[0] as BuildOutcome;
    const collidingHash = firstOutcome.idempotencyHash;

    // Pre-plant collision
    db.prepare(
      'INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)',
    ).run('pre-seed-pii', '2026-01-01T00:00:00Z', 'seed', collidingHash);

    const { deps, stderr, exitCodes } = makeRealDeps(db, dbPath, csvPath);

    await runIngestCommand({ file: csvPath, nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(4);

    // The hash (a 64-char hex string) must NOT appear verbatim in stderr
    expect(stderr.captured).not.toContain(collidingHash);
    expect(stderr.captured).toContain('Commit failed (batch rolled back)');

    db.close();
  });
});
