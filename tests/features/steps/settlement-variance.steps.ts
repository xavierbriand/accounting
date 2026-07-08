/**
 * Step bindings for settlement-variance.feature (Story 4.3a).
 *
 * Mechanism per scenario (R7):
 * - Scenarios 1, 3: in-process, in-memory with an asOf-aware BufferLedgerQuery fake
 *   (balancePoints honors occurred_at <= asOfDate semantics via snapshot lookup).
 * - Scenario 2: in-process, in-memory (no buffers involved).
 * - Scenarios 4, 5, 6: in-process, real SqliteContributionQuery + migrated temp SQLite
 *   (the correct.steps.ts makeTmpDb pattern).
 * - Scenario 7: in-process, in-memory with a hand-built ContributionsInWindow.
 * - Scenario 8: in-process, parseRawConfig directly (config-schema unit mechanism).
 */
import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/infra/db/migrator.js';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { SplitRulesService } from '../../../src/core/splits/split-rules-service.js';
import { BufferStateService } from '../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../src/core/recurring/recurring-forecast-service.js';
import { SafeTransferCalculator } from '../../../src/core/transfer/safe-transfer-calculator.js';
import { explainSettlementVariance } from '../../../src/core/settlement/settlement-variance-service.js';
import { SqliteContributionQuery } from '../../../src/infra/db/repositories/sqlite-contribution-query.js';
import { Money } from '../../../src/core/shared/money.js';
import type { Result } from '../../../src/core/shared/result.js';
import type { BufferLedgerQuery } from '../../../src/core/ports/buffer-ledger-query.js';
import type { SafeTransferCalculation } from '../../../src/core/transfer/safe-transfer-calculation.js';
import type { SettlementVariance } from '../../../src/core/settlement/settlement-variance.js';
import type { ContributionsInWindow } from '../../../src/core/ports/contribution-query.js';

interface SplitWindowRow {
  validFrom: string;
  rules: Array<{ partner: string; ratio: number }>;
}

interface RecurringRuleRow {
  name: string;
  category: string;
  cadence: 'monthly';
  amount: number;
  validFrom: string;
}

interface BufferRow {
  name: string;
  account: string;
  target: number;
  targetDate: string;
}

interface BalancePoint {
  asOfDate: string;
  cents: number;
}

interface SettlementAccountRow {
  account: string;
  partner: string | null;
}

interface World {
  splitWindows?: SplitWindowRow[];
  recurringRules?: RecurringRuleRow[];
  bufferRows?: BufferRow[];
  balancePoints?: Map<string, BalancePoint[]>;
  contributions?: ContributionsInWindow;
  settlementAccounts?: SettlementAccountRow[];
  db?: Database.Database;
  tmpDir?: string;
  lastCreditAccount?: string;
  lastCreditTxId?: string;
  thisCalc?: SafeTransferCalculation;
  lastCalc?: SafeTransferCalculation;
  varianceResult?: Result<SettlementVariance>;
  stateResult?: Result<SettlementVariance>;
  rawConfigBase?: Record<string, unknown>;
  configResult?: Result<unknown>;
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Mirrors src/cli/commands/status-command.ts's nextCalendarMonth, duplicated here as
// test-only glue: 4.3a has no CLI surface (4.3b), so acceptance steps don't import CLI.
function nextMonthWindow(asOf: string): { from: string; to: string } {
  const [year, month] = asOf.split('-').map(Number) as [number, number];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const from = `${nextYear}-${pad2(nextMonth)}-01`;
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  const to = `${nextYear}-${pad2(nextMonth)}-${pad2(lastDay)}`;
  return { from, to };
}

function oneMonthBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${pad2(prevMonth)}-${pad2(day)}`;
}

function ensureDb(state: World): Database.Database {
  if (!state.db) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-settlement-bdd-'));
    tmpDirs.push(tmpDir);
    const dbPath = path.join(tmpDir, 'settlement-test.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    dbs.push(db);
    state.db = db;
    state.tmpDir = tmpDir;
  }
  return state.db;
}

function insertEntry(
  db: Database.Database,
  id: string,
  occurredAt: string,
  account: string,
  side: 'debit' | 'credit',
  amountCents: number,
): void {
  db.prepare(
    'INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)',
  ).run(id, occurredAt, `settlement fixture ${id}`, `hash-${id}`);
  db.prepare(
    'INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES (?, ?, ?, ?, ?)',
  ).run(id, account, side, amountCents, 'EUR');
}

function computeCalcs(state: World, asOf: string): { thisMonth: Result<SafeTransferCalculation>; lastMonth: Result<SafeTransferCalculation> } {
  const asOfLast = oneMonthBefore(asOf);
  const thisWindow = nextMonthWindow(asOf);
  const lastWindow = nextMonthWindow(asOfLast);

  const splitWindows = state.splitWindows ?? [
    { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
  ];

  const rawConfig = {
    dbPath: './data/ledger.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [{ id: 'main-1', type: 'bank', filenamePrefix: '12345678901_' }],
    splits: splitWindows,
    buffers: (state.bufferRows ?? []).map(r => ({ name: r.name, account: r.account, target: r.target, targetDate: r.targetDate })),
    recurring: (state.recurringRules ?? []).map(r => ({ name: r.name, category: r.category, cadence: r.cadence, amount: r.amount, validFrom: r.validFrom })),
  };
  const configResult = parseRawConfig(rawConfig);
  if (configResult.isFailure) throw new Error(`config parse failed: ${configResult.error}`);
  const config = configResult.value;

  const fakeLedger: BufferLedgerQuery = {
    sumEntriesByAccount(account: string, expectedCurrency: string, asOfDate: string): Result<Money> {
      const points = state.balancePoints?.get(account) ?? [];
      let best: BalancePoint | undefined;
      for (const p of points) {
        if (p.asOfDate <= asOfDate && (!best || p.asOfDate > best.asOfDate)) best = p;
      }
      return Money.fromCents(best?.cents ?? 0, expectedCurrency);
    },
  };

  const splitsService = new SplitRulesService(config.splits);
  const buffersService = new BufferStateService(config.buffers, config.defaultCurrency, fakeLedger);
  const forecastService = new RecurringForecastService(config.recurring);
  const calculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, config.defaultCurrency);

  return {
    thisMonth: calculator.calculateForWindow(asOf, thisWindow.from, thisWindow.to),
    lastMonth: calculator.calculateForWindow(asOfLast, lastWindow.from, lastWindow.to),
  };
}

const emptyContributions: ContributionsInWindow = {
  attributed: [],
  unattributed: Money.fromCents(0, 'EUR').value,
  totalActual: Money.fromCents(0, 'EUR').value,
};

// ─── Given: config building blocks ────────────────────────────────────────────

Given(
  'split window {word} {int}% and {word} {int}% valid from {string}',
  function (state: World, partner1: string, ratio1: number, partner2: string, ratio2: number, validFrom: string) {
    state.splitWindows = state.splitWindows ?? [];
    state.splitWindows.push({
      validFrom,
      rules: [{ partner: partner1, ratio: ratio1 / 100 }, { partner: partner2, ratio: ratio2 / 100 }],
    });
  },
);

Given(
  'a recurring rule {string} in category {string} for {float} EUR monthly valid from {string}',
  function (state: World, name: string, category: string, amount: number, validFrom: string) {
    state.recurringRules = state.recurringRules ?? [];
    state.recurringRules.push({ name, category, cadence: 'monthly', amount, validFrom });
  },
);

Given(
  'a buffer {string} on account {string} with target {float} EUR and targetDate {string}',
  function (state: World, name: string, account: string, target: number, targetDate: string) {
    state.bufferRows = state.bufferRows ?? [];
    state.bufferRows.push({ name, account, target, targetDate });
  },
);

Given(
  'the buffer ledger balance for {string} is {float} EUR as of {string} and {float} EUR as of {string}',
  function (state: World, account: string, amount1: number, date1: string, amount2: number, date2: string) {
    state.balancePoints = state.balancePoints ?? new Map();
    const points = state.balancePoints.get(account) ?? [];
    points.push({ asOfDate: date1, cents: Math.round(amount1 * 100) });
    points.push({ asOfDate: date2, cents: Math.round(amount2 * 100) });
    state.balancePoints.set(account, points);
  },
);

Given('settlement accounts:', function (state: World, table: { hashes: () => Array<{ account: string; partner: string }> }) {
  const rows = table.hashes();
  state.settlementAccounts = rows.map(r => ({
    account: r.account.trim(),
    partner: r.partner.trim() === '' ? null : r.partner.trim(),
  }));
});

Given('a hand-built contribution of {float} USD attributed to {string}', function (state: World, amount: number, partner: string) {
  const cents = Math.round(amount * 100);
  state.contributions = {
    attributed: [{ partner, amount: Money.fromCents(cents, 'USD').value }],
    unattributed: Money.fromCents(0, 'USD').value,
    totalActual: Money.fromCents(cents, 'USD').value,
  };
});

// ─── Given: real-adapter fixtures (scenarios 4, 5, 6) ─────────────────────────

let creditCounter = 0;

Given('a credit of {float} EUR on {string} occurred at {string}', function (state: World, amount: number, account: string, occurredAt: string) {
  const db = ensureDb(state);
  const id = `tx-credit-${++creditCounter}`;
  insertEntry(db, id, occurredAt, account, 'credit', Math.round(amount * 100));
  state.lastCreditAccount = account;
  state.lastCreditTxId = id;
});

Given('that credit is corrected to {float} EUR occurred at {string}', function (state: World, correctedAmount: number, occurredAt: string) {
  const db = state.db!;
  const account = state.lastCreditAccount!;
  const originalTxId = state.lastCreditTxId!;
  const originalRow = db.prepare('SELECT amount_cents FROM transaction_entries WHERE transaction_id = ?').get(originalTxId) as { amount_cents: number };
  insertEntry(db, `${originalTxId}-reversal`, occurredAt, account, 'debit', originalRow.amount_cents);
  insertEntry(db, `${originalTxId}-correcting`, occurredAt, account, 'credit', Math.round(correctedAmount * 100));
});

// ─── When ──────────────────────────────────────────────────────────────────────

When('I explain the settlement variance for asOf {string}', function (state: World, asOf: string) {
  const { thisMonth, lastMonth } = computeCalcs(state, asOf);
  if (thisMonth.isFailure) throw new Error(`this month calc failed: ${thisMonth.error}`);
  if (lastMonth.isFailure) throw new Error(`last month calc failed: ${lastMonth.error}`);
  state.thisCalc = thisMonth.value;
  state.lastCalc = lastMonth.value;
  const result = explainSettlementVariance(thisMonth.value, lastMonth.value, state.contributions ?? emptyContributions);
  state.varianceResult = result;
  state.stateResult = result;
});

When('I explain the settlement variance for asOf {string} using the real contributions query', function (state: World, asOf: string) {
  const { thisMonth, lastMonth } = computeCalcs(state, asOf);
  if (thisMonth.isFailure) throw new Error(`this month calc failed: ${thisMonth.error}`);
  if (lastMonth.isFailure) throw new Error(`last month calc failed: ${lastMonth.error}`);
  state.thisCalc = thisMonth.value;
  state.lastCalc = lastMonth.value;

  const asOfLast = oneMonthBefore(asOf);
  const lastWindow = nextMonthWindow(asOfLast);
  const mappings = (state.settlementAccounts ?? []).map(a => ({ account: a.account, partner: a.partner }));
  const query = new SqliteContributionQuery(state.db!, mappings);
  const contributionsResult = query.contributionsInWindow('EUR', lastWindow.from, lastWindow.to);
  if (contributionsResult.isFailure) throw new Error(`contributions query failed: ${contributionsResult.error}`);

  const result = explainSettlementVariance(thisMonth.value, lastMonth.value, contributionsResult.value);
  state.varianceResult = result;
  state.stateResult = result;
});

// ─── Then ──────────────────────────────────────────────────────────────────────

interface VarianceLineRow {
  kind: string;
  category: string;
  description: string;
  presence: string;
  totalDelta: string;
}

Then('the variance lines are:', function (state: World, table: { hashes: () => VarianceLineRow[] }) {
  const rows = table.hashes();
  const lines = state.varianceResult!.value.lines;
  expect(lines).toHaveLength(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = lines[i];
    expect(line.key.kind).toBe(row.kind.trim());
    expect(line.key.category).toBe(row.category.trim());
    expect(line.key.description).toBe(row.description.trim());
    expect(line.presence).toBe(row.presence.trim());
    expect(line.totalDelta.amount).toBe(Math.round(Number(row.totalDelta.trim()) * 100));
  }
});

Then('sum of line totalDeltas equals thisTotal minus lastTotal', function (state: World) {
  const lines = state.varianceResult!.value.lines;
  const sum = lines.reduce((acc, l) => acc + l.totalDelta.amount, 0);
  expect(sum).toBe(state.thisCalc!.totalRequired.amount - state.lastCalc!.totalRequired.amount);
});

Then('each partner\'s line-delta sum equals their headline delta', function (state: World) {
  const lines = state.varianceResult!.value.lines;
  for (const partner of ['Alex', 'Sam']) {
    const sum = lines.reduce((acc, l) => acc + (l.perPartnerDelta.get(partner)?.amount ?? 0), 0);
    const expected = (state.thisCalc!.perPartner.get(partner)?.amount ?? 0) - (state.lastCalc!.perPartner.get(partner)?.amount ?? 0);
    expect(sum).toBe(expected);
  }
});

Then(
  'the line for kind {string} category {string} description {string} has presence {string} and totalDelta {float} EUR',
  function (state: World, kind: string, category: string, description: string, presence: string, totalDelta: number) {
    const lines = state.varianceResult!.value.lines;
    const line = lines.find(l => l.key.kind === kind && l.key.category === category && l.key.description === description);
    expect(line).toBeDefined();
    expect(line!.presence).toBe(presence);
    expect(line!.totalDelta.amount).toBe(Math.round(totalDelta * 100));
  },
);

Then('follow-through attribution is {string}', function (state: World, attribution: string) {
  expect(state.varianceResult!.value.followThrough.attribution).toBe(attribution);
});

Then(
  'follow-through for {string} has suggested {float} EUR, actual {float} EUR, and delta {float} EUR',
  function (state: World, partner: string, suggested: number, actual: number, delta: number) {
    const pf = state.varianceResult!.value.followThrough.perPartner!.get(partner);
    expect(pf).toBeDefined();
    expect(pf!.suggested.amount).toBe(Math.round(suggested * 100));
    expect(pf!.actual.amount).toBe(Math.round(actual * 100));
    expect(pf!.delta.amount).toBe(Math.round(delta * 100));
  },
);

Then('follow-through totalActual is {float} EUR', function (state: World, amount: number) {
  expect(state.varianceResult!.value.followThrough.totalActual.amount).toBe(Math.round(amount * 100));
});

// ─── Given/When/Then: config validation (scenario 8) ──────────────────────────

Given('an accounting config with splits Alex and Sam', function (state: World) {
  state.rawConfigBase = {
    dbPath: './data/ledger.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [{ id: 'main-1', type: 'bank', filenamePrefix: '12345678901_' }],
    splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] }],
    buffers: [],
  };
});

Given('a settlement section naming partner {string} absent from the splits roster', function (state: World, partner: string) {
  state.configResult = parseRawConfig({
    ...state.rawConfigBase,
    settlement: { accounts: [{ account: 'income:contribution:unknown-partner', partner }] },
  });
});

Given('a settlement section listing the account {string} twice', function (state: World, account: string) {
  state.configResult = parseRawConfig({
    ...state.rawConfigBase,
    settlement: { accounts: [{ account, partner: 'Alex' }, { account, partner: 'Sam' }] },
  });
});

When('the config is parsed', function (state: World) {
  // Parsing already happened in the Given step (buffer-status.steps.ts precedent).
  void state;
});

Then('config parsing fails with an error containing {string}', function (state: World, fragment: string) {
  expect(state.configResult?.isFailure).toBe(true);
  expect(state.configResult?.error).toContain(fragment);
});
