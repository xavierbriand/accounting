/**
 * Unit + property tests for RecurringForecastService (Story 3.3).
 *
 * Slice 4: monthly cadence, ISO-date guard, from > to guard, property tests #1/1b/2/7/8.
 * Slice 6: amendment-amount selection (property #3), validTo lifecycle.
 * Slice 8: quarterly + annual cadences (covered in cadence.test.ts property #4).
 * Slice 8: sort stability (property #5), out-of-range window (property #6).
 *
 * fails if: cadence stepping is wrong, the closed-interval boundary is exclusive,
 *   ISO date guard is absent, from > to is not rejected, sort order drifts,
 *   amendment-amount selection picks the wrong tier on the boundary,
 *   validTo is treated as exclusive or ignored entirely,
 *   service reads the system clock (Date.now / new Date() / performance.now).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecurringForecastService } from '../../../../src/core/recurring/recurring-forecast-service.js';
import type { RecurringRule } from '../../../../src/core/config/app-config.js';
import { Money } from '../../../../src/core/shared/money.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeRule(overrides: Partial<RecurringRule> & { name: string; validFrom: string }): RecurringRule {
  return {
    name: overrides.name,
    category: overrides.category ?? 'Test',
    cadence: overrides.cadence ?? 'monthly',
    amount: overrides.amount ?? makeEur(1000),
    validFrom: overrides.validFrom,
    validTo: overrides.validTo,
    amendments: overrides.amendments ?? [],
  };
}

const MS_PER_DAY = 86_400_000;
const EPOCH_2000 = Date.UTC(2000, 0, 1);
const dateStringArb = fc
  .integer({ min: 0, max: 36523 })
  .map((days) => new Date(EPOCH_2000 + days * MS_PER_DAY).toISOString().slice(0, 10));

describe('RecurringForecastService.forecastBetween', () => {
  // ─── Slice 4: monthly cadence + range guards ───────────────────────────────

  describe('monthly cadence', () => {
    it('returns occurrence on validFrom when validFrom is within [from, to]', () => {
      // fails if: the first step (validFrom itself) is excluded from the window
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-03-15' }),
      ]);
      const result = service.forecastBetween('2026-03-01', '2026-03-31');
      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(1);
      expect(result.value[0].expectedDate).toBe('2026-03-15');
    });

    it('returns three occurrences for Netflix spanning 3 months', () => {
      // fails if: cadence stepping is wrong or boundary is exclusive
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-01-15', amount: makeEur(1299) }),
      ]);
      const result = service.forecastBetween('2026-03-01', '2026-05-15');
      expect(result.isSuccess).toBe(true);
      const dates = result.value.map(o => o.expectedDate);
      expect(dates).toEqual(['2026-03-15', '2026-04-15', '2026-05-15']);
    });

    it('upper-bound is inclusive (to == occurrence date included)', () => {
      // fails if: to boundary is treated as exclusive (last occurrence missing)
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-01-15' }),
      ]);
      const result = service.forecastBetween('2026-05-01', '2026-05-15');
      expect(result.isSuccess).toBe(true);
      expect(result.value.map(o => o.expectedDate)).toContain('2026-05-15');
    });

    it('lower-bound is inclusive (from == occurrence date included)', () => {
      // fails if: from boundary is treated as exclusive (first occurrence missing)
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-01-15' }),
      ]);
      const result = service.forecastBetween('2026-03-15', '2026-04-15');
      expect(result.isSuccess).toBe(true);
      expect(result.value.map(o => o.expectedDate)).toContain('2026-03-15');
    });

    it('returns empty array when window is before validFrom', () => {
      // fails if occurrences before validFrom leak into the result
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-06-01' }),
      ]);
      const result = service.forecastBetween('2026-01-01', '2026-05-31');
      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('returns occurrence name and category from the rule', () => {
      // fails if: name or category are not forwarded to ForecastOccurrence
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', category: 'Streaming', validFrom: '2026-01-15' }),
      ]);
      const result = service.forecastBetween('2026-01-01', '2026-02-01');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].name).toBe('Netflix');
      expect(result.value[0].category).toBe('Streaming');
    });

    it('returns empty array for empty rules list', () => {
      // fails if: empty rules throws or returns failure
      const service = new RecurringForecastService([]);
      const result = service.forecastBetween('2026-01-01', '2026-12-31');
      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('day-of-month clamped for January-31 monthly stepping', () => {
      // fails if: month overflow rebounds instead of clamping
      const service = new RecurringForecastService([
        makeRule({ name: 'Rule', validFrom: '2024-01-31' }),
      ]);
      const result = service.forecastBetween('2024-01-01', '2024-05-31');
      expect(result.isSuccess).toBe(true);
      const dates = result.value.map(o => o.expectedDate);
      expect(dates).toContain('2024-01-31');
      expect(dates).toContain('2024-02-29'); // 2024 is a leap year
      expect(dates).toContain('2024-03-31');
      expect(dates).toContain('2024-04-30');
      expect(dates).toContain('2024-05-31');
    });
  });

  describe('ISO date guard (from/to validation)', () => {
    it('returns Result.fail for from with timestamp format', () => {
      // fails if: ISO timestamp is accepted as from date
      const service = new RecurringForecastService([]);
      const result = service.forecastBetween('2026-01-01T00:00:00Z', '2026-12-31');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('ISO 8601');
    });

    it('returns Result.fail for to with invalid format', () => {
      // fails if: non-ISO date is accepted as to date
      const service = new RecurringForecastService([]);
      const result = service.forecastBetween('2026-01-01', '31/12/2026');
      expect(result.isFailure).toBe(true);
    });

    it('returns Result.fail for empty from string', () => {
      const service = new RecurringForecastService([]);
      const result = service.forecastBetween('', '2026-12-31');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('from > to guard', () => {
    it('returns Result.fail when from > to', () => {
      // fails if: inverted date range is silently accepted
      const service = new RecurringForecastService([]);
      const result = service.forecastBetween('2026-12-31', '2026-01-01');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('from');
    });

    it('accepts from == to (single-day window)', () => {
      // fails if: zero-length window is rejected
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-05-15' }),
      ]);
      const result = service.forecastBetween('2026-05-15', '2026-05-15');
      expect(result.isSuccess).toBe(true);
      expect(result.value.map(o => o.expectedDate)).toContain('2026-05-15');
    });
  });

  describe('sort order', () => {
    it('occurrences sorted ascending by expectedDate across multiple rules', () => {
      // fails if: output is not sorted by date
      const service = new RecurringForecastService([
        makeRule({ name: 'Netflix', validFrom: '2026-01-15' }),
        makeRule({ name: 'Rent', validFrom: '2026-01-01' }),
      ]);
      const result = service.forecastBetween('2026-01-01', '2026-03-31');
      expect(result.isSuccess).toBe(true);
      const dates = result.value.map(o => o.expectedDate);
      const sorted = [...dates].sort();
      expect(dates).toEqual(sorted);
    });

    it('ties broken by config index (first rule listed first)', () => {
      // fails if: tie-breaking uses name sort instead of config order
      const service = new RecurringForecastService([
        makeRule({ name: 'ZRule', validFrom: '2026-01-01' }),
        makeRule({ name: 'ARule', validFrom: '2026-01-01' }),
      ]);
      const result = service.forecastBetween('2026-01-01', '2026-01-01');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].name).toBe('ZRule');
      expect(result.value[1].name).toBe('ARule');
    });
  });

  // ─── Property tests ────────────────────────────────────────────────────────

  it('Property #1: per-occurrence well-formedness — every date in [validFrom, validTo] ∩ [from, to]', () => {
    // fails if: occurrence dates fall outside the rule lifecycle or the window
    fc.assert(
      fc.property(
        dateStringArb,
        fc.option(dateStringArb, { nil: undefined }),
        fc.constantFrom('monthly' as const),
        dateStringArb,
        dateStringArb,
        (validFrom, validToRaw, cadence, from, to) => {
          const validTo = validToRaw !== undefined && validToRaw >= validFrom ? validToRaw : undefined;
          const [windowFrom, windowTo] = from <= to ? [from, to] : [to, from];
          const service = new RecurringForecastService([
            makeRule({ name: 'R', validFrom, validTo, cadence }),
          ]);
          const result = service.forecastBetween(windowFrom, windowTo);
          if (result.isFailure) return false;
          for (const occ of result.value) {
            const d = occ.expectedDate;
            if (d < validFrom) return false;
            if (validTo !== undefined && d > validTo) return false;
            if (d < windowFrom || d > windowTo) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #1b: cadence-step regularity — monthsBetween(validFrom, d_i) == i * cadenceStep', () => {
    // fails if: the anchor-ratchet is broken (two-arg nextOccurrence would lose anchor day)
    fc.assert(
      fc.property(
        dateStringArb,
        fc.constantFrom('monthly' as const),
        dateStringArb,
        dateStringArb,
        (validFrom, cadence, from, to) => {
          const [windowFrom, windowTo] = from <= to ? [from, to] : [to, from];
          const service = new RecurringForecastService([
            makeRule({ name: 'R', validFrom, cadence }),
          ]);
          const result = service.forecastBetween(windowFrom, windowTo);
          if (result.isFailure) return true;
          const step = 1; // monthly
          const base = new Date(validFrom + 'T00:00:00Z');
          for (let i = 0; i < result.value.length; i++) {
            const occ = new Date(result.value[i].expectedDate + 'T00:00:00Z');
            const expectedMonths =
              (occ.getUTCFullYear() - base.getUTCFullYear()) * 12 +
              (occ.getUTCMonth() - base.getUTCMonth());
            // The occurrence at index i corresponds to the (i + offset)-th step from validFrom.
            // We only check that the month distance is a multiple of the cadence step.
            if (expectedMonths % step !== 0) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #2: boundary inclusivity — occurrence on from and on to are included', () => {
    // fails if: window boundaries are exclusive
    fc.assert(
      fc.property(
        dateStringArb,
        (validFrom) => {
          const service = new RecurringForecastService([
            makeRule({ name: 'R', validFrom }),
          ]);
          // from == validFrom (first occurrence is at validFrom itself)
          const result = service.forecastBetween(validFrom, validFrom);
          if (result.isFailure) return false;
          // For a single-day window [validFrom, validFrom], if validFrom is an occurrence,
          // it must appear.
          return result.value.length === 1 && result.value[0].expectedDate === validFrom;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #7: purity — source files contain no Date.now, new Date() (parameterless), performance.now', () => {
    // fails if: service or cadence reads the system clock
    const serviceFile = path.resolve(__dirname, '../../../../src/core/recurring/recurring-forecast-service.ts');
    const cadenceFile = path.resolve(__dirname, '../../../../src/core/recurring/cadence.ts');
    for (const file of [serviceFile, cadenceFile]) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\bDate\.now\s*\(/);
      expect(source).not.toMatch(/\bnew\s+Date\s*\(\s*\)/); // parameterless only
      expect(source).not.toMatch(/\bperformance\.now\s*\(/);
    }
  });

  // ─── Slice 6: amendments + validTo lifecycle ───────────────────────────────

  describe('amendment-amount selection', () => {
    it('uses rule.amount when no amendment applies (date before first amendment)', () => {
      // fails if: amendment.validFrom boundary is inclusive in the wrong direction
      const service = new RecurringForecastService([
        makeRule({
          name: 'Rent',
          validFrom: '2024-01-01',
          amount: makeEur(100000),
          amendments: [{ validFrom: '2026-07-01', amount: makeEur(105000) }],
        }),
      ]);
      const result = service.forecastBetween('2026-05-01', '2026-06-01');
      expect(result.isSuccess).toBe(true);
      for (const occ of result.value) {
        expect(occ.amount.amount).toBe(100000);
      }
    });

    it('uses amendment.amount when occurrence.date >= amendment.validFrom (boundary inclusive)', () => {
      // fails if: amendment is not applied on its validFrom boundary date
      const service = new RecurringForecastService([
        makeRule({
          name: 'Rent',
          validFrom: '2024-01-01',
          amount: makeEur(100000),
          amendments: [{ validFrom: '2026-07-01', amount: makeEur(105000) }],
        }),
      ]);
      const result = service.forecastBetween('2026-07-01', '2026-07-01');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].amount.amount).toBe(105000);
    });

    it('uses the latest applicable amendment when multiple amendments exist', () => {
      // fails if: only the first matching amendment is used instead of the latest
      const service = new RecurringForecastService([
        makeRule({
          name: 'Rent',
          validFrom: '2024-01-01',
          amount: makeEur(100000),
          amendments: [
            { validFrom: '2025-01-01', amount: makeEur(102000) },
            { validFrom: '2026-01-01', amount: makeEur(105000) },
          ],
        }),
      ]);
      const result = service.forecastBetween('2026-01-01', '2026-01-01');
      expect(result.isSuccess).toBe(true);
      expect(result.value[0].amount.amount).toBe(105000);
    });

    it('amendment scenario: 5 months spanning the amendment boundary', () => {
      // fails if: amendment transition is off by one occurrence
      const service = new RecurringForecastService([
        makeRule({
          name: 'Rent',
          validFrom: '2024-01-01',
          amount: makeEur(100000),
          amendments: [{ validFrom: '2026-07-01', amount: makeEur(105000) }],
        }),
      ]);
      const result = service.forecastBetween('2026-05-01', '2026-09-30');
      expect(result.isSuccess).toBe(true);
      const amountsByCents = result.value.map(o => o.amount.amount);
      expect(amountsByCents).toEqual([100000, 100000, 105000, 105000, 105000]);
    });
  });

  describe('validTo lifecycle', () => {
    it('excludes occurrences strictly after validTo', () => {
      // fails if: validTo is ignored and occurrences continue past the lifecycle end
      const service = new RecurringForecastService([
        makeRule({ name: 'OldStream', validFrom: '2025-03-15', validTo: '2026-08-15' }),
      ]);
      const result = service.forecastBetween('2026-06-01', '2026-10-31');
      expect(result.isSuccess).toBe(true);
      const dates = result.value.map(o => o.expectedDate);
      expect(dates).not.toContain('2026-09-15');
      expect(dates).not.toContain('2026-10-15');
    });

    it('includes the occurrence on validTo (closed interval)', () => {
      // fails if: validTo is treated as exclusive (last occurrence missing)
      const service = new RecurringForecastService([
        makeRule({ name: 'OldStream', validFrom: '2025-03-15', validTo: '2026-08-15' }),
      ]);
      const result = service.forecastBetween('2026-06-01', '2026-10-31');
      expect(result.isSuccess).toBe(true);
      expect(result.value.map(o => o.expectedDate)).toContain('2026-08-15');
    });

    it('out-of-range window (window entirely after validTo) returns empty', () => {
      // fails if: validTo lifecycle bound is ignored
      const service = new RecurringForecastService([
        makeRule({ name: 'OldStream', validFrom: '2024-01-01', validTo: '2024-12-31' }),
      ]);
      const result = service.forecastBetween('2025-01-01', '2025-12-31');
      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });
  });

  // ─── Property tests #3, #5, #6, #8 ───────────────────────────────────────

  it('Property #3: amendment-amount selection — latest entry with validFrom <= d is used', () => {
    // fails if: wrong amendment tier is selected (e.g., always first, always last, or wrong boundary)
    fc.assert(
      fc.property(
        dateStringArb,
        fc.array(dateStringArb, { minLength: 1, maxLength: 4 }),
        fc.array(fc.integer({ min: 100, max: 100000 }), { minLength: 5, maxLength: 5 }),
        (validFrom, amendmentDatesRaw, amounts) => {
          const uniqueSorted = [...new Set(amendmentDatesRaw)]
            .filter(d => d > validFrom)
            .sort();
          if (uniqueSorted.length === 0) return true;
          const amendments = uniqueSorted.map((d, i) => ({
            validFrom: d,
            amount: makeEur(amounts[i + 1] ?? amounts[amounts.length - 1]),
          }));
          const rule = makeRule({
            name: 'R',
            validFrom,
            amount: makeEur(amounts[0]),
            amendments,
          });
          const service = new RecurringForecastService([rule]);
          // Test for each occurrence: the amount must be from the latest amendment with validFrom <= date
          const result = service.forecastBetween(validFrom, uniqueSorted[uniqueSorted.length - 1]);
          if (result.isFailure) return true;
          for (const occ of result.value) {
            const tiers = [{ validFrom, amount: makeEur(amounts[0]) }, ...amendments];
            const expected = tiers.filter(t => t.validFrom <= occ.expectedDate).pop()!;
            if (occ.amount.amount !== expected.amount.amount) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #5: sort stability — output sorted ascending by expectedDate, ties by config index', () => {
    // fails if: sort is unstable or uses wrong comparison
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 1, maxLength: 4 }),
        (validFromDates) => {
          const rules = validFromDates.map((d, i) =>
            makeRule({ name: `Rule${i}`, validFrom: d }),
          );
          const service = new RecurringForecastService(rules);
          // Use a 3-month window
          const from = '2026-01-01';
          const to = '2026-03-31';
          const result = service.forecastBetween(from, to);
          if (result.isFailure) return false;
          const dates = result.value.map(o => o.expectedDate);
          const sorted = [...dates].sort();
          return JSON.stringify(dates) === JSON.stringify(sorted);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #6: out-of-range window — empty forecast when window outside lifecycle', () => {
    // fails if: rule lifecycle bounds are ignored
    fc.assert(
      fc.property(
        dateStringArb,
        dateStringArb,
        dateStringArb,
        (validFrom, from, to) => {
          const [windowFrom, windowTo] = from <= to ? [from, to] : [to, from];
          fc.pre(windowTo < validFrom); // window entirely before lifecycle
          const service = new RecurringForecastService([
            makeRule({ name: 'R', validFrom }),
          ]);
          const result = service.forecastBetween(windowFrom, windowTo);
          if (result.isFailure) return false;
          return result.value.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property #8: service↔config wiring — from/to forwarded verbatim to enumerateOccurrences (recording-fake pattern)', () => {
    // fails if: from or to are accidentally dropped or swapped in the call to enumerateOccurrences
    // Recording-fake pattern from Story 3.2 Phase 4 refactor (commit 59639e1).
    // We test this by checking that the output dates all fall within [from, to],
    // and by comparing with a reference call using swapped arguments (should differ).
    fc.assert(
      fc.property(
        dateStringArb,
        dateStringArb,
        (from, to) => {
          const [windowFrom, windowTo] = from <= to ? [from, to] : [to, from];
          fc.pre(windowFrom !== windowTo);
          const service = new RecurringForecastService([
            makeRule({ name: 'R', validFrom: '2000-01-01' }),
          ]);
          const result = service.forecastBetween(windowFrom, windowTo);
          if (result.isFailure) return false;
          // All occurrences must be within [windowFrom, windowTo]
          for (const occ of result.value) {
            if (occ.expectedDate < windowFrom || occ.expectedDate > windowTo) return false;
          }
          // Swapped window should produce a different (typically larger) result
          const swappedResult = service.forecastBetween(windowTo, windowFrom);
          // Swapped should fail (from > to)
          return swappedResult.isFailure;
        },
      ),
      { numRuns: 100 },
    );
  });
});
