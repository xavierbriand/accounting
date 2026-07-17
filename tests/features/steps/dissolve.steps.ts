import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { SqliteTransactionRepository } from '../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../../../src/infra/db/repositories/sqlite-domain-event-recorder.js';
import { Transaction } from '../../../src/core/ledger/transaction.js';
import { Money } from '../../../src/core/shared/money.js';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';
import { unwrapError, unwrapSuccess } from '../../_helpers/json-envelope.js';

interface DissolveWorld {
  tmpDir?: string;
  dbPath?: string;
  yamlPath?: string;
  yamlBytesBefore?: Buffer;
  bundleDir?: string;
  bakPath?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
}

const tmpDirs: string[] = [];
let fixtureCounter = 0;

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-dissolve-bdd-'));
  tmpDirs.push(dir);
  // Canonicalize immediately: macOS's TMPDIR sits under a symlink (/var ->
  // /private/var). A subprocess's own process.cwd()/path.resolve() returns
  // the canonical form, so comparing exact absolute paths against this
  // parent-process value (not yet resolved) would spuriously mismatch —
  // resolve once, here, so every downstream path built from it already
  // agrees with what the spawned dissolve command computes.
  return fs.realpathSync(dir);
}

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

// Each fixture helper opens, writes, and closes its own connection immediately
// (unlike export.steps.ts's shared-teardown pattern) — a lingering open
// connection on the fixture DB would hold a WAL reader/writer lock, preventing
// the checkpoint truncation a genuinely "cleanly closed" project would have by
// the time dissolve runs (Scenario 1's Given intends a real clean-close state).
function insertTransaction(dbPath: string, description: string): void {
  fixtureCounter += 1;
  const db = new Database(dbPath);
  const repo = new SqliteTransactionRepository(db);
  const transaction = Transaction.create({
    id: `tx-fixture-${fixtureCounter}`,
    occurredAt: '2026-04-21T14:30:00+02:00',
    description,
    entries: [
      { account: 'Expense:Groceries', side: 'debit', amount: makeEur(2500) },
      { account: 'Assets:Bank:main-account', side: 'credit', amount: makeEur(2500) },
    ],
  }).value;
  const saveResult = repo.save(transaction, `fixture-hash-${transaction.id}`);
  db.close();
  if (saveResult.isFailure) throw new Error(`fixture save failed: ${saveResult.error}`);
}

function recordIngestedEvent(dbPath: string, transactionId: string): void {
  const db = new Database(dbPath);
  const recorder = new SqliteDomainEventRecorder(db);
  const recordResult = recorder.record({
    type: 'TransactionIngested',
    transactionIds: [transactionId],
    sourceAccount: 'main-account',
  });
  db.close();
  if (recordResult.isFailure) throw new Error(`fixture event record failed: ${recordResult.error}`);
}

function bundleDirUnder(outDir: string): string {
  const entries = fs.readdirSync(outDir).filter((name) => !name.endsWith('.partial'));
  expect(entries, `expected exactly one bundle dir under ${outDir}, found: ${entries.join(', ')}`).toHaveLength(1);
  return path.join(outDir, entries[0]);
}

function readManifestHash(bundleDir: string): string {
  const manifestBytes = fs.readFileSync(path.join(bundleDir, 'manifest.json'));
  return crypto.createHash('sha256').update(manifestBytes).digest('hex');
}

Given('a migrated project with data and a fresh export bundle', function (state: DissolveWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  state.dbPath = path.join(tmpDir, 'test.db');
  state.yamlPath = path.join(tmpDir, 'accounting.yaml');
  writeStubYaml(tmpDir);
  state.yamlBytesBefore = fs.readFileSync(state.yamlPath);

  const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
  expect(migrateResult.status, `migrate stderr: ${migrateResult.stderr}`).toBe(0);

  insertTransaction(state.dbPath, 'Groceries run');
  recordIngestedEvent(state.dbPath, 'tx-fixture-1');
  insertTransaction(state.dbPath, 'Weekly shop');

  const outDir = path.join(tmpDir, 'exports');
  const exportResult = spawnCli(['export', '--out', outDir], { cwd: tmpDir });
  expect(exportResult.status, `export stderr: ${exportResult.stderr}`).toBe(0);
  state.bundleDir = bundleDirUnder(outDir);
});

Given('a stray backup file planted next to the database', function (state: DissolveWorld) {
  state.bakPath = `${state.dbPath!}.bak`;
  fs.writeFileSync(state.bakPath, 'stray backup left by a prior failed ingest', 'utf8');
});

Given('one byte appended to the bundle\'s transactions.csv', function (state: DissolveWorld) {
  fs.appendFileSync(path.join(state.bundleDir!, 'transactions.csv'), 'X');
});

Given('one more transaction ingested after the export', function (state: DissolveWorld) {
  insertTransaction(state.dbPath!, 'Late addition after export');
});

When('the user runs dissolve against that bundle with --confirm and --json', function (state: DissolveWorld) {
  state.lastResult = spawnCli(['dissolve', '--bundle', state.bundleDir!, '--confirm', '--json'], { cwd: state.tmpDir });
});

// 'the process exits with code {int}' is registered in ingest.steps.ts — reused
// here (quickpickle steps are matched globally by pattern, not scoped per file);
// state.lastResult's {status, stdout, stderr} shape matches.

Then('the database file and the planted backup file are gone', function (state: DissolveWorld) {
  expect(fs.existsSync(state.dbPath!)).toBe(false);
  expect(fs.existsSync(state.bakPath!)).toBe(false);
});

Then('accounting.yaml remains byte-identical', function (state: DissolveWorld) {
  const after = fs.readFileSync(state.yamlPath!);
  expect(after.equals(state.yamlBytesBefore!)).toBe(true);
});

Then('a dissolution receipt exists beside accounting.yaml with mode {int}', function (state: DissolveWorld, mode: number) {
  const receiptPath = path.join(path.dirname(state.yamlPath!), 'dissolution-receipt.json');
  expect(fs.existsSync(receiptPath)).toBe(true);
  if (process.platform !== 'win32') {
    const stat = fs.statSync(receiptPath);
    expect((stat.mode & 0o777).toString(8)).toBe(mode.toString());
  }
});

Then(
  'the receipt\'s event manifestHash equals the bundle\'s manifest hash and its archiveLocation is the bundle directory name',
  function (state: DissolveWorld) {
    const receiptPath = path.join(path.dirname(state.yamlPath!), 'dissolution-receipt.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as {
      event: { type: string; manifestHash: string; archiveLocation: string; wipedStores: string[] };
    };
    expect(receipt.event.type).toBe('DissolutionPerformed');
    expect(receipt.event.manifestHash).toBe(readManifestHash(state.bundleDir!));
    expect(receipt.event.archiveLocation).toBe(path.basename(state.bundleDir!));
  },
);

Then('the envelope\'s data.wipedStores enumerates both deleted files', function (state: DissolveWorld) {
  const data = unwrapSuccess<{ wipedStores: string[] }>(state.lastResult!.stdout);
  expect(data.wipedStores.sort()).toEqual([state.bakPath!, state.dbPath!].sort());
});

Then('the final stderr line parses as an INVALID_ARGUMENT envelope naming the failed verification', function (state: DissolveWorld) {
  const error = unwrapError(state.lastResult!.stderr);
  expect(error.code).toBe('INVALID_ARGUMENT');
  expect(error.message.toLowerCase()).toContain('verif');
});

Then('the database and accounting.yaml are untouched and no receipt exists', function (state: DissolveWorld) {
  expect(fs.existsSync(state.dbPath!)).toBe(true);
  const after = fs.readFileSync(state.yamlPath!);
  expect(after.equals(state.yamlBytesBefore!)).toBe(true);
  const receiptPath = path.join(path.dirname(state.yamlPath!), 'dissolution-receipt.json');
  expect(fs.existsSync(receiptPath)).toBe(false);
});

Then('the final stderr line\'s message names the export-proof as stale and suggests running export again', function (state: DissolveWorld) {
  const error = unwrapError(state.lastResult!.stderr);
  expect(error.code).toBe('INVALID_ARGUMENT');
  expect(error.message).toContain('export-proof');
  expect(error.message).toContain('accounting export');
});
