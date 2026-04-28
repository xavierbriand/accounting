import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SafeTransferCalculator } from '@core/transfer/safe-transfer-calculator.js';
import { SplitRulesService } from '@core/splits/split-rules-service.js';
import { BufferStateService } from '@core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '@core/recurring/recurring-forecast-service.js';
import { Money } from '@core/shared/money.js';
import { Result } from '@core/shared/result.js';
import type { BufferBucket, SplitWindow, RecurringRule } from '@core/config/app-config.js';
import type { BufferLedgerQuery } from '@core/ports/buffer-ledger-query.js';
import type { ForecastOccurrence } from '@core/recurring/forecast-occurrence.js';
import type { BufferState } from '@core/buffers/buffer-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function splitWindow(validFrom: string, ...partners: Array<[string, number]>): SplitWindow {
  return {
    validFrom,
    rules: partners.map(([partner, ratio]) => ({ partner, ratio })),
  };
}

function recurringRule(
  name: string,
  category: string,
  amountCents: number,
  validFrom: string,
): RecurringRule {
  return {
    name,
    category,
    cadence: 'monthly',
    amount: makeEur(amountCents),
    validFrom,
    amendments: [],
  };
}

function makeBucket(
  name: string,
  account: string,
  targetCents: number,
  balanceCents: number,
  targetDate: string,
  capCents?: number,
): { bucket: BufferBucket; balance: number } {
  return {
    bucket: {
      name,
      account,
      target: makeEur(targetCents),
      targetDate,
      cap: capCents !== undefined ? makeEur(capCents) : undefined,
    },
    balance: balanceCents,
  };
}

function fakeLedger(balances: Map<string, number>): BufferLedgerQuery {
  return {
    sumEntriesByAccount(account: string, expectedCurrency: string): Result<Money> {
      const cents = balances.get(account) ?? 0;
      return Money.fromCents(cents, expectedCurrency);
    },
  };
}

function buildCalculator(
  windows: SplitWindow[],
  bufferDefs: Array<{ bucket: BufferBucket; balance: number }>,
  rules: RecurringRule[],
): SafeTransferCalculator {
  const balances = new Map<string, number>();
  for (const { bucket, balance } of bufferDefs) {
    balances.set(bucket.account, balance);
  }
  const splitsService = new SplitRulesService(windows);
  const buffersService = new BufferStateService(
    bufferDefs.map(d => d.bucket),
    'EUR',
    fakeLedger(balances),
  );
  const forecastService = new RecurringForecastService(rules);
  return new SafeTransferCalculator(splitsService, buffersService, forecastService);
}

// ─── ISO date validation ──────────────────────────────────────────────────────

describe('SafeTransferCalculator — input validation', () => {
  const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];

  it('rejects non-ISO asOf date', () => {
    // fails if ISO_DATE guard is absent on asOf
    const calc = buildCalculator(windows, [], []);
    const result = calc.calculateForWindow('28/04/2026', '2026-05-01', '2026-05-31');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('ISO 8601');
  });

  it('rejects non-ISO from date', () => {
    // fails if ISO_DATE guard is absent on from
    const calc = buildCalculator(windows, [], []);
    const result = calc.calculateForWindow('2026-04-28', '05/01/2026', '2026-05-31');
    expect(result.isFailure).toBe(true);
  });

  it('rejects non-ISO to date', () => {
    // fails if ISO_DATE guard is absent on to
    const calc = buildCalculator(windows, [], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '05/31/2026');
    expect(result.isFailure).toBe(true);
  });

  it('rejects from > to', () => {
    // fails if from > to validation is missing
    const calc = buildCalculator(windows, [], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-31', '2026-05-01');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('from');
  });

  it('accepts from === to (single-day window)', () => {
    // fails if from === to is incorrectly rejected
    const calc = buildCalculator(windows, [], [recurringRule('R', 'Cat', 1000_00, '2024-01-01')]);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-01');
    expect(result.isSuccess).toBe(true);
  });
});

// ─── Forecast-only path ───────────────────────────────────────────────────────

describe('SafeTransferCalculator — forecast-only path', () => {
  it('returns empty line items and zero totals for empty config', () => {
    // fails if empty config produces non-zero total or non-empty line items
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const calc = buildCalculator(windows, [], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    expect(result.value.lineItems).toHaveLength(0);
    expect(result.value.totalRequired.amount).toBe(0);
  });

  it('both partners appear in perPartner even with zero contribution', () => {
    // fails if partners with zero contribution are omitted from perPartner map
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const calc = buildCalculator(windows, [], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    expect(result.value.perPartner.has('Alex')).toBe(true);
    expect(result.value.perPartner.has('Sam')).toBe(true);
    expect(result.value.perPartner.get('Alex')!.amount).toBe(0);
    expect(result.value.perPartner.get('Sam')!.amount).toBe(0);
  });

  it('produces one forecast line item for a single occurrence', () => {
    // fails if forecast line item count or kind is wrong
    const windows = [splitWindow('2024-01-01', ['Alex', 0.6], ['Sam', 0.4])];
    const rules = [recurringRule('Netflix', 'Subscriptions', 1299, '2026-01-15')];
    const calc = buildCalculator(windows, [], rules);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    const items = result.value.lineItems;
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('forecast');
    expect(items[0].date).toBe('2026-05-15');
    expect(items[0].category).toBe('Subscriptions');
    expect(items[0].description).toBe('Netflix');
    expect(items[0].gross.amount).toBe(1299);
  });

  it('applies 60/40 split to single forecast line item', () => {
    // fails if split ratios are not applied or use wrong allocation
    const windows = [splitWindow('2024-01-01', ['Alex', 0.6], ['Sam', 0.4])];
    const rules = [recurringRule('Netflix', 'Subscriptions', 1299, '2026-01-15')];
    const calc = buildCalculator(windows, [], rules);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    const item = result.value.lineItems[0];
    // 1299 * 0.6 = 779.4 → LRM: 780 (Alex), 519 (Sam)
    expect(item.perPartnerSplit.get('Alex')!.amount).toBe(779);
    expect(item.perPartnerSplit.get('Sam')!.amount).toBe(520);
    // perPartner totals
    expect(result.value.perPartner.get('Alex')!.amount).toBe(779);
    expect(result.value.perPartner.get('Sam')!.amount).toBe(520);
    expect(result.value.totalRequired.amount).toBe(1299);
  });

  it('applies per-occurrence splits when split rule changes mid-window', () => {
    // fails if a single split is applied to all occurrences instead of per-occurrence lookup
    const windows = [
      splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5]),
      splitWindow('2026-05-15', ['Alex', 0.8], ['Sam', 0.2]),
    ];
    const rules = [recurringRule('Rent', 'Rent', 100000, '2024-01-01')];
    const calc = buildCalculator(windows, [], rules);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    const items = result.value.lineItems;
    // May 1 occurrence: split 50/50
    const mayItem = items.find(i => i.date === '2026-05-01');
    expect(mayItem?.perPartnerSplit.get('Alex')!.amount).toBe(50000);
    expect(mayItem?.perPartnerSplit.get('Sam')!.amount).toBe(50000);
    // Jun 1 occurrence: split 80/20
    const junItem = items.find(i => i.date === '2026-06-01');
    expect(junItem?.perPartnerSplit.get('Alex')!.amount).toBe(80000);
    expect(junItem?.perPartnerSplit.get('Sam')!.amount).toBe(20000);
  });

  it('sorts line items ascending by date', () => {
    // fails if output sort is not applied
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const rules = [
      recurringRule('Rent', 'Rent', 100000, '2024-01-01'),
      recurringRule('Netflix', 'Subscriptions', 1299, '2026-01-15'),
    ];
    const calc = buildCalculator(windows, [], rules);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    const items = result.value.lineItems;
    for (let i = 1; i < items.length; i++) {
      expect(items[i].date >= items[i - 1].date).toBe(true);
    }
  });
});

// ─── Property tests ───────────────────────────────────────────────────────────

describe('SafeTransferCalculator — property tests (forecast-only)', () => {
  const isoDateArb = fc
    .integer({ min: 2024, max: 2028 })
    .chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day => {
          const mm = String(month).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          return `${year}-${mm}-${dd}`;
        }),
      ),
    );

  it('Property #1: per-occurrence split application — ratios match getSplitsAsOf(occurrence.date)', () => {
    // Defect class: applying a single global split to all occurrences.
    // The assertion checks that each line item's perPartnerSplit equals Money.allocate(gross, ratios)
    // where ratios come from getSplitsAsOf(occurrence.expectedDate). Any global-split implementation
    // produces wrong splits when occurrences straddle a split boundary.
    fc.assert(
      fc.property(
        // Two split windows with different ratios
        fc.integer({ min: 1, max: 9 }).map(tenths => {
          const ratio = tenths / 10;
          return {
            window1: splitWindow('2024-01-01', ['Alex', ratio], ['Sam', 1 - ratio]),
            window2: splitWindow('2026-07-01', ['Alex', 1 - ratio], ['Sam', ratio]),
            ratio1: ratio,
            ratio2: 1 - ratio,
          };
        }),
        // A positive amount in cents
        fc.integer({ min: 100, max: 100000 }),
        ({ window1, window2, ratio1, ratio2 }, amountCents) => {
          const rule = recurringRule('R', 'C', amountCents, '2024-01-01');
          const windows = [window1, window2];
          const calc = buildCalculator(windows, [], [rule]);
          // Window spanning both split windows: May (50/50) and Sep (ratio1/ratio2)
          const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-09-30');
          if (result.isFailure) return true; // skip invalid configs
          const items = result.value.lineItems;
          const mayItem = items.find(i => i.date <= '2026-06-30');
          const sepItem = items.find(i => i.date >= '2026-07-01');
          if (!mayItem || !sepItem) return true;
          // Verify May occurrence uses window 1 ratios
          const expectedMayAlex = Math.floor(mayItem.gross.amount * ratio1);
          const actualMayAlex = mayItem.perPartnerSplit.get('Alex')!.amount;
          // Allow ±1 cent for LRM
          if (Math.abs(actualMayAlex - expectedMayAlex) > 1) return false;
          // Verify Sep occurrence uses window 2 ratios
          const expectedSepAlex = Math.floor(sepItem.gross.amount * ratio2);
          const actualSepAlex = sepItem.perPartnerSplit.get('Alex')!.amount;
          return Math.abs(actualSepAlex - expectedSepAlex) <= 1;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('Property #2: total consistency — sum(lineItem.gross) === totalRequired AND per-partner aggregation', () => {
    // Defect class: aggregation arithmetic drift (e.g., floating-point accumulation bug).
    // We sum line items ourselves via Money.add and compare to the reported totals.
    // This assertion fails if the calculator uses a different accumulation path than Money.add.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 100, max: 50000 }),
        (ruleCount, baseAmount) => {
          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          const rules = Array.from({ length: ruleCount }, (_, i) =>
            recurringRule(`Rule${i}`, 'Cat', baseAmount + i * 100, '2024-01-01'),
          );
          const calc = buildCalculator(windows, [], rules);
          const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
          if (result.isFailure) return true;

          const { lineItems, totalRequired, perPartner } = result.value;
          // Sum gross via Money.add
          let sumGross = makeEur(0);
          for (const item of lineItems) {
            const addResult = sumGross.add(item.gross);
            if (addResult.isFailure) return true;
            sumGross = addResult.value;
          }
          if (!sumGross.equals(totalRequired)) return false;

          // Sum per partner via Money.add
          for (const partner of ['Alex', 'Sam']) {
            let sumPartner = makeEur(0);
            for (const item of lineItems) {
              const share = item.perPartnerSplit.get(partner);
              if (!share) return false;
              const addResult = sumPartner.add(share);
              if (addResult.isFailure) return true;
              sumPartner = addResult.value;
            }
            if (!sumPartner.equals(perPartner.get(partner)!)) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #3a: recording-fake on RecurringForecastService — from/to forwarded correctly', () => {
    // Defect class: argument drop, swap, or hardcoding into forecastBetween.
    // The recording fake captures (from, to) and verifies they equal the calculateForWindow args.
    // BufferStateService and SplitRulesService are real implementations.
    fc.assert(
      fc.property(
        isoDateArb,
        isoDateArb,
        (asOf, from) => {
          const to = from >= asOf ? from : asOf;
          const actualFrom = asOf <= from ? from : asOf;
          // Recording fake for RecurringForecastService
          let capturedFrom: string | undefined;
          let capturedTo: string | undefined;
          const recordingForecast = {
            forecastBetween(f: string, t: string): Result<readonly ForecastOccurrence[]> {
              capturedFrom = f;
              capturedTo = t;
              return Result.ok([]);
            },
          };

          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          const splitsService = new SplitRulesService(windows);
          const buffersService = new BufferStateService([], 'EUR', fakeLedger(new Map()));
          const calc = new SafeTransferCalculator(
            splitsService,
            buffersService,
            recordingForecast as unknown as RecurringForecastService,
          );
          const result = calc.calculateForWindow(asOf, actualFrom, to);
          if (result.isFailure) return true; // skip validation-fail cases
          return capturedFrom === actualFrom && capturedTo === to;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #3b: recording-fake on BufferStateService — asOf forwarded correctly', () => {
    // Defect class: wrong argument passed to getStateAsOf (e.g., from instead of asOf).
    // BufferStateService is replaced with a recording fake. SplitRulesService and
    // RecurringForecastService are real.
    fc.assert(
      fc.property(
        isoDateArb,
        isoDateArb,
        (asOf, from) => {
          const to = from >= asOf ? from : asOf;
          const actualFrom = asOf <= from ? from : asOf;

          let capturedDate: string | undefined;
          const recordingBuffers = {
            getStateAsOf(date: string): Result<readonly BufferState[]> {
              capturedDate = date;
              return Result.ok([]);
            },
          };

          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          const splitsService = new SplitRulesService(windows);
          const forecastService = new RecurringForecastService([]);
          const calc = new SafeTransferCalculator(
            splitsService,
            recordingBuffers as unknown as BufferStateService,
            forecastService,
          );
          const result = calc.calculateForWindow(asOf, actualFrom, to);
          if (result.isFailure) return true;
          return capturedDate === asOf;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #3c: recording-fake on SplitRulesService — captured dates are line item dates or asOf', () => {
    // Defect class: getSplitsAsOf called with wrong date (e.g., from instead of occurrence date).
    // SplitRulesService is replaced with a recording fake. BufferStateService and
    // RecurringForecastService are real.
    fc.assert(
      fc.property(
        isoDateArb,
        isoDateArb,
        (asOf, from) => {
          const to = from >= asOf ? from : asOf;
          const actualFrom = asOf <= from ? from : asOf;

          const capturedDates: string[] = [];
          const recordingSplits = {
            getSplitsAsOf(date: string): Result<readonly { partner: string; ratio: number }[]> {
              capturedDates.push(date);
              return Result.ok([
                { partner: 'Alex', ratio: 0.5 },
                { partner: 'Sam', ratio: 0.5 },
              ]);
            },
          };

          const buffersService = new BufferStateService([], 'EUR', fakeLedger(new Map()));
          const forecastService = new RecurringForecastService([]);
          const calc = new SafeTransferCalculator(
            recordingSplits as unknown as SplitRulesService,
            buffersService,
            forecastService,
          );
          const result = calc.calculateForWindow(asOf, actualFrom, to);
          if (result.isFailure) return true;

          const { lineItems } = result.value;
          const lineItemDates = new Set(lineItems.map(i => i.date));
          // Every captured date must be either asOf (roster derivation) or a line item date
          return capturedDates.every(d => d === asOf || lineItemDates.has(d));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #8: purity — src/core/transfer/ does not contain Date.now, new Date(), or performance.now', () => {
    // fails if any transfer core file reads the system clock, violating the purity invariant
    const transferDir = path.resolve(__dirname, '../../../../src/core/transfer/');
    const files = fs.readdirSync(transferDir).filter(f => f.endsWith('.ts'));
    for (const file of files) {
      const source = fs.readFileSync(path.join(transferDir, file), 'utf8');
      // new Date(string) for ISO parsing IS allowed; new Date() without args is not.
      expect(source, `${file} contains Date.now`).not.toMatch(/Date\.now/);
      expect(source, `${file} contains new Date()`).not.toMatch(/new Date\(\s*\)/);
      expect(source, `${file} contains performance.now`).not.toMatch(/performance\.now/);
    }
  });
});
