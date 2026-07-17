import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import { SqliteTransactionRepository } from '../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../../../src/infra/db/repositories/sqlite-domain-event-recorder.js';
import { Transaction } from '../../../src/core/ledger/transaction.js';
import { Money } from '../../../src/core/shared/money.js';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';
import { unwrapError, unwrapSuccess } from '../../_helpers/json-envelope.js';

interface ExportWorld {
  tmpDir?: string;
  dbPath?: string;
  outDir?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
  bundleDir?: string;
}

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-export-bdd-'));
  tmpDirs.push(dir);
  return dir;
}

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function insertTransaction(db: Database.Database, id: string, description: string): void {
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
  const saveResult = repo.save(transaction, `fixture-hash-${id}`);
  if (saveResult.isFailure) throw new Error(`fixture save failed: ${saveResult.error}`);
}

function seedFixtureDb(dbPath: string, descriptions: readonly string[]): void {
  const db = new Database(dbPath);
  dbs.push(db);
  descriptions.forEach((description, i) => insertTransaction(db, `tx-fixture-${i + 1}`, description));

  const recorder = new SqliteDomainEventRecorder(db);
  const recordResult = recorder.record({
    type: 'TransactionIngested',
    transactionIds: descriptions.map((_, i) => `tx-fixture-${i + 1}`),
    sourceAccount: 'main-account',
  });
  if (recordResult.isFailure) throw new Error(`fixture event record failed: ${recordResult.error}`);
}

function bundleDirUnder(outDir: string): string {
  const entries = fs.readdirSync(outDir).filter((name) => !name.endsWith('.partial'));
  expect(entries, `expected exactly one bundle dir under ${outDir}, found: ${entries.join(', ')}`).toHaveLength(1);
  return path.join(outDir, entries[0]);
}

function sha256OfFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readManifest(bundleDir: string): {
  schemaVersion: number;
  createdAt: string;
  counts: { transactions: number; events: number };
  files: Array<{ name: string; sha256: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8'));
}

function domainEventRows(dbPath: string): Array<{ seq: number; event_type: string; recorded_at: string; payload: string }> {
  const db = new Database(dbPath);
  dbs.push(db);
  return db.prepare('SELECT seq, event_type, recorded_at, payload FROM domain_events ORDER BY seq').all() as Array<{
    seq: number;
    event_type: string;
    recorded_at: string;
    payload: string;
  }>;
}

Given('a migrated project with ingested transactions and prior audit events', function (state: ExportWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  state.dbPath = path.join(tmpDir, 'test.db');
  writeStubYaml(tmpDir);
  const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
  expect(migrateResult.status, `migrate stderr: ${migrateResult.stderr}`).toBe(0);
  seedFixtureDb(state.dbPath, ['Groceries run', 'Weekly shop']);
});

Given('a migrated project with ingested transactions including hostile description text', function (state: ExportWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  state.dbPath = path.join(tmpDir, 'test.db');
  writeStubYaml(tmpDir);
  const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
  expect(migrateResult.status, `migrate stderr: ${migrateResult.stderr}`).toBe(0);
  seedFixtureDb(state.dbPath, [
    'Rent, March payment',
    'Refund for "broken" item',
    'Multi-line\nmemo entry',
    'Combo, "quoted"\nand newline',
  ]);
});

Given('an out directory that cannot be written', function (state: ExportWorld) {
  // A plain file sitting at the --out path makes directory creation fail
  // (ENOTDIR/EEXIST) regardless of the test runner's uid — robust under root,
  // unlike a chmod-based permission-denied fixture.
  const blocked = path.join(state.tmpDir!, 'blocked-out');
  fs.writeFileSync(blocked, 'not a directory', 'utf8');
  state.outDir = blocked;
});

When('the user runs export with an out directory', function (state: ExportWorld) {
  state.outDir = path.join(state.tmpDir!, 'exports');
  state.lastResult = spawnCli(['export', '--out', state.outDir], { cwd: state.tmpDir });
  if (state.lastResult.status === 0) {
    state.bundleDir = bundleDirUnder(state.outDir);
  }
});

When('the user runs export with json output against that out directory', function (state: ExportWorld) {
  state.lastResult = spawnCli(['export', '--out', state.outDir!, '--json'], { cwd: state.tmpDir });
});

Then('the bundle directory contains {string}, {string}, {string}, {string}, and {string}', function (
  state: ExportWorld,
  f1: string,
  f2: string,
  f3: string,
  f4: string,
  f5: string,
) {
  const names = fs.readdirSync(state.bundleDir!).sort();
  expect(names).toEqual([f1, f2, f3, f4, f5].sort());
});

Then('every file named in the manifest has a matching SHA-256 checksum', function (state: ExportWorld) {
  const manifest = readManifest(state.bundleDir!);
  expect(manifest.files.length).toBeGreaterThan(0);
  for (const entry of manifest.files) {
    expect(sha256OfFile(path.join(state.bundleDir!, entry.name))).toBe(entry.sha256);
  }
});

Then('stdout prints the bundle location and the manifest\'s SHA-256 as the export-proof', function (state: ExportWorld) {
  const manifest = readManifest(state.bundleDir!);
  const manifestBytes = fs.readFileSync(path.join(state.bundleDir!, 'manifest.json'));
  const proof = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  expect(state.lastResult!.stdout).toContain(state.bundleDir!);
  expect(state.lastResult!.stdout).toContain(proof);
  expect(manifest.schemaVersion).toBeGreaterThan(0);
});

Then(
  'the audit trail holds one DataExported event whose archiveLocation is the bundle directory name with no path separators',
  function (state: ExportWorld) {
    const rows = domainEventRows(state.dbPath!).filter((r) => r.event_type === 'DataExported');
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload) as { archiveLocation: string };
    expect(payload.archiveLocation).toBe(path.basename(state.bundleDir!));
    expect(payload.archiveLocation).not.toMatch(/[/\\]/);
  },
);

Then('that same DataExported event appears inside the bundle\'s domain-events.json', function (state: ExportWorld) {
  const events = JSON.parse(fs.readFileSync(path.join(state.bundleDir!, 'domain-events.json'), 'utf8')) as Array<{
    type: string;
    archiveLocation?: string;
  }>;
  const found = events.find((e) => e.type === 'DataExported' && e.archiveLocation === path.basename(state.bundleDir!));
  expect(found, `no DataExported event found in bundle's own domain-events.json: ${JSON.stringify(events)}`).toBeDefined();
});

Then(
  'the manifest\'s counts and the event\'s exported counts are equal and match the actual row counts in the bundle',
  function (state: ExportWorld) {
    const manifest = readManifest(state.bundleDir!);
    const rows = domainEventRows(state.dbPath!).filter((r) => r.event_type === 'DataExported');
    const payload = JSON.parse(rows[0].payload) as { exported: { transactions: number; events: number } };

    const txRows = csvParse(fs.readFileSync(path.join(state.bundleDir!, 'transactions.csv'), 'utf8'), { columns: true }) as unknown[];
    const eventsInBundle = JSON.parse(fs.readFileSync(path.join(state.bundleDir!, 'domain-events.json'), 'utf8')) as unknown[];

    expect(manifest.counts.transactions).toBe(payload.exported.transactions);
    expect(manifest.counts.events).toBe(payload.exported.events);
    expect(manifest.counts.transactions).toBe(txRows.length);
    expect(manifest.counts.events).toBe(eventsInBundle.length);
    expect(manifest.counts.transactions).toBeGreaterThan(0);
    expect(manifest.counts.events).toBeGreaterThan(0);
  },
);

Then(
  'running export again with json output against a fresh out directory exits 0 with non-zero exported counts in the envelope',
  function (state: ExportWorld) {
    const freshOutDir = path.join(state.tmpDir!, 'exports-second');
    const result = spawnCli(['export', '--out', freshOutDir, '--json'], { cwd: state.tmpDir });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    const data = unwrapSuccess<{ exported: { transactions: number; events: number } }>(result.stdout);
    expect(data.exported.transactions).toBeGreaterThan(0);
    expect(data.exported.events).toBeGreaterThan(0);
  },
);

Then(
  'parsing the bundle\'s transactions.csv and transaction-entries.csv with the project\'s own CSV parser reproduces the DB\'s rows, including the idempotency_hash column',
  function (state: ExportWorld) {
    const db = new Database(state.dbPath!);
    dbs.push(db);
    const dbTransactions = db.prepare('SELECT id, occurred_at, description, created_at, idempotency_hash, corrects_id, kind FROM transactions ORDER BY rowid').all() as Array<Record<string, unknown>>;
    const dbEntries = db.prepare('SELECT id, transaction_id, account, side, amount_cents, currency FROM transaction_entries ORDER BY id').all() as Array<Record<string, unknown>>;

    const csvTransactions = csvParse(fs.readFileSync(path.join(state.bundleDir!, 'transactions.csv'), 'utf8'), { columns: true }) as Array<Record<string, string>>;
    const csvEntries = csvParse(fs.readFileSync(path.join(state.bundleDir!, 'transaction-entries.csv'), 'utf8'), { columns: true }) as Array<Record<string, string>>;

    expect(csvTransactions).toHaveLength(dbTransactions.length);
    expect(csvTransactions.length).toBeGreaterThan(0);
    for (let i = 0; i < dbTransactions.length; i++) {
      expect(csvTransactions[i]['id']).toBe(dbTransactions[i]['id']);
      expect(csvTransactions[i]['description']).toBe(dbTransactions[i]['description']);
      expect(csvTransactions[i]['idempotency_hash']).toBe(dbTransactions[i]['idempotency_hash']);
    }

    expect(csvEntries).toHaveLength(dbEntries.length);
    for (let i = 0; i < dbEntries.length; i++) {
      expect(csvEntries[i]['transaction_id']).toBe(dbEntries[i]['transaction_id']);
      expect(csvEntries[i]['account']).toBe(dbEntries[i]['account']);
      expect(Number(csvEntries[i]['amount_cents'])).toBe(dbEntries[i]['amount_cents']);
      expect(csvEntries[i]['currency']).toBe(dbEntries[i]['currency']);
    }
  },
);

Then('the bundle\'s domain-events.json matches the domain_events table row for row', function (state: ExportWorld) {
  const dbRows = domainEventRows(state.dbPath!);
  const bundleEvents = JSON.parse(fs.readFileSync(path.join(state.bundleDir!, 'domain-events.json'), 'utf8')) as Array<{
    seq: number;
    type: string;
    recordedAt: string;
  }>;
  expect(bundleEvents).toHaveLength(dbRows.length);
  for (let i = 0; i < dbRows.length; i++) {
    expect(bundleEvents[i].seq).toBe(dbRows[i].seq);
    expect(bundleEvents[i].type).toBe(dbRows[i].event_type);
    expect(bundleEvents[i].recordedAt).toBe(dbRows[i].recorded_at);
  }
});

Then('the final stderr line parses as a WRITE_FAILURE envelope', function (state: ExportWorld) {
  const error = unwrapError(state.lastResult!.stderr);
  expect(error.code).toBe('WRITE_FAILURE');
});

Then('no bundle directory and no partial remnant exist under the out directory', function (state: ExportWorld) {
  if (!fs.existsSync(state.outDir!)) return; // never created — also acceptable
  const entries = fs.readdirSync(state.outDir!);
  const plausible = entries.filter((name) => name.startsWith('accounting-export-'));
  expect(plausible, `unexpected bundle/partial remnants: ${plausible.join(', ')}`).toHaveLength(0);
});
