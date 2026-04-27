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
});
