import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Writable } from 'stream';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/infra/db/migrator.js';
import { SqliteTransactionRepository } from '../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { SqliteDomainEventRecorder } from '../../../src/infra/db/repositories/sqlite-domain-event-recorder.js';
import { runCorrectCommand } from '../../../src/cli/commands/correct-command.js';
import { Transaction } from '../../../src/core/ledger/transaction.js';
import { Money } from '../../../src/core/shared/money.js';
import { Result } from '../../../src/core/shared/result.js';
import type { TransactionRepository } from '../../../src/core/ports/transaction-repository.js';
import type { DomainEventRecorder } from '../../../src/core/ports/domain-event-recorder.js';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { makeCapturingStream as makeCapture } from '../../_helpers/streams.js';

interface CorrectWorld {
  tmpDir?: string;
  csvPath?: string;
  dbPath?: string;
  db?: Database.Database;
  transactionRepository?: SqliteTransactionRepository;
  domainEventRecorder?: DomainEventRecorder;
  originalId?: string;
  stdout?: Writable & { captured: string };
  stderr?: Writable & { captured: string };
  exitCodes?: number[];
  saveCorrectionRigged?: boolean;
  riggedHash?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
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

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeTmpDb(): { tmpDir: string; dbPath: string; db: Database.Database } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-correct-bdd-'));
  tmpDirs.push(tmpDir);
  const dbPath = path.join(tmpDir, 'correct-test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbs.push(db);
  return { tmpDir, dbPath, db };
}

function insertOriginal(db: Database.Database, description = 'Transport'): Transaction {
  const repo = new SqliteTransactionRepository(db);
  const original = Transaction.create({
    id: 'tx-original',
    occurredAt: '2026-04-21T14:30:00+02:00',
    description,
    entries: [
      { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
  const saveResult = repo.save(original, 'test-fixture-hash-original');
  if (saveResult.isFailure) throw new Error(`fixture save failed: ${saveResult.error}`);
  return original;
}

async function runCorrect(
  state: CorrectWorld,
  opts: { amount?: string; category?: string; date?: string; description?: string; reason: string; json?: boolean },
): Promise<void> {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];
  state.stdout = stdout;
  state.stderr = stderr;
  state.exitCodes = exitCodes;

  let uuidCounter = 0;
  const uuidGen = () => `tx-generated-${++uuidCounter}`;

  const realRepo = state.transactionRepository!;
  const transactionRepository: Pick<TransactionRepository, 'findById' | 'saveCorrection'> = state.saveCorrectionRigged
    ? {
        findById: (id) => realRepo.findById(id),
        saveCorrection: () =>
          Result.fail(`SqliteError: UNIQUE constraint failed: transactions.idempotency_hash = ${state.riggedHash!}`),
      }
    : realRepo;

  await runCorrectCommand(
    {
      transactionId: state.originalId!,
      amount: opts.amount,
      category: opts.category,
      date: opts.date,
      description: opts.description,
      reason: opts.reason,
      json: opts.json ?? false,
    },
    {
      transactionRepository,
      domainEventRecorder: state.domainEventRecorder!,
      uuidGen,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
    },
  );
}

// -------- Given steps --------

Given('a persisted two-entry original transaction', function (state: CorrectWorld) {
  const { tmpDir, dbPath, db } = makeTmpDb();
  state.tmpDir = tmpDir;
  state.dbPath = dbPath;
  state.db = db;
  state.transactionRepository = new SqliteTransactionRepository(db);
  state.domainEventRecorder = new SqliteDomainEventRecorder(db);
  state.originalId = insertOriginal(db).id;
});

Given('a persisted two-entry original transaction with description {string}', function (state: CorrectWorld, description: string) {
  const { tmpDir, dbPath, db } = makeTmpDb();
  state.tmpDir = tmpDir;
  state.dbPath = dbPath;
  state.db = db;
  state.transactionRepository = new SqliteTransactionRepository(db);
  state.domainEventRecorder = new SqliteDomainEventRecorder(db);
  state.originalId = insertOriginal(db, description).id;
});

Given('a fresh migrated correct DB', function (state: CorrectWorld) {
  const { tmpDir, dbPath, db } = makeTmpDb();
  state.tmpDir = tmpDir;
  state.dbPath = dbPath;
  state.db = db;
  state.transactionRepository = new SqliteTransactionRepository(db);
  state.domainEventRecorder = new SqliteDomainEventRecorder(db);
});

Given('a persisted reversal-kind transaction', function (state: CorrectWorld) {
  const { tmpDir, dbPath, db } = makeTmpDb();
  state.tmpDir = tmpDir;
  state.dbPath = dbPath;
  state.db = db;
  const repo = new SqliteTransactionRepository(db);
  state.transactionRepository = repo;
  state.domainEventRecorder = new SqliteDomainEventRecorder(db);

  // Built directly via Transaction.create, not a CorrectionService.correct round-trip
  // (Phase-2 P1 finding — adopted, docs/plans/story-4.2b.md suggestion-log #8): faster,
  // and the round-trip path is already covered by 4.2a's own tests.
  const original = insertOriginal(db);
  const reversal = Transaction.create({
    id: 'tx-reversal-fixture',
    occurredAt: original.occurredAt,
    description: `Reversal of ${original.id}`,
    kind: 'reversal',
    correctsId: original.id,
    entries: [
      { account: 'Liabilities:CreditCard', side: 'debit', amount: makeEur(2000) },
      { account: 'Expense:Transport', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
  const correcting = Transaction.create({
    id: 'tx-correcting-fixture',
    occurredAt: original.occurredAt,
    description: original.description,
    kind: 'correcting',
    correctsId: original.id,
    entries: [
      { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
  const writeResult = repo.saveCorrection(reversal, correcting);
  if (writeResult.isFailure) throw new Error(`fixture saveCorrection failed: ${writeResult.error}`);
  state.originalId = reversal.id;
});

Given('saveCorrection is rigged to fail for this run', function (state: CorrectWorld) {
  state.saveCorrectionRigged = true;
  state.riggedHash = 'f'.repeat(64);
});

// -------- When steps --------

When('I run correct with amount {string} and reason {string}', async function (state: CorrectWorld, amount: string, reason: string) {
  await runCorrect(state, { amount, reason });
});

When(
  'I run correct with amount {string}, category {string}, reason {string}, and json output',
  async function (state: CorrectWorld, amount: string, category: string, reason: string) {
    await runCorrect(state, { amount, category, reason, json: true });
  },
);

When('I run correct with amount {string} and a blank reason', async function (state: CorrectWorld, amount: string) {
  await runCorrect(state, { amount, reason: '' });
});

When(
  'I run correct for a missing transaction with amount {string} and reason {string}',
  async function (state: CorrectWorld, amount: string, reason: string) {
    state.originalId = 'tx-does-not-exist';
    await runCorrect(state, { amount, reason });
  },
);

When('I run correct on the reversal with amount {string} and reason {string}', async function (state: CorrectWorld, amount: string, reason: string) {
  await runCorrect(state, { amount, reason });
});

When('I run correct with only reason {string}', async function (state: CorrectWorld, reason: string) {
  await runCorrect(state, { reason });
});

When('I run correct with description {string} and reason {string}', async function (state: CorrectWorld, description: string, reason: string) {
  await runCorrect(state, { description, reason });
});

When(
  'I run correct as a subprocess on the first committed transaction with category {string} and reason {string} and json output',
  function (state: CorrectWorld, category: string, reason: string) {
    const db = new Database(state.dbPath!);
    const row = db.prepare("SELECT id FROM transactions WHERE kind = 'original' ORDER BY id LIMIT 1").get() as { id: string };
    db.close();
    state.originalId = row.id;
    state.lastResult = spawnCli(
      ['correct', row.id, '--category', category, '--reason', reason, '--json'],
      { cwd: state.tmpDir },
    );
  },
);

// -------- Then steps --------

Then('the correct command exits with code {int}', function (state: CorrectWorld, code: number) {
  expect(state.exitCodes).toEqual([code]);
});

Then(
  'correct stdout reports the reversal id, the correcting id, and changed fields {string}',
  function (state: CorrectWorld, fieldsCsv: string) {
    const captured = state.stdout!.captured;
    for (const field of fieldsCsv.split(',')) {
      expect(captured).toContain(field);
    }
    const rows = state.db!.prepare('SELECT id FROM transactions WHERE corrects_id = ?').all(state.originalId!) as { id: string }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(captured).toContain(row.id);
    }
  },
);

Then('the DB holds the original plus a reversal and a correcting transaction', function (state: CorrectWorld) {
  const rows = state.db!.prepare('SELECT kind FROM transactions ORDER BY kind').all() as { kind: string }[];
  expect(rows.map((r) => r.kind).sort()).toEqual(['correcting', 'original', 'reversal']);
});

Then(
  'one TransactionCorrected event is recorded naming the target, the produced ids, changed fields, and reason',
  function (state: CorrectWorld) {
    const events = state.db!.prepare('SELECT event_type, payload FROM domain_events').all() as { event_type: string; payload: string }[];
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('TransactionCorrected');
    const payload = JSON.parse(events[0].payload) as {
      targetTransactionId: string;
      producedTransactionIds: string[];
      changedFields: string[];
      reason: string;
    };
    expect(payload.targetTransactionId).toBe(state.originalId);
    expect(payload.producedTransactionIds).toHaveLength(2);
    expect(payload.changedFields.length).toBeGreaterThan(0);
    expect(payload.reason.length).toBeGreaterThan(0);
  },
);

Then('correct stdout is a single JSON document with changedFields {string}', function (state: CorrectWorld, fieldsCsv: string) {
  const lines = state.stdout!.captured.trim().split('\n');
  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0]) as { changedFields: string[] };
  expect(parsed.changedFields).toEqual(fieldsCsv.split(','));
});

Then('no transaction rows are written beyond the original', function (state: CorrectWorld) {
  const count = (state.db!.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
  expect(count).toBe(1);
});

Then('no transaction rows are written', function (state: CorrectWorld) {
  const count = (state.db!.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
  expect(count).toBe(0);
});

Then('no additional transaction rows are written', function (state: CorrectWorld) {
  const count = (state.db!.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
  expect(count).toBe(3);
});

Then('no TransactionCorrected event is recorded', function (state: CorrectWorld) {
  const count = (state.db!.prepare('SELECT COUNT(*) as n FROM domain_events').get() as { n: number }).n;
  expect(count).toBe(0);
});

Then('correct stderr names the missing transaction id', function (state: CorrectWorld) {
  expect(state.stderr!.captured).toContain(state.originalId!);
});

Then('correct stderr cites that a reversal cannot be corrected', function (state: CorrectWorld) {
  expect(state.stderr!.captured.toLowerCase()).toContain('reversal');
});

Then('correct stderr cites that at least one field must be corrected', function (state: CorrectWorld) {
  expect(state.stderr!.captured.toLowerCase()).toContain('at least one field');
});

Then('correct stderr contains no raw idempotency-hash value', function (state: CorrectWorld) {
  expect(state.stderr!.captured).not.toContain(state.riggedHash!);
  expect(state.stderr!.captured).toContain('<redacted>');
});

Then('the correcting entry\'s description is empty', function (state: CorrectWorld) {
  const row = state.db!.prepare("SELECT description FROM transactions WHERE kind = 'correcting'").get() as { description: string };
  expect(row.description).toBe('');
});

Then('correct stdout reports changed fields {string}', function (state: CorrectWorld, fieldsCsv: string) {
  for (const field of fieldsCsv.split(',')) {
    expect(state.stdout!.captured).toContain(field);
  }
});

Then('the subprocess JSON output matches the correct command\'s documented shape', function (state: CorrectWorld) {
  const parsed = JSON.parse(state.lastResult!.stdout.trim()) as {
    targetTransactionId: string;
    producedTransactionIds: string[];
    changedFields: string[];
    reason: string;
  };
  expect(parsed.targetTransactionId).toBe(state.originalId);
  expect(parsed.producedTransactionIds).toHaveLength(2);
  expect(parsed.changedFields).toEqual(['category']);
  expect(parsed.reason).toBe('miscategorized');
});

Then(
  'a direct DB read confirms the reversal and correcting rows and the recorded TransactionCorrected event',
  function (state: CorrectWorld) {
    const db = new Database(state.dbPath!);
    const rows = db.prepare('SELECT kind FROM transactions WHERE corrects_id = ?').all(state.originalId!) as { kind: string }[];
    expect(rows.map((r) => r.kind).sort()).toEqual(['correcting', 'reversal']);
    const events = db.prepare("SELECT event_type FROM domain_events WHERE event_type = 'TransactionCorrected'").all();
    expect(events).toHaveLength(1);
    db.close();
  },
);
