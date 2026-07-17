/**
 * Integration tests for verifyBundle — export-proof re-verification (story-4.5c,
 * R2 surface). Real SQLite (via the shipped FsDataExporter) + real tmp dirs, so
 * every fixture bundle is a genuine one produced by the same writer dissolve
 * will point at in production, never a hand-rolled stand-in.
 *
 * Gherkin coverage: underpins tests/features/dissolve.feature's tampered-bundle
 *   and stale-bundle scenarios (the missing-dir/missing-manifest refusals below
 *   are unit/integration-tier only per the plan — no acceptance scenario for
 *   those two).
 *
 * fails if: a per-file SHA-256 mismatch is not detected, the manifest hash is
 *   computed from anything other than manifest.json's own bytes on disk, a
 *   missing bundle dir or missing manifest.json is not refused, or lastEvent
 *   is read from anywhere other than the verified domain-events.json.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteTransactionRepository } from '../../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../../../../src/infra/db/repositories/sqlite-domain-event-recorder.js';
import { Transaction } from '../../../../src/core/ledger/transaction.js';
import { Money } from '../../../../src/core/shared/money.js';
import { FsDataExporter } from '../../../../src/infra/export/fs-data-exporter.js';
import { verifyBundle } from '../../../../src/infra/export/bundle-verifier.js';

const tmpDirs: string[] = [];
const dbs: Database.Database[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-verifier-'));
  tmpDirs.push(dir);
  return dir;
}

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function setUpDb(): { db: Database.Database; dbPath: string } {
  const tmpDir = makeTmpDir();
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbs.push(db);
  return { db, dbPath };
}

function seedTransaction(db: Database.Database, id: string): void {
  const repo = new SqliteTransactionRepository(db);
  const transaction = Transaction.create({
    id,
    occurredAt: '2026-04-21T14:30:00+02:00',
    description: 'Groceries',
    entries: [
      { account: 'Expense:Groceries', side: 'debit', amount: makeEur(2500) },
      { account: 'Assets:Bank:main-account', side: 'credit', amount: makeEur(2500) },
    ],
  }).value;
  const result = repo.save(transaction, `fixture-hash-${id}`);
  if (result.isFailure) throw new Error(`fixture save failed: ${result.error}`);
}

function writeYaml(tmpDir: string): string {
  const yamlPath = path.join(tmpDir, 'accounting.yaml');
  fs.writeFileSync(yamlPath, 'dbPath: ./test.db\n', 'utf8');
  return yamlPath;
}

async function buildRealBundle(withEvents: boolean): Promise<{ bundleDir: string; dbPath: string }> {
  const { db, dbPath } = setUpDb();
  if (withEvents) {
    seedTransaction(db, 'tx-1');
    const recorder = new SqliteDomainEventRecorder(db);
    const recordResult = recorder.record({ type: 'TransactionIngested', transactionIds: ['tx-1'], sourceAccount: 'main-account' });
    if (recordResult.isFailure) throw new Error(`fixture record failed: ${recordResult.error}`);
  }
  const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
  const outDir = makeTmpDir();
  const result = await exporter.writeBundle(outDir, 'test-bundle');
  if (result.isFailure) throw new Error(`fixture writeBundle failed: ${result.error}`);
  return { bundleDir: result.value.location, dbPath };
}

function sha256OfFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('verifyBundle — happy path', () => {
  it('returns the manifest hash, counts, and lastEvent for a genuine bundle', async () => {
    const { bundleDir } = await buildRealBundle(true);

    const result = await verifyBundle(bundleDir);

    expect(result.isSuccess, `verifyBundle failed: ${result.isFailure ? result.error : ''}`).toBe(true);
    expect(result.value.manifestHash).toBe(sha256OfFile(path.join(bundleDir, 'manifest.json')));
    expect(result.value.counts).toEqual({ transactions: 1, events: 1 });
    expect(result.value.lastEvent).not.toBeNull();
    expect(result.value.lastEvent?.type).toBe('TransactionIngested');
    expect(typeof result.value.lastEvent?.seq).toBe('number');
    expect(typeof result.value.lastEvent?.recordedAt).toBe('string');
  });

  it('returns lastEvent: null for a bundle whose domain-events.json is an empty array', async () => {
    const { bundleDir } = await buildRealBundle(false);

    const result = await verifyBundle(bundleDir);

    expect(result.isSuccess).toBe(true);
    expect(result.value.lastEvent).toBeNull();
    expect(result.value.counts).toEqual({ transactions: 0, events: 0 });
  });
});

describe('verifyBundle — refusals', () => {
  it('fails when the bundle directory does not exist', async () => {
    const missing = path.join(makeTmpDir(), 'does-not-exist');

    const result = await verifyBundle(missing);

    expect(result.isFailure).toBe(true);
  });

  it('fails when the bundle path is a file, not a directory', async () => {
    const tmpDir = makeTmpDir();
    const filePath = path.join(tmpDir, 'not-a-dir');
    fs.writeFileSync(filePath, 'nope', 'utf8');

    const result = await verifyBundle(filePath);

    expect(result.isFailure).toBe(true);
  });

  it('fails when manifest.json is missing', async () => {
    const { bundleDir } = await buildRealBundle(true);
    fs.unlinkSync(path.join(bundleDir, 'manifest.json'));

    const result = await verifyBundle(bundleDir);

    expect(result.isFailure).toBe(true);
    expect(result.error.toLowerCase()).toContain('manifest');
  });

  it('fails when manifest.json is not valid JSON', async () => {
    const { bundleDir } = await buildRealBundle(true);
    fs.writeFileSync(path.join(bundleDir, 'manifest.json'), 'not json{{{', 'utf8');

    const result = await verifyBundle(bundleDir);

    expect(result.isFailure).toBe(true);
  });

  it('fails naming the file when a byte is appended to transactions.csv after export', async () => {
    const { bundleDir } = await buildRealBundle(true);
    fs.appendFileSync(path.join(bundleDir, 'transactions.csv'), 'X');

    const result = await verifyBundle(bundleDir);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('transactions.csv');
  });

  it('fails when a manifest-listed file is missing from the bundle', async () => {
    const { bundleDir } = await buildRealBundle(true);
    fs.unlinkSync(path.join(bundleDir, 'domain-events.json'));

    const result = await verifyBundle(bundleDir);

    expect(result.isFailure).toBe(true);
  });
});
