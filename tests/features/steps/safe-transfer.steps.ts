/**
 * Step bindings for safe-transfer.feature (Story 3.4).
 * In-process only: all three constructor-injected services wired from in-memory configs.
 * No SQL, no FS — the calculator depends solely on service interfaces.
 */
import { expect } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import { SafeTransferCalculator } from '../../../src/core/transfer/safe-transfer-calculator.js';
import { SplitRulesService } from '../../../src/core/splits/split-rules-service.js';
import { BufferStateService } from '../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../src/core/recurring/recurring-forecast-service.js';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { Money } from '../../../src/core/shared/money.js';
import type { Result } from '../../../src/core/shared/result.js';
import type { SafeTransferCalculation } from '../../../src/core/transfer/safe-transfer-calculation.js';
import type { BufferLedgerQuery } from '../../../src/core/ports/buffer-ledger-query.js';

interface SplitWindowRow {
  validFrom: string;
  partner: string;
  ratio: string;
}

interface RecurringRuleRow {
  name: string;
  category: string;
  cadence: string;
  amount: string;
  validFrom: string;
}

interface BufferRow {
  name: string;
  account: string;
  target: string;
  targetDate: string;
  currentBalance: string;
}

interface LineItemRow {
  kind: string;
  date: string;
  category: string;
  gross: string;
}

interface World {
  splitWindows?: Array<{ validFrom: string; rules: Array<{ partner: string; ratio: number }> }>;
  recurringRules?: Array<{
    name: string;
    category: string;
    cadence: string;
    amount: number;
    validFrom: string;
  }>;
  bufferRows?: BufferRow[];
  // stateResult is the canonical field used by the shared 'the result is success/failure'
  // steps defined in buffer-status.steps.ts. We alias calcResult to it.
  stateResult?: Result<SafeTransferCalculation>;
}

// ─── Split window steps ───────────────────────────────────────────────────────
// Uses 'a transfer config with splits:' to avoid ambiguity with the existing
// 'a config with two split windows:' step defined in split-rules.steps.ts.

Given(
  'a transfer config with splits:',
  function (state: World, table: { hashes: () => SplitWindowRow[] }) {
    const rows = table.hashes();
    const grouped = new Map<string, Array<{ partner: string; ratio: number }>>();
    for (const row of rows) {
      const vf = row.validFrom.trim();
      if (!grouped.has(vf)) grouped.set(vf, []);
      grouped.get(vf)!.push({ partner: row.partner.trim(), ratio: Number(row.ratio) });
    }
    state.splitWindows = [...grouped.entries()].map(([validFrom, rules]) => ({ validFrom, rules }));
  },
);

// ─── Recurring rule steps ─────────────────────────────────────────────────────

Given(
  'one recurring rule:',
  function (state: World, table: { hashes: () => RecurringRuleRow[] }) {
    const rows = table.hashes();
    state.recurringRules = rows.map(r => ({
      name: r.name.trim(),
      category: r.category.trim(),
      cadence: r.cadence.trim(),
      amount: Number(r.amount),
      validFrom: r.validFrom.trim(),
    }));
  },
);

Given('no buffer buckets', function (state: World) {
  state.bufferRows = [];
});

Given('no recurring rules', function (state: World) {
  state.recurringRules = [];
});

// ─── Buffer steps ─────────────────────────────────────────────────────────────

Given(
  'one buffer:',
  function (state: World, table: { hashes: () => BufferRow[] }) {
    state.bufferRows = table.hashes();
    if (!state.splitWindows) {
      state.splitWindows = [
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 0.5 },
            { partner: 'Sam', ratio: 0.5 },
          ],
        },
      ];
    }
  },
);

Given(
  'a config with one buffer:',
  function (state: World, table: { hashes: () => BufferRow[] }) {
    state.bufferRows = table.hashes();
    state.splitWindows = [
      {
        validFrom: '2024-01-01',
        rules: [
          { partner: 'Alex', ratio: 0.5 },
          { partner: 'Sam', ratio: 0.5 },
        ],
      },
    ];
    state.recurringRules = [];
  },
);

// ─── When step ────────────────────────────────────────────────────────────────

When(
  'I calculate for window asOf={string} from={string} to={string}',
  function (state: World, asOf: string, from: string, to: string) {
    const bufferRows = state.bufferRows ?? [];
    const splitWindows = state.splitWindows ?? [];
    const recurringRules = state.recurringRules ?? [];

    const rawConfig = {
      dbPath: './data/ledger.db',
      defaultCurrency: 'EUR',
      timezone: 'Europe/Paris',
      accounts: [{ id: 'main-1', type: 'bank', filenamePrefix: '12345678901_' }],
      splits: splitWindows,
      buffers: bufferRows.map(r => ({
        name: r.name.trim(),
        account: r.account.trim(),
        target: Number(r.target),
        targetDate: r.targetDate.trim(),
      })),
      recurring: recurringRules.map(r => ({
        name: r.name,
        category: r.category,
        cadence: r.cadence,
        amount: r.amount,
        validFrom: r.validFrom,
      })),
    };

    const configResult = parseRawConfig(rawConfig);
    if (configResult.isFailure) throw new Error(`Config parse failed: ${configResult.error}`);
    const config = configResult.value;

    const balanceMap = new Map<string, number>();
    for (const r of bufferRows) {
      balanceMap.set(r.account.trim(), Number(r.currentBalance) * 100);
    }

    const fakeLedger: BufferLedgerQuery = {
      sumEntriesByAccount(account: string, expectedCurrency: string): Result<Money> {
        const cents = balanceMap.get(account) ?? 0;
        return Money.fromCents(cents, expectedCurrency);
      },
    };

    const splitsService = new SplitRulesService(config.splits);
    const buffersService = new BufferStateService(config.buffers, config.defaultCurrency, fakeLedger);
    const forecastService = new RecurringForecastService(config.recurring);

    const calculator = new SafeTransferCalculator(splitsService, buffersService, forecastService);
    state.stateResult = calculator.calculateForWindow(asOf, from, to);
  },
);

// ─── Then steps ───────────────────────────────────────────────────────────────
// NOTE: 'the result is success' and 'the result is failure' are defined in
// buffer-status.steps.ts and reused globally. Safe-transfer scenarios use them
// via the World.stateResult / World.calcResult field — we set stateResult as
// an alias so the shared step works.

Then(
  'totalRequired is {float} EUR',
  function (state: World, amount: number) {
    const calc = state.stateResult!.value;
    expect(calc.totalRequired.amount).toBe(Math.round(amount * 100));
    expect(calc.totalRequired.currency).toBe('EUR');
  },
);

Then(
  'totalRequired is exactly {float} EUR',
  function (state: World, amount: number) {
    const calc = state.stateResult!.value;
    expect(calc.totalRequired.amount).toBe(Math.round(amount * 100));
    expect(calc.totalRequired.currency).toBe('EUR');
  },
);

Then(
  'Alex contributes {float} EUR and Sam contributes {float} EUR',
  function (state: World, alexAmount: number, samAmount: number) {
    const calc = state.stateResult!.value;
    const alexCents = Math.round(alexAmount * 100);
    const samCents = Math.round(samAmount * 100);
    expect(calc.perPartner.get('Alex')?.amount).toBe(alexCents);
    expect(calc.perPartner.get('Sam')?.amount).toBe(samCents);
  },
);

Then(
  'lineItems lists exactly:',
  function (state: World, table: { hashes: () => LineItemRow[] }) {
    const rows = table.hashes();
    const calc = state.stateResult!.value;
    expect(calc.lineItems).toHaveLength(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const item = calc.lineItems[i];
      expect(item.kind).toBe(row.kind.trim());
      expect(item.date).toBe(row.date.trim());
      expect(item.category).toBe(row.category.trim());
      const [amountStr, currency] = row.gross.trim().split(' ') as [string, string];
      expect(item.gross.amount).toBe(Math.round(Number(amountStr) * 100));
      expect(item.gross.currency).toBe(currency);
    }
  },
);

Then(
  'the line item on {string} shows Alex {int} EUR and Sam {int} EUR',
  function (state: World, date: string, alexAmount: number, samAmount: number) {
    const calc = state.stateResult!.value;
    const item = calc.lineItems.find(i => i.date === date);
    expect(item).toBeDefined();
    expect(item!.perPartnerSplit.get('Alex')?.amount).toBe(alexAmount * 100);
    expect(item!.perPartnerSplit.get('Sam')?.amount).toBe(samAmount * 100);
  },
);

Then(
  'lineItems contains exactly 4 buffer-topup entries dated 2026-05-01, 2026-06-01, 2026-07-01, 2026-08-01 each at {float} EUR gross',
  function (state: World, grossAmount: number) {
    const calc = state.stateResult!.value;
    const topups = calc.lineItems.filter(i => i.kind === 'buffer-topup');
    expect(topups).toHaveLength(4);
    const expectedDates = ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'];
    for (let i = 0; i < 4; i++) {
      expect(topups[i].date).toBe(expectedDates[i]);
      expect(topups[i].gross.amount).toBe(Math.round(grossAmount * 100));
    }
  },
);

Then(
  'the error contains {string} and {string} and the phrase {string}',
  function (state: World, part1: string, part2: string, phrase: string) {
    expect(state.stateResult?.isFailure).toBe(true);
    const err = state.stateResult!.error;
    expect(err).toContain(part1);
    expect(err).toContain(part2);
    expect(err).toContain(phrase);
  },
);

Then('lineItems is empty', function (state: World) {
  const calc = state.stateResult!.value;
  expect(calc.lineItems).toHaveLength(0);
});
