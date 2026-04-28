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
  return new SafeTransferCalculator(splitsService, buffersService, forecastService, 'EUR');
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
    // 1299 cents allocated by ratios [0.6, 0.4]:
    //   - Alex floor: floor(1299 * 0.6) = 779; Sam floor: floor(1299 * 0.4) = 519. Sum=1298.
    //   - Remainder = 1; LRM distributes by largest fractional part. Fractionals: Alex 0.4, Sam 0.6.
    //   - Standard LRM would award the cent to Sam (larger fractional), giving 779/520.
    //   - dinero.js v2 awards the remainder to the first ratio in input order instead, giving 780/519.
    // We expect dinero.js's behaviour because Money.allocate delegates to it. This tie-breaker
    // is library-specific; if dinero.js changes its remainder rule, this test will catch it.
    expect(item.perPartnerSplit.get('Alex')!.amount).toBe(780);
    expect(item.perPartnerSplit.get('Sam')!.amount).toBe(519);
    // perPartner totals
    expect(result.value.perPartner.get('Alex')!.amount).toBe(780);
    expect(result.value.perPartner.get('Sam')!.amount).toBe(519);
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

  it('Property #1: per-occurrence split application — perPartnerSplit equals Money.allocate(gross, ratiosAtOccurrenceDate)', () => {
    // Defect class: applying a single global split to all occurrences (window-selection
    // bug), OR using a non-LRM allocator (e.g., Math.floor + remainder lost). Both must
    // be falsifiable. The assertion compares each line item's perPartnerSplit against
    // gross.allocate(ratios) where ratios come from getSplitsAsOf(occurrence.expectedDate)
    // — exact equality via Money.equals, no ±1 tolerance.
    //
    // Floating-point note: ratios MUST be computed once in the generator and reused by
    // both the test fixture (as window data) and the assertion. Recomputing `1 - ratio`
    // in the body produces a slightly different IEEE-754 value (e.g., `1 - 0.9` is
    // 0.09999...998, not 0.1), which would produce false-positive mismatches with
    // production's stored-ratio allocation.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }).map(tenths => {
          const r = tenths / 10;
          const w1Ratios: [number, number] = [r, 1 - r];
          const w2Ratios: [number, number] = [1 - r, r];
          return {
            window1: splitWindow('2024-01-01', ['Alex', w1Ratios[0]], ['Sam', w1Ratios[1]]),
            window2: splitWindow('2026-07-01', ['Alex', w2Ratios[0]], ['Sam', w2Ratios[1]]),
            w1Ratios,
            w2Ratios,
          };
        }),
        fc.integer({ min: 100, max: 100000 }),
        ({ window1, window2, w1Ratios, w2Ratios }, amountCents) => {
          const rule = recurringRule('R', 'C', amountCents, '2024-01-01');
          const windows = [window1, window2];
          const calc = buildCalculator(windows, [], [rule]);
          const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-09-30');
          if (result.isFailure) return true;
          const items = result.value.lineItems;
          for (const item of items) {
            const ratios: [number, number] = item.date < '2026-07-01' ? w1Ratios : w2Ratios;
            const expected = item.gross.allocate([...ratios]);
            if (expected.isFailure) return false;
            const expectedAlex = expected.value[0];
            const expectedSam = expected.value[1];
            const actualAlex = item.perPartnerSplit.get('Alex');
            const actualSam = item.perPartnerSplit.get('Sam');
            if (!actualAlex || !actualSam) return false;
            if (!actualAlex.equals(expectedAlex)) return false;
            if (!actualSam.equals(expectedSam)) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
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
            'EUR',
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
            'EUR',
          );
          const result = calc.calculateForWindow(asOf, actualFrom, to);
          if (result.isFailure) return true;
          return capturedDate === asOf;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #3c: recording-fake on SplitRulesService — every line item date triggers a getSplitsAsOf call with that exact date', () => {
    // Defect class: getSplitsAsOf called with wrong date (e.g., from instead of occurrence date,
    // or asOf reused for every occurrence). The previous form used empty forecast/buffer configs
    // which made the property vacuous (the only captured call was the asOf roster derivation).
    // This form seeds a real RecurringForecastService with one monthly rule so multiple
    // occurrences land in the window, and asserts that each occurrence's date appears in the
    // captured calls. A defect that hardcodes asOf for the per-occurrence dispatch would emit
    // line items dated 2026-05-15, 2026-06-15 etc., but capturedDates would only contain asOf,
    // so the `lineItemDates ⊆ capturedDates` check fails.
    fc.assert(
      fc.property(
        isoDateArb,
        (asOf) => {
          // Use a fixed window with at least 2 months guaranteed to contain occurrences from
          // a 2024-01-15 monthly rule; asOf must be ≤ window start so the window is valid.
          const from = '2026-05-01';
          const to = '2026-08-31';
          if (asOf > from) return true; // skip generators where asOf is after the window

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
          const rule = recurringRule('Netflix', 'Subscriptions', 1299, '2024-01-15');
          const forecastService = new RecurringForecastService([rule]);
          const calc = new SafeTransferCalculator(
            recordingSplits as unknown as SplitRulesService,
            buffersService,
            forecastService,
            'EUR',
          );
          const result = calc.calculateForWindow(asOf, from, to);
          if (result.isFailure) return true;

          const { lineItems } = result.value;
          // Property has teeth only when at least one line item exists.
          if (lineItems.length === 0) return true;
          const captured = new Set(capturedDates);
          // Every line-item date must have been forwarded into getSplitsAsOf.
          return lineItems.every(i => captured.has(i.date));
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

// ─── Buffer top-up path ───────────────────────────────────────────────────────

describe('SafeTransferCalculator — buffer top-up path', () => {
  it('produces buffer-topup line items for each month-start in [from, to] within fill schedule', () => {
    // fails if buffer top-up logic is absent or produces wrong line item dates
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    // Vacation buffer: target 1200 EUR, currentBalance 0, targetDate 2026-12-01
    // asOf=2026-04-28, targetDate=2026-12-01:
    //   allFillSlots = enumerateMonthStarts(2026-04-28, 2026-11-30) = 7 months [May..Nov]
    //   monthsRemaining = 7
    //   monthlyFill ≈ 1200/7 = 171.43 per month (LRM)
    // window [from=2026-05-01, to=2026-08-31]: first 4 fill slots
    const { bucket, balance } = makeBucket('Vacation', 'assets:buffer:vacation', 120000, 0, '2026-12-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-08-31');
    expect(result.isSuccess).toBe(true);
    const topups = result.value.lineItems.filter(i => i.kind === 'buffer-topup');
    expect(topups).toHaveLength(4);
    expect(topups[0].date).toBe('2026-05-01');
    expect(topups[1].date).toBe('2026-06-01');
    expect(topups[2].date).toBe('2026-07-01');
    expect(topups[3].date).toBe('2026-08-01');
  });

  it('buffer-topup gross is the LRM month fill for each month slot', () => {
    // fails if fill amounts are computed wrong or not via LRM
    // 120000 cents / 7 months via LRM = first slot gets extra cent if odd.
    // 120000 / 7 = 17142.857... → base = 17142, remainder slots get 17143
    // 120000 = 7 * 17142 + 6 → 6 slots at 17143, 1 slot at 17142 (LRM: first 6 slots get extra)
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const { bucket, balance } = makeBucket('Vacation', 'assets:buffer:vacation', 120000, 0, '2026-12-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-08-31');
    expect(result.isSuccess).toBe(true);
    const topups = result.value.lineItems.filter(i => i.kind === 'buffer-topup');
    // Each of first 4 months: 17143 cents (171.43 EUR)
    for (const item of topups) {
      expect(item.gross.amount).toBe(17143);
      expect(item.gross.currency).toBe('EUR');
    }
  });

  it('totalRequired is 4 * 17143 = 68572 cents = 685.72 EUR for 4-month window', () => {
    // fails if aggregation of buffer-topup gross is wrong
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const { bucket, balance } = makeBucket('Vacation', 'assets:buffer:vacation', 120000, 0, '2026-12-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-08-31');
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalRequired.amount).toBe(68572);
  });

  it('buffer-topup line items carry per-partner splits', () => {
    // fails if buffer-topup line items have empty perPartnerSplit
    // 17143 cents split 50/50: 8572 + 8571 (LRM gives extra to Alex)
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const { bucket, balance } = makeBucket('Vacation', 'assets:buffer:vacation', 120000, 0, '2026-12-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-08-31');
    expect(result.isSuccess).toBe(true);
    const topup = result.value.lineItems.find(i => i.kind === 'buffer-topup')!;
    const alexShare = topup.perPartnerSplit.get('Alex')!.amount;
    const samShare = topup.perPartnerSplit.get('Sam')!.amount;
    expect(alexShare + samShare).toBe(topup.gross.amount);
  });

  it('stale targetDate with shortfall (asOf >= targetDate) returns Result.fail', () => {
    // fails if the stale-targetDate check is absent — calculator would silently produce zero
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    // Car buffer: target 500 EUR, currentBalance 200 EUR (shortfall), targetDate=2026-04-01
    // asOf=2026-04-28 >= targetDate → stale with shortfall → fail
    const { bucket, balance } = makeBucket('Car', 'assets:buffer:car', 50000, 20000, '2026-04-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Car');
    expect(result.error).toContain('2026-04-01');
    expect(result.error).toContain('set a new targetDate');
  });

  it('stale targetDate with balance >= target succeeds with no line items (no shortfall)', () => {
    // fails if the stale-targetDate check fires when balance >= target
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    // Car buffer: target 500 EUR, currentBalance 600 EUR (at/above target), targetDate=2026-04-01
    const { bucket, balance } = makeBucket('Car', 'assets:buffer:car', 50000, 60000, '2026-04-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    expect(result.value.lineItems).toHaveLength(0);
    expect(result.value.totalRequired.amount).toBe(0);
  });

  it('balance exactly equals target produces no buffer-topup items', () => {
    // fails if balance == target is treated as below-target (zero shortfall should not generate fills)
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const { bucket, balance } = makeBucket('Car', 'assets:buffer:car', 50000, 50000, '2026-12-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    const topups = result.value.lineItems.filter(i => i.kind === 'buffer-topup');
    expect(topups).toHaveLength(0);
  });

  it('monthsRemaining=0 with asOf < targetDate returns Result.fail (deadline too soon)', () => {
    // fails if zero-months case is silently skipped instead of returning an error
    // asOf=2026-04-28, targetDate=2026-05-01:
    //   allFillSlots = enumerateMonthStarts(2026-04-28, 2026-04-30) = [] (no month-start in Apr 28–30)
    //   monthsRemaining = 0 → fail with "no full month"
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const { bucket, balance } = makeBucket('Car', 'assets:buffer:car', 50000, 20000, '2026-05-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Car');
    expect(result.error).toContain('no full month');
  });

  it('buffer-topup kind, category, and description are correct', () => {
    // fails if kind, category, or description fields are wrong on buffer-topup items
    const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
    const { bucket, balance } = makeBucket('Vacation', 'assets:buffer:vacation', 120000, 0, '2026-12-01');
    const calc = buildCalculator(windows, [{ bucket, balance }], []);
    const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
    expect(result.isSuccess).toBe(true);
    const topup = result.value.lineItems.find(i => i.kind === 'buffer-topup')!;
    expect(topup.kind).toBe('buffer-topup');
    expect(topup.category).toBe('Vacation');
    expect(topup.description).toBe('Vacation top-up');
  });
});

// ─── Property tests (buffer top-up) ──────────────────────────────────────────

describe('SafeTransferCalculator — property tests (buffer top-up)', () => {
  it('Property #4: buffer Largest-Remainder over months — sum equals shortfall exactly', () => {
    // Defect class: integer division losing pennies.
    // Witness: target=100 EUR (10000 cents), balance=0, monthsRemaining=3:
    //   LRM → [3334, 3333, 3333] summing to 10000 exactly.
    // Introducing plain Math.floor would give [3333, 3333, 3333] = 9999 ≠ 10000.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),   // targetCents
        fc.integer({ min: 0, max: 99999 }).filter((b) => b < 100000), // balanceCents < targetCents
        fc.integer({ min: 1, max: 12 }),        // monthsInWindow (1..12)
        (targetCents, balanceCents, monthsInWindow) => {
          if (balanceCents >= targetCents) return true;
          // Build a config where the fill schedule spans exactly monthsInWindow months
          // Use window from=2026-05-01, asOf has monthsInWindow fill slots within window
          // asOf = 2026-04-28, targetDate = month start after (monthsInWindow) months from May 1
          //   e.g. monthsInWindow=3: targetDate = 2026-08-01 (Aug)
          //   allFillSlots = [May1, Jun1, Jul1] — 3 fill slots
          const year = 2026;
          const startMonth = 5; // May
          const endMonth = startMonth + monthsInWindow; // exclusive
          const endYear = year + Math.floor((endMonth - 1) / 12);
          const endMonthNorm = ((endMonth - 1) % 12) + 1;
          const targetDate = `${endYear}-${String(endMonthNorm).padStart(2, '0')}-01`;
          // to: last day of (startMonth + monthsInWindow - 1)
          const lastFillMonth = startMonth + monthsInWindow - 1;
          const lastFillYear = year + Math.floor((lastFillMonth - 1) / 12);
          const lastFillMonthNorm = ((lastFillMonth - 1) % 12) + 1;
          const to = `${lastFillYear}-${String(lastFillMonthNorm).padStart(2, '0')}-28`;

          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          const { bucket, balance } = makeBucket(
            'TestBuf',
            'assets:buffer:test',
            targetCents,
            balanceCents,
            targetDate,
          );
          const calc = buildCalculator(windows, [{ bucket, balance }], []);
          const result = calc.calculateForWindow('2026-04-28', '2026-05-01', to);
          if (result.isFailure) return true; // skip edge cases

          // Sum all buffer-topup line items' gross over ALL fill slots (full window = all slots)
          const topups = result.value.lineItems.filter(i => i.kind === 'buffer-topup');
          if (topups.length !== monthsInWindow) return true; // guard: full window must expose all slots

          let sumCents = 0;
          for (const item of topups) {
            sumCents += item.gross.amount;
          }
          const expectedShortfall = targetCents - balanceCents;
          return sumCents === expectedShortfall;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #5: no buffer-topup line items when balance >= target', () => {
    // Defect class: top-up logic ignoring the shortfall guard, or treating balance==target as below.
    // Introducing the defect (removing the balance>=target guard) would produce fills even
    // when balance equals target, which would violate this property.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),  // targetCents
        fc.integer({ min: 0, max: 100000 }),  // extraCents (added to target for balance)
        (targetCents, extraCents) => {
          const balanceCents = targetCents + extraCents; // balance >= target always
          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          const { bucket, balance } = makeBucket(
            'TestBuf',
            'assets:buffer:test',
            targetCents,
            balanceCents,
            '2026-12-01',
          );
          const calc = buildCalculator(windows, [{ bucket, balance }], []);
          const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
          if (result.isFailure) return true;
          const topups = result.value.lineItems.filter(i => i.kind === 'buffer-topup');
          return topups.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #6: stale targetDate fails iff balance < target', () => {
    // Defect class: stale-check fires unconditionally, or only-when-shortfall guard missing.
    // Introducing the defect (removing the shortfall guard) would fail even when balance>=target.
    // The other defect (removing the stale check) would succeed when balance<target.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),  // targetCents
        fc.integer({ min: 0, max: 200000 }),  // balanceCents
        (targetCents, balanceCents) => {
          const hasShortfall = balanceCents < targetCents;
          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          // stale targetDate: asOf=2026-04-28 >= targetDate=2026-04-01
          const { bucket, balance } = makeBucket(
            'TestBuf',
            'assets:buffer:test',
            targetCents,
            balanceCents,
            '2026-04-01',
          );
          const calc = buildCalculator(windows, [{ bucket, balance }], []);
          const result = calc.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
          if (hasShortfall) {
            // Must fail with path-cited error
            return result.isFailure && result.error.includes('TestBuf');
          } else {
            // Must succeed with no buffer-topup line items
            return result.isSuccess && result.value.lineItems.length === 0;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #7: output sort stability — shuffling input order produces same lineItems', () => {
    // Defect class: implicit input-order dependency (items sorted by config order, not by date/kind).
    // Introducing the defect (removing the sort) means shuffled config → different item order.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),   // numBuffers
        fc.integer({ min: 1, max: 3 }),   // numRules
        (numBuffers, numRules) => {
          const windows = [splitWindow('2024-01-01', ['Alex', 0.5], ['Sam', 0.5])];
          const bufferDefs = Array.from({ length: numBuffers }, (_, i) => {
            const { bucket, balance } = makeBucket(
              `Buffer${i}`,
              `assets:buffer:buf${i}`,
              10000 + i * 5000,
              0,
              '2026-12-01',
            );
            return { bucket, balance };
          });
          const rules = Array.from({ length: numRules }, (_, i) =>
            recurringRule(`Rule${i}`, `Cat${i % 2}`, 1000 + i * 500, '2024-01-01'),
          );

          const calc1 = buildCalculator(windows, bufferDefs, rules);
          const result1 = calc1.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
          if (result1.isFailure) return true;

          // Reverse the order of buffers and rules
          const reversedBuffers = [...bufferDefs].reverse();
          const reversedRules = [...rules].reverse();
          const calc2 = buildCalculator(windows, reversedBuffers, reversedRules);
          const result2 = calc2.calculateForWindow('2026-04-28', '2026-05-01', '2026-05-31');
          if (result2.isFailure) return true;

          const items1 = result1.value.lineItems;
          const items2 = result2.value.lineItems;
          if (items1.length !== items2.length) return false;

          for (let i = 0; i < items1.length; i++) {
            if (items1[i].date !== items2[i].date) return false;
            if (items1[i].kind !== items2[i].kind) return false;
            if (items1[i].category !== items2[i].category) return false;
            if (items1[i].description !== items2[i].description) return false;
            if (items1[i].gross.amount !== items2[i].gross.amount) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
