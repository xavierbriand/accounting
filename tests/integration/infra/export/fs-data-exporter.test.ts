/**
 * Integration tests for FsDataExporter — counts() and the CSV/JSON bundle-content
 * writers (story-4.5b, R2 surface). Real SQLite + real tmp dirs.
 *
 * Manifest hashing, `.partial` atomic rename, permissions, and exists-refusal are
 * a separate slice (tests/integration/infra/export/fs-data-exporter-atomicity.test.ts)
 * — P3/R13 plan finding #15 (docs/plans/story-4.5b.md § Suggestion log).
 *
 * Gherkin coverage: none directly — underpins tests/features/export.feature's
 *   bundle-fidelity scenario (invariant 9, model note).
 *
 * fails if: counts() miscounts, a CSV writer drops/reorders/mangles a row (hostile
 *   description fixtures — commas/quotes/newlines), the idempotency_hash column is
 *   dropped, domain-events.json omits recorded_at, or the accounting.yaml copy is
 *   not byte-identical to the source.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteTransactionRepository } from '../../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../../../../src/infra/db/repositories/sqlite-domain-event-recorder.js';
import { Transaction } from '../../../../src/core/ledger/transaction.js';
import { Money } from '../../../../src/core/shared/money.js';
import { FsDataExporter } from '../../../../src/infra/export/fs-data-exporter.js';

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-data-exporter-'));
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

function seedTransaction(db: Database.Database, id: string, description: string): void {
  const repo = new SqliteTransactionRepository(db);
  const transaction = Transaction.create({
    id,
    occurredAt: '2026-04-21T14:30:00+02:00',
    description,
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
  fs.writeFileSync(yamlPath, 'dbPath: ./test.db\ndefaultCurrency: EUR\ntimezone: Europe/Paris\n', 'utf8');
  return yamlPath;
}

describe('FsDataExporter.counts()', () => {
  it('counts transactions and domain events in the DB', () => {
    const { db, dbPath } = setUpDb();
    seedTransaction(db, 'tx-1', 'Groceries');
    seedTransaction(db, 'tx-2', 'Rent');
    const recorder = new SqliteDomainEventRecorder(db);
    recorder.record({ type: 'TransactionIngested', transactionIds: ['tx-1', 'tx-2'], sourceAccount: 'main-account' });

    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const result = exporter.counts();

    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual({ transactions: 2, events: 1 });
  });

  it('counts zero for a freshly migrated, empty DB', () => {
    const { db, dbPath } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const result = exporter.counts();

    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual({ transactions: 0, events: 0 });
  });
});

describe('FsDataExporter.writeBundle() — content writers', () => {
  it('writes transactions.csv row-for-row equal to the DB, including idempotency_hash', async () => {
    const { db, dbPath } = setUpDb();
    seedTransaction(db, 'tx-1', 'Rent, March payment');
    seedTransaction(db, 'tx-2', 'Refund for "broken" item');
    seedTransaction(db, 'tx-3', 'Multi-line\nmemo entry');

    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'test-bundle');
    expect(result.isSuccess, `writeBundle failed: ${result.isFailure ? result.error : ''}`).toBe(true);

    const bundleDir = path.join(outDir, 'test-bundle');
    const dbRows = db.prepare(
      'SELECT id, occurred_at, description, created_at, idempotency_hash, corrects_id, kind FROM transactions ORDER BY rowid',
    ).all() as Array<Record<string, unknown>>;
    const csvRows = csvParse(fs.readFileSync(path.join(bundleDir, 'transactions.csv'), 'utf8'), { columns: true }) as Array<Record<string, string>>;

    expect(csvRows).toHaveLength(3);
    for (let i = 0; i < dbRows.length; i++) {
      expect(csvRows[i]['id']).toBe(dbRows[i]['id']);
      expect(csvRows[i]['description']).toBe(dbRows[i]['description']);
      expect(csvRows[i]['idempotency_hash']).toBe(dbRows[i]['idempotency_hash']);
      expect(csvRows[i]['kind']).toBe(dbRows[i]['kind']);
    }
  });

  // Correction rows are saved via saveCorrection(), which leaves idempotency_hash SQL NULL
  // (and sets corrects_id) — the one production path that exercises the NULL→'' CSV mapping.
  it('represents NULL idempotency_hash/corrects_id (correction rows) as empty CSV fields', async () => {
    const { db, dbPath } = setUpDb();
    seedTransaction(db, 'tx-1', 'Groceries, original');
    const repo = new SqliteTransactionRepository(db);
    const reversal = Transaction.create({
      id: 'tx-rev',
      occurredAt: '2026-04-21T14:30:00+02:00',
      description: 'Reversal of tx-1',
      kind: 'reversal',
      correctsId: 'tx-1',
      entries: [
        { account: 'Assets:Bank:main-account', side: 'debit', amount: makeEur(2500) },
        { account: 'Expense:Groceries', side: 'credit', amount: makeEur(2500) },
      ],
    }).value;
    const correcting = Transaction.create({
      id: 'tx-corr',
      occurredAt: '2026-04-21T14:30:00+02:00',
      description: 'Corrected groceries',
      kind: 'correcting',
      correctsId: 'tx-1',
      entries: [
        { account: 'Expense:Groceries', side: 'debit', amount: makeEur(2400) },
        { account: 'Assets:Bank:main-account', side: 'credit', amount: makeEur(2400) },
      ],
    }).value;
    const saved = repo.saveCorrection(reversal, correcting);
    if (saved.isFailure) throw new Error(`fixture saveCorrection failed: ${saved.error}`);

    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'null-hash-bundle');
    expect(result.isSuccess).toBe(true);

    const csvRows = csvParse(
      fs.readFileSync(path.join(outDir, 'null-hash-bundle', 'transactions.csv'), 'utf8'),
      { columns: true },
    ) as Array<Record<string, string>>;

    expect(csvRows).toHaveLength(3);
    const byId = new Map(csvRows.map((r) => [r['id'], r]));
    expect(byId.get('tx-rev')?.['idempotency_hash']).toBe('');
    expect(byId.get('tx-corr')?.['idempotency_hash']).toBe('');
    expect(byId.get('tx-rev')?.['corrects_id']).toBe('tx-1');
    expect(byId.get('tx-1')?.['corrects_id']).toBe('');
    expect(byId.get('tx-1')?.['idempotency_hash']).toBe('fixture-hash-tx-1');
  });

  // Guards the config_state exclusion (contract § Export bundle format): the bundle holds
  // exactly the five documented files — a sixth appearing means something leaked.
  it('the bundle contains exactly the five documented files, and nothing else', async () => {
    const { db, dbPath } = setUpDb();
    seedTransaction(db, 'tx-1', 'Plain row');

    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'exact-files-bundle');
    expect(result.isSuccess).toBe(true);

    const entries = fs.readdirSync(path.join(outDir, 'exact-files-bundle')).sort();
    expect(entries).toEqual([
      'accounting.yaml',
      'domain-events.json',
      'manifest.json',
      'transaction-entries.csv',
      'transactions.csv',
    ]);
  });

  it('writes transaction-entries.csv row-for-row equal to the DB', async () => {
    const { db, dbPath } = setUpDb();
    seedTransaction(db, 'tx-1', 'Groceries');

    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'test-bundle');
    expect(result.isSuccess).toBe(true);

    const bundleDir = path.join(outDir, 'test-bundle');
    const dbEntries = db.prepare('SELECT transaction_id, account, side, amount_cents, currency FROM transaction_entries ORDER BY id').all() as Array<Record<string, unknown>>;
    const csvEntries = csvParse(fs.readFileSync(path.join(bundleDir, 'transaction-entries.csv'), 'utf8'), { columns: true }) as Array<Record<string, string>>;

    expect(csvEntries).toHaveLength(2);
    for (let i = 0; i < dbEntries.length; i++) {
      expect(csvEntries[i]['transaction_id']).toBe(dbEntries[i]['transaction_id']);
      expect(csvEntries[i]['account']).toBe(dbEntries[i]['account']);
      expect(csvEntries[i]['side']).toBe(dbEntries[i]['side']);
      expect(Number(csvEntries[i]['amount_cents'])).toBe(dbEntries[i]['amount_cents']);
      expect(csvEntries[i]['currency']).toBe(dbEntries[i]['currency']);
    }
  });

  it('writes domain-events.json as an array including recorded_at, verbatim from the DB', async () => {
    const { db, dbPath } = setUpDb();
    const recorder = new SqliteDomainEventRecorder(db);
    recorder.record({ type: 'TransactionIngested', transactionIds: ['tx-1'], sourceAccount: 'main-account' });

    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'test-bundle');
    expect(result.isSuccess).toBe(true);

    const bundleDir = path.join(outDir, 'test-bundle');
    const dbEvents = db.prepare('SELECT seq, event_type, recorded_at, payload FROM domain_events ORDER BY seq').all() as Array<{
      seq: number; event_type: string; recorded_at: string; payload: string;
    }>;
    const jsonEvents = JSON.parse(fs.readFileSync(path.join(bundleDir, 'domain-events.json'), 'utf8')) as Array<{
      seq: number; type: string; recordedAt: string; transactionIds: string[]; sourceAccount: string;
    }>;

    expect(jsonEvents).toHaveLength(1);
    expect(jsonEvents[0].seq).toBe(dbEvents[0].seq);
    expect(jsonEvents[0].type).toBe(dbEvents[0].event_type);
    expect(jsonEvents[0].recordedAt).toBe(dbEvents[0].recorded_at);
    expect(jsonEvents[0].transactionIds).toEqual(['tx-1']);
    expect(jsonEvents[0].sourceAccount).toBe('main-account');
  });

  it('copies accounting.yaml byte-verbatim', async () => {
    const { db, dbPath } = setUpDb();
    const yamlPath = writeYaml(path.dirname(dbPath));
    const originalBytes = fs.readFileSync(yamlPath);

    const exporter = new FsDataExporter(db, yamlPath);
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'test-bundle');
    expect(result.isSuccess).toBe(true);

    const bundleDir = path.join(outDir, 'test-bundle');
    const copiedBytes = fs.readFileSync(path.join(bundleDir, 'accounting.yaml'));
    expect(copiedBytes.equals(originalBytes)).toBe(true);
  });

  it('resolves with the bundle location', async () => {
    const { db, dbPath } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'test-bundle');

    expect(result.isSuccess).toBe(true);
    expect(result.value.location).toBe(path.join(outDir, 'test-bundle'));
  });

  // Plan § Gherkin acceptance scenarios: "Empty-ledger export — bundle with
  // header-only CSVs, zero counts — covered at unit/integration tier" (§ 6.6 sizing).
  it('writes header-only CSVs, an empty events array, and zero manifest counts for a freshly migrated, empty DB', async () => {
    const { db, dbPath } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(path.dirname(dbPath)));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'empty-bundle');
    expect(result.isSuccess, `writeBundle failed: ${result.isFailure ? result.error : ''}`).toBe(true);

    const bundleDir = path.join(outDir, 'empty-bundle');
    const txRows = csvParse(fs.readFileSync(path.join(bundleDir, 'transactions.csv'), 'utf8'), { columns: true }) as unknown[];
    const entryRows = csvParse(fs.readFileSync(path.join(bundleDir, 'transaction-entries.csv'), 'utf8'), { columns: true }) as unknown[];
    const events = JSON.parse(fs.readFileSync(path.join(bundleDir, 'domain-events.json'), 'utf8')) as unknown[];
    const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8')) as { counts: { transactions: number; events: number } };

    const txHeader = fs.readFileSync(path.join(bundleDir, 'transactions.csv'), 'utf8').trim();
    expect(txHeader).toBe('id,occurred_at,description,created_at,idempotency_hash,corrects_id,kind');
    expect(txRows).toHaveLength(0);
    expect(entryRows).toHaveLength(0);
    expect(events).toEqual([]);
    expect(manifest.counts).toEqual({ transactions: 0, events: 0 });
  });
});
