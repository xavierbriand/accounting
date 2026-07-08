/**
 * Step bindings for explain.feature (Story 4.3b).
 *
 * Mechanism per scenario (R7):
 * - Scenarios 1-6: in-process — runExplainCommand with injected deps (real Core
 *   services + a fake BufferLedgerQuery keyed by asOfDate, real SqliteContributionQuery
 *   over a real migrated temp SQLite — the 4.3a settlement-variance.steps.ts ensureDb
 *   pattern). Several Given steps (split window, recurring rule, buffer, buffer
 *   ledger balance, settlement accounts, credit) are the SAME step text registered in
 *   settlement-variance.steps.ts and are reused verbatim via quickpickle's shared
 *   global step registry (see e.g. status.steps.ts's precedent of sharing
 *   "the result is success"/"the result is failure" across feature files).
 * - Scenario 7: subprocess (R4) — migrate -> ingest a settlement-credit CSV fixture ->
 *   explain --json via spawnCli against the built dist/cli/program.js binary.
 */
import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/infra/db/migrator.js';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { SplitRulesService } from '../../../src/core/splits/split-rules-service.js';
import { BufferStateService } from '../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../src/core/recurring/recurring-forecast-service.js';
import { SafeTransferCalculator } from '../../../src/core/transfer/safe-transfer-calculator.js';
import { SqliteContributionQuery } from '../../../src/infra/db/repositories/sqlite-contribution-query.js';
import { runExplainCommand } from '../../../src/cli/commands/explain-command.js';
import { Money } from '../../../src/core/shared/money.js';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import type { Result } from '../../../src/core/shared/result.js';
import type { BufferLedgerQuery } from '../../../src/core/ports/buffer-ledger-query.js';
import type { ContributionQuery } from '../../../src/core/ports/contribution-query.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  partner: string;
}

interface ExplainWorld {
  splitWindows?: SplitWindowRow[];
  recurringRules?: RecurringRuleRow[];
  bufferRows?: BufferRow[];
  balancePoints?: Map<string, BalancePoint[]>;
  settlementAccounts?: SettlementAccountRow[];
  db?: Database.Database;
  tmpDir?: string;
  lastCreditAccount?: string;
  lastCreditTxId?: string;
  result?: { exitCode: number; stdout: string; stderr: string };
  subprocessTmpDir?: string;
  subprocessResult?: { status: number; stdout: string; stderr: string };
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

function ensureDb(state: ExplainWorld): Database.Database {
  if (!state.db) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-explain-bdd-'));
    tmpDirs.push(tmpDir);
    const dbPath = path.join(tmpDir, 'explain-test.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    dbs.push(db);
    state.db = db;
    state.tmpDir = tmpDir;
  }
  return state.db;
}

function buildRawConfig(state: ExplainWorld): Record<string, unknown> {
  const splitWindows = state.splitWindows ?? [
    { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
  ];
  const rawConfig: Record<string, unknown> = {
    dbPath: './data/ledger.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [{ id: 'main-1', type: 'bank', filenamePrefix: '12345678901_' }],
    splits: splitWindows,
    buffers: (state.bufferRows ?? []).map(r => ({ name: r.name, account: r.account, target: r.target, targetDate: r.targetDate })),
    recurring: (state.recurringRules ?? []).map(r => ({ name: r.name, category: r.category, cadence: r.cadence, amount: r.amount, validFrom: r.validFrom })),
  };
  if (state.settlementAccounts !== undefined) {
    rawConfig['settlement'] = { accounts: state.settlementAccounts.map(a => ({ account: a.account, partner: a.partner })) };
  }
  return rawConfig;
}

function buildServices(state: ExplainWorld): {
  transferCalculator: SafeTransferCalculator;
  contributionQuery: ContributionQuery;
  settlementConfigured: boolean;
} {
  const configResult = parseRawConfig(buildRawConfig(state));
  if (configResult.isFailure) throw new Error(`config parse failed: ${configResult.error}`);
  const config = configResult.value;

  const fakeLedger: BufferLedgerQuery = {
    sumEntriesByAccount(account: string, expectedCurrency: string, asOfDate: string): Result<Money> {
      const points = state.balancePoints?.get(account) ?? [];
      const eligible = points.filter(p => p.asOfDate <= asOfDate).sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : -1));
      return Money.fromCents(eligible[0]?.cents ?? 0, expectedCurrency);
    },
  };

  const splitsService = new SplitRulesService(config.splits);
  const buffersService = new BufferStateService(config.buffers, config.defaultCurrency, fakeLedger);
  const forecastService = new RecurringForecastService(config.recurring);
  const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, config.defaultCurrency);

  const db = ensureDb(state);
  const mappings = (state.settlementAccounts ?? []).map(a => ({ account: a.account, partner: a.partner }));
  const contributionQuery = new SqliteContributionQuery(db, mappings);

  return { transferCalculator, contributionQuery, settlementConfigured: config.settlement !== undefined };
}

// ─── Given: fixtures specific to explain (credits reuse settlement-variance.steps.ts's
// "a credit of {float} EUR on {string} occurred at {string}" step verbatim) ────────────

// (split window / recurring rule / buffer / buffer ledger balance / settlement accounts /
// credit Given steps are registered once in settlement-variance.steps.ts and reused here
// by matching step text — see the file header.)

// ─── When ──────────────────────────────────────────────────────────────────────

async function invokeExplain(state: ExplainWorld, asOf: string, json: boolean): Promise<void> {
  const { transferCalculator, contributionQuery, settlementConfigured } = buildServices(state);
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const fakeStdout = { write(chunk: string) { stdoutChunks.push(chunk); return true; } } as unknown as NodeJS.WritableStream;
  const fakeStderr = { write(chunk: string) { stderrChunks.push(chunk); return true; } } as unknown as NodeJS.WritableStream;

  const exitCode = await runExplainCommand(
    { asOf, json },
    {
      transferCalculator,
      contributionQuery,
      settlementConfigured,
      clock: () => asOf,
      stdout: fakeStdout,
      stderr: fakeStderr,
    },
  );

  state.result = { exitCode, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
}

When('I run explain with --as-of {string}', async function (state: ExplainWorld, asOf: string) {
  await invokeExplain(state, asOf, false);
});

When('I run explain with --as-of {string} and --json', async function (state: ExplainWorld, asOf: string) {
  await invokeExplain(state, asOf, true);
});

// ─── Then ──────────────────────────────────────────────────────────────────────

Then('the explain command exits with code {int}', function (state: ExplainWorld, code: number) {
  expect(state.result!.exitCode).toBe(code);
});

Then('explain stdout is empty', function (state: ExplainWorld) {
  expect(state.result!.stdout).toBe('');
});

Then('explain stderr contains {string} and {string}', function (state: ExplainWorld, a: string, b: string) {
  expect(state.result!.stderr).toContain(a);
  expect(state.result!.stderr).toContain(b);
});

Then('explain stdout contains the CFO headline mentioning {string}', function (state: ExplainWorld, phrase: string) {
  expect(state.result!.stdout).toContain(phrase);
});

Then('explain stdout contains a {string} cause for {string}', function (state: ExplainWorld, marker: string, cause: string) {
  const { stdout } = state.result!;
  expect(stdout).toContain(cause);
  expect(stdout).toContain(marker);
});

Then('explain stdout contains per-partner columns {string} and {string}', function (state: ExplainWorld, p1: string, p2: string) {
  expect(state.result!.stdout).toContain(p1);
  expect(state.result!.stdout).toContain(p2);
});

Then('explain stdout contains the follow-through line for {string} and {string}', function (state: ExplainWorld, p1: string, p2: string) {
  const { stdout } = state.result!;
  expect(stdout).toContain('Follow-through');
  expect(stdout).toContain(p1);
  expect(stdout).toContain(p2);
});

Then(
  'explain follow-through says not configured with a Suggested action naming accounting.yaml and settlement:',
  function (state: ExplainWorld) {
    const { stdout } = state.result!;
    expect(stdout).toContain('Not configured');
    expect(stdout).toContain('accounting.yaml');
    expect(stdout).toContain('settlement:');
  },
);

Then('explain stdout shows the variance calc error with a Suggested action naming {string}', function (state: ExplainWorld, name: string) {
  const { stdout } = state.result!;
  expect(stdout).toContain('Suggested action');
  expect(stdout).toContain(name);
});

interface JsonVarianceLineRow {
  presence: string;
}

Then('explain stdout is valid JSON with keys asOf, thisWindow, lastWindow, variance, followThrough', function (state: ExplainWorld) {
  const parsed = JSON.parse(state.result!.stdout) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['asOf', 'thisWindow', 'lastWindow', 'variance', 'followThrough']));
});

Then('explain stdout contains only JSON \\(no prose\\)', function (state: ExplainWorld) {
  const { stdout } = state.result!;
  expect(stdout.trim().startsWith('{')).toBe(true);
  expect(stdout.trim().endsWith('}')).toBe(true);
});

Then(
  'the JSON variance lines include presence classes {string}, {string}, and {string}',
  function (state: ExplainWorld, p1: string, p2: string, p3: string) {
    const parsed = JSON.parse(state.result!.stdout) as { variance: { lines: JsonVarianceLineRow[] } };
    const presences = new Set(parsed.variance.lines.map(l => l.presence));
    expect(presences).toEqual(new Set([p1, p2, p3]));
  },
);

Then('the JSON variance totalDelta is negative', function (state: ExplainWorld) {
  const parsed = JSON.parse(state.result!.stdout) as { variance: { totalDelta: string } };
  expect(parsed.variance.totalDelta).toMatch(/^EUR -/);
});

Then('the JSON variance perPartnerDelta has keys {string} and {string}', function (state: ExplainWorld, p1: string, p2: string) {
  const parsed = JSON.parse(state.result!.stdout) as { variance: { perPartnerDelta: Record<string, string> } };
  expect(Object.keys(parsed.variance.perPartnerDelta)).toEqual(expect.arrayContaining([p1, p2]));
});

Then('the JSON followThrough perPartner has keys {string} and {string}', function (state: ExplainWorld, p1: string, p2: string) {
  const parsed = JSON.parse(state.result!.stdout) as { followThrough: { perPartner: Record<string, unknown> } };
  expect(Object.keys(parsed.followThrough.perPartner)).toEqual(expect.arrayContaining([p1, p2]));
});

Then('every variance line in the JSON has presence {string}', function (state: ExplainWorld, presence: string) {
  const parsed = JSON.parse(state.result!.stdout) as { variance: { lines: JsonVarianceLineRow[] } };
  const presences = new Set(parsed.variance.lines.map(l => l.presence));
  expect(presences).toEqual(new Set([presence]));
});

Then(
  'the JSON followThrough perPartner actual is 0.00 EUR for {string} and {string}',
  function (state: ExplainWorld, p1: string, p2: string) {
    const parsed = JSON.parse(state.result!.stdout) as { followThrough: { perPartner: Record<string, { actual: string }> } };
    expect(parsed.followThrough.perPartner[p1].actual).toBe('EUR 0.00');
    expect(parsed.followThrough.perPartner[p2].actual).toBe('EUR 0.00');
  },
);

// ─── Scenario 7 — R4 composition-root subprocess journey ──────────────────────

function writeSettlementYaml(tmpDir: string): void {
  const yaml = `\
dbPath: ./test.db
defaultCurrency: EUR
timezone: Europe/Paris
accounts:
  - id: bpce-settlement-account
    type: bank
    filenamePrefix: "bpce-settlement_"
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alex, ratio: 0.5 }
      - { partner: Sam, ratio: 0.5 }
buffers: []
recurring: []
autoTagRules:
  - category: ContributionAlex
    patterns:
      - "contribution alex"
  - category: ContributionSam
    patterns:
      - "contribution sam"
settlement:
  accounts:
    - account: "Income:ContributionAlex"
      partner: Alex
    - account: "Income:ContributionSam"
      partner: Sam
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

Given('a fresh temp dir with a migrated DB and accounting.yaml configured for settlement', function (state: ExplainWorld) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-explain-r4-'));
  tmpDirs.push(tmpDir);
  state.subprocessTmpDir = tmpDir;
  writeSettlementYaml(tmpDir);
  const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
  if (migrateResult.status !== 0) throw new Error(`migrate failed: ${migrateResult.stderr}`);
});

Given('the settlement CSV fixture has been ingested non-interactively', function (state: ExplainWorld) {
  const tmpDir = state.subprocessTmpDir!;
  const csvDest = path.join(tmpDir, 'bpce-settlement_2026-06.csv');
  fs.copyFileSync(path.join(__dirname, '../../fixtures/csv/bpce-settlement.csv'), csvDest);
  const ingestResult = spawnCli(['ingest', '-f', csvDest, '--non-interactive'], { cwd: tmpDir });
  if (ingestResult.status !== 0) throw new Error(`ingest failed (status ${ingestResult.status}): ${ingestResult.stderr}`);
});

When('I run the explain binary with --as-of {string} and --json', function (state: ExplainWorld, asOf: string) {
  state.subprocessResult = spawnCli(['explain', '--as-of', asOf, '--json'], { cwd: state.subprocessTmpDir! });
});

Then('the explain subprocess exits with code {int}', function (state: ExplainWorld, code: number) {
  expect(state.subprocessResult!.status).toBe(code);
});

Then('the explain subprocess JSON output matches the documented shape', function (state: ExplainWorld) {
  const { stdout } = state.subprocessResult!;
  const parsed = JSON.parse(stdout) as { asOf: string; thisWindow: unknown; lastWindow: unknown; variance: unknown; followThrough: { perPartner?: Record<string, unknown> } };
  expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['asOf', 'thisWindow', 'lastWindow', 'variance', 'followThrough']));
  expect(parsed.asOf).toBe('2026-06-28');
});
