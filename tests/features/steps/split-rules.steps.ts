import { expect } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { SplitRulesService } from '../../../src/core/splits/split-rules-service.js';
import type { Result } from '../../../src/core/shared/result.js';
import type { AppConfig, SplitWindow } from '../../../src/core/config/app-config.js';

interface World {
  rawSplits?: unknown;
  parseResult?: Result<AppConfig>;
  service?: SplitRulesService;
  pendingPartners?: { window0?: string; window1?: string };
}

function baseRaw(splits: unknown): Record<string, unknown> {
  return {
    dbPath: './data/ledger.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [
      { id: 'main-12345678901', type: 'bank', filenamePrefix: '12345678901_' },
    ],
    splits,
    buffers: [],
  };
}

interface DataTableRow {
  validFrom: string;
  partner: string;
  ratio: string;
}

function rowsToWindows(rows: DataTableRow[]): SplitWindow[] {
  const grouped = new Map<string, { partner: string; ratio: number }[]>();
  for (const row of rows) {
    const list = grouped.get(row.validFrom) ?? [];
    list.push({ partner: row.partner, ratio: Number(row.ratio) });
    grouped.set(row.validFrom, list);
  }
  return [...grouped.entries()].map(([validFrom, rules]) => ({ validFrom, rules }));
}

function partnerListToRules(csv: string): { partner: string; ratio: number }[] {
  const partners = csv.split(',').map((p) => p.trim()).filter(Boolean);
  // Even split so the per-window sum-to-1 invariant holds; the test exercises
  // partner-set drift, not ratio drift.
  const ratio = Math.round((1 / partners.length) * 1e9) / 1e9;
  const rules = partners.map((p) => ({ partner: p, ratio }));
  // Largest-Remainder fix-up: bump the last partner so sum equals 1.0 exactly.
  const sum = rules.reduce((a, r) => a + r.ratio, 0);
  rules[rules.length - 1].ratio += 1 - sum;
  return rules;
}

// Scenario 1 — active ratios resolve to the latest window
Given('a config with two split windows:', function (state: World, table: { hashes: () => DataTableRow[] }) {
  const rows = table.hashes();
  const windows = rowsToWindows(rows);
  state.rawSplits = windows;
  state.service = new SplitRulesService(windows);
});

When('I look up the active splits as of {string}', function (state: World, date: string) {
  // Cache the most recent query so 'Then the active ratios are …' can read it.
  (state as World & { lastQuery?: Result<readonly { partner: string; ratio: number }[]> }).lastQuery
    = state.service!.getSplitsAsOf(date);
});

Then('the active ratios are Alex {float} and Sam {float}', function (state: World, alex: number, sam: number) {
  const result = (state as World & { lastQuery?: Result<readonly { partner: string; ratio: number }[]> }).lastQuery!;
  expect(result.isSuccess).toBe(true);
  expect(result.value).toEqual([
    { partner: 'Alex', ratio: alex },
    { partner: 'Sam', ratio: sam },
  ]);
});

Then('looking up the active splits as of {string} also returns {float} \\/ {float} \\(start-inclusive)', function (state: World, date: string, alex: number, sam: number) {
  const result = state.service!.getSplitsAsOf(date);
  expect(result.isSuccess).toBe(true);
  expect(result.value).toEqual([
    { partner: 'Alex', ratio: alex },
    { partner: 'Sam', ratio: sam },
  ]);
});

Then('looking up the active splits as of {string} returns {float} \\/ {float} \\(end-exclusive)', function (state: World, date: string, alex: number, sam: number) {
  const result = state.service!.getSplitsAsOf(date);
  expect(result.isSuccess).toBe(true);
  expect(result.value).toEqual([
    { partner: 'Alex', ratio: alex },
    { partner: 'Sam', ratio: sam },
  ]);
});

Then('looking up the active splits as of {string} returns Result.fail with {string}', function (state: World, date: string, expectedFragment: string) {
  const result = state.service!.getSplitsAsOf(date);
  expect(result.isFailure).toBe(true);
  expect(result.error).toContain(expectedFragment);
});

// Scenario 2 — duplicate validFrom rejected at parse
Given('a config has two split windows both starting on {string}', function (state: World, dupeDate: string) {
  state.rawSplits = [
    {
      validFrom: dupeDate,
      rules: [
        { partner: 'Alex', ratio: 0.5 },
        { partner: 'Sam', ratio: 0.5 },
      ],
    },
    {
      validFrom: dupeDate,
      rules: [
        { partner: 'Alex', ratio: 0.6 },
        { partner: 'Sam', ratio: 0.4 },
      ],
    },
  ];
});

When('the configuration is loaded', function (state: World) {
  if (state.pendingPartners) {
    const wins = [
      { validFrom: '2024-01-01', rules: partnerListToRules(state.pendingPartners.window0!) },
      { validFrom: '2026-03-15', rules: partnerListToRules(state.pendingPartners.window1!) },
    ];
    state.rawSplits = wins;
  }
  state.parseResult = parseRawConfig(baseRaw(state.rawSplits));
});

Then('loading fails with an error citing the duplicate validFrom by index', function (state: World) {
  const result = state.parseResult!;
  expect(result.isFailure).toBe(true);
  expect(result.error).toContain('splits.1.validFrom');
  expect(result.error).toContain('strictly after');
});

Then('the error message contains no stack trace and no Zod-internal type name', function (state: World) {
  const result = state.parseResult!;
  expect(result.isFailure).toBe(true);
  expect(result.error).not.toContain('ZodError');
  expect(result.error).not.toContain('at parseRawConfig');
  expect(result.error).not.toMatch(/\bat\s+\S+:\d+:\d+\b/); // generic "at file:line:col" stack-frame shape
});

// Scenario 3 — partner roster must be identical across windows (path-cited, PII-safe)
Given('a config where window 0 has partners {string}', function (state: World, csv: string) {
  state.pendingPartners = { window0: csv };
});

Given('window 1 has partners {string}', function (state: World, csv: string) {
  state.pendingPartners!.window1 = csv;
});

Then('loading fails with an error citing the offending window by index', function (state: World) {
  const result = state.parseResult!;
  expect(result.isFailure).toBe(true);
  expect(result.error).toContain('splits.1.rules');
  expect(result.error).toContain('partner roster differs from window 0');
});

Then('the error message does NOT echo any partner name verbatim', function (state: World) {
  const result = state.parseResult!;
  expect(result.isFailure).toBe(true);
  expect(result.error).not.toContain('Alex');
  expect(result.error).not.toContain('Sam');
  expect(result.error).not.toContain('Jordan');
});
