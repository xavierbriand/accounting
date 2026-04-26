/**
 * Step bindings for recurring-forecast.feature (Story 3.3).
 *
 * Pure config service — no port, no adapter, no SQL. All six scenarios use
 * a fake-free path (config is built in-process from table data).
 *
 * R7 note: there is no SQL layer in RecurringForecastService. The step-wiring
 * split (real adapter for SQL claims, fake otherwise) from Story 3.2 does not
 * apply here — all scenarios are in-process against the pure service.
 */
import { expect } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { Result } from '../../../src/core/shared/result.js';
import type { ForecastOccurrence } from '../../../src/core/recurring/forecast-occurrence.js';
import { RecurringForecastService } from '../../../src/core/recurring/recurring-forecast-service.js';

interface RuleTableRow {
  name: string;
  category: string;
  cadence: string;
  amount: string;
  validFrom: string;
  validTo?: string;
}

interface AmendmentTableRow {
  validFrom: string;
  amount: string;
}

interface World {
  pendingRules?: RuleTableRow[];
  pendingAmendments?: Record<string, AmendmentTableRow[]>;
  forecastResult?: Result<readonly ForecastOccurrence[]>;
  parseResult?: Result<unknown>;
}

function baseRaw(recurring: unknown): Record<string, unknown> {
  return {
    dbPath: './data/ledger.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [
      { id: 'main-12345678901', type: 'bank', filenamePrefix: '12345678901_' },
    ],
    splits: [
      {
        validFrom: '2024-01-01',
        rules: [
          { partner: 'Alex', ratio: 0.5 },
          { partner: 'Sam', ratio: 0.5 },
        ],
      },
    ],
    buffers: [],
    recurring,
  };
}

function buildRawRules(
  rules: RuleTableRow[],
  amendments: Record<string, AmendmentTableRow[]>,
): unknown[] {
  return rules.map(r => {
    const amends = amendments[r.name] ?? [];
    const base: Record<string, unknown> = {
      name: r.name.trim(),
      category: r.category.trim(),
      cadence: r.cadence.trim(),
      amount: Number(r.amount),
      validFrom: r.validFrom.trim(),
    };
    if (r.validTo !== undefined && r.validTo.trim() !== '') {
      base.validTo = r.validTo.trim();
    }
    if (amends.length > 0) {
      base.amendments = amends.map(a => ({
        validFrom: a.validFrom.trim(),
        amount: Number(a.amount),
      }));
    }
    return base;
  });
}

// ─── Given steps ─────────────────────────────────────────────────────────────

Given(
  'a config with one recurring rule:',
  function (state: World, table: { hashes: () => RuleTableRow[] }) {
    state.pendingRules = table.hashes();
    state.pendingAmendments = {};
  },
);

Given(
  'rule {string} has amendments:',
  function (state: World, _name: string, table: { hashes: () => AmendmentTableRow[] }) {
    // _name is ignored — we key amendments by rule name from the Given table above
    // but the scenario only ever has one rule, so we attach to the first rule.
    const ruleName = state.pendingRules![0].name.trim();
    state.pendingAmendments ??= {};
    state.pendingAmendments[ruleName] = table.hashes();
  },
);

Given(
  'a config where the second recurring rule has cadence {string}',
  function (state: World, badCadence: string) {
    const raw = baseRaw([
      { name: 'Rent', category: 'Rent', cadence: 'monthly', amount: 1000, validFrom: '2024-01-01' },
      { name: 'Netflix', category: 'Subscriptions', cadence: badCadence, amount: 12.99, validFrom: '2024-01-01' },
    ]);
    state.parseResult = parseRawConfig(raw);
  },
);

// ─── When steps ──────────────────────────────────────────────────────────────

When(
  'I forecast between {string} and {string}',
  function (state: World, from: string, to: string) {
    const rules = buildRawRules(
      state.pendingRules ?? [],
      state.pendingAmendments ?? {},
    );
    const configResult = parseRawConfig(baseRaw(rules));
    if (configResult.isFailure) {
      state.forecastResult = Result.fail(configResult.error);
      return;
    }
    const service = new RecurringForecastService(configResult.value.recurring);
    state.forecastResult = service.forecastBetween(from, to);
  },
);

When(
  'the recurring config is parsed',
  function (state: World) {
    // parseResult already set in the Given step for scenario 6.
    void state;
  },
);

// ─── Then steps ──────────────────────────────────────────────────────────────

Then(
  'the forecast lists exactly:',
  function (state: World, table: { hashes: () => { name: string; expectedDate: string; amount: string }[] }) {
    expect(state.forecastResult?.isSuccess).toBe(true);
    const occurrences = state.forecastResult!.value;
    const expected = table.hashes();
    expect(occurrences).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const row = expected[i];
      const occ = occurrences[i];
      expect(occ.name).toBe(row.name.trim());
      expect(occ.expectedDate).toBe(row.expectedDate.trim());
      // Parse "12.99 EUR" or "1000.00 EUR"
      const [amountStr, currency] = row.amount.trim().split(/\s+/);
      const expectedCents = Math.round(Number(amountStr) * 100);
      expect(occ.amount.amount).toBe(expectedCents);
      expect(occ.amount.currency).toBe(currency);
    }
  },
);

Then(
  'the forecast lists expectedDates {string}, {string}, {string}, {string} each at {float} EUR',
  function (
    state: World,
    date1: string,
    date2: string,
    date3: string,
    date4: string,
    amount: number,
  ) {
    expect(state.forecastResult?.isSuccess).toBe(true);
    const occurrences = state.forecastResult!.value;
    const expectedDates = [date1, date2, date3, date4];
    expect(occurrences).toHaveLength(4);
    const expectedCents = Math.round(amount * 100);
    for (let i = 0; i < 4; i++) {
      expect(occurrences[i].expectedDate).toBe(expectedDates[i]);
      expect(occurrences[i].amount.amount).toBe(expectedCents);
      expect(occurrences[i].amount.currency).toBe('EUR');
    }
  },
);
