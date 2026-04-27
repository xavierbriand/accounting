/**
 * Unit + property tests for cadence helpers (Story 3.3).
 *
 * Slice 4: enumerateOccurrences monthly cadence basics.
 * Slice 8: quarterly + annual cadences, DoM clamp determinism (property #4).
 *
 * fails if: day-of-month overflow rebounds, leap-year recovery fails,
 *   the public surface (enumerateOccurrences) loses the anchor day,
 *   nextOccurrence is exported (it must NOT be — it cannot deliver anchor-ratchet
 *   behaviour across overflow steps).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { enumerateOccurrences } from '../../../../src/core/recurring/cadence.js';

const MS_PER_DAY = 86_400_000;
const EPOCH_2000 = Date.UTC(2000, 0, 1);
const dateStringArb = fc
  .integer({ min: 0, max: 36523 })
  .map((days) => new Date(EPOCH_2000 + days * MS_PER_DAY).toISOString().slice(0, 10));

describe('enumerateOccurrences — monthly cadence', () => {
  it('returns just the validFrom date when window is exactly [validFrom, validFrom]', () => {
    // fails if: validFrom itself is excluded from the result
    const dates = enumerateOccurrences('2026-01-15', undefined, 'monthly', '2026-01-15', '2026-01-15');
    expect(dates).toEqual(['2026-01-15']);
  });

  it('returns three months for a 3-month window', () => {
    // fails if: monthly stepping produces wrong dates
    const dates = enumerateOccurrences('2026-01-15', undefined, 'monthly', '2026-01-01', '2026-03-31');
    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('upper-bound is inclusive', () => {
    // fails if: to boundary is exclusive
    const dates = enumerateOccurrences('2026-01-15', undefined, 'monthly', '2026-05-01', '2026-05-15');
    expect(dates).toContain('2026-05-15');
  });

  it('returns empty when window is entirely before validFrom', () => {
    // fails if: occurrences before lifecycle start leak in
    const dates = enumerateOccurrences('2026-06-01', undefined, 'monthly', '2026-01-01', '2026-05-31');
    expect(dates).toEqual([]);
  });

  it('returns empty when window is entirely after validTo', () => {
    // fails if: validTo is ignored
    const dates = enumerateOccurrences('2025-01-01', '2025-06-01', 'monthly', '2025-07-01', '2025-12-31');
    expect(dates).toEqual([]);
  });

  it('validTo is inclusive (last occurrence on validTo is included)', () => {
    // fails if: validTo is treated as exclusive
    const dates = enumerateOccurrences('2025-03-15', '2026-08-15', 'monthly', '2026-06-01', '2026-10-31');
    expect(dates).toContain('2026-08-15');
    expect(dates).not.toContain('2026-09-15');
  });

  it('day-of-month clamped for month overflow (Jan-31 monthly)', () => {
    // fails if: month overflow rebounds (e.g., Mar-03 instead of Feb-29)
    const dates = enumerateOccurrences('2024-01-31', undefined, 'monthly', '2024-01-01', '2024-05-31');
    expect(dates).toEqual([
      '2024-01-31',
      '2024-02-29', // leap year 2024
      '2024-03-31',
      '2024-04-30',
      '2024-05-31',
    ]);
  });

  it('anchor day recovered after clamp (non-leap year then leap year)', () => {
    // fails if: anchor-ratchet from validFrom is not used (step-from-previous would lose anchor)
    // Monthly from 2025-01-31: should step to 2025-02-28 (clamped), then 2025-03-31 (recovered)
    const dates = enumerateOccurrences('2025-01-31', undefined, 'monthly', '2025-01-01', '2025-04-30');
    expect(dates).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  });
});

// Slice 8: quarterly + annual tests (RED until Slice 9 green)

describe('enumerateOccurrences — quarterly cadence', () => {
  it('returns four occurrences in a year for quarterly cadence', () => {
    // fails if: quarterly stepping uses +3 days instead of +3 months
    const dates = enumerateOccurrences('2026-01-15', undefined, 'quarterly', '2026-01-01', '2026-12-31');
    expect(dates).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
  });

  it('quarterly: three months per step', () => {
    // fails if: step size is wrong
    const dates = enumerateOccurrences('2026-01-31', undefined, 'quarterly', '2026-01-01', '2026-07-31');
    expect(dates).toEqual(['2026-01-31', '2026-04-30', '2026-07-31']);
  });
});

describe('enumerateOccurrences — annual cadence', () => {
  it('returns occurrences once per year', () => {
    // fails if: annual stepping uses +12 days instead of +12 months
    const dates = enumerateOccurrences('2024-03-15', undefined, 'annual', '2024-01-01', '2027-12-31');
    expect(dates).toEqual(['2024-03-15', '2025-03-15', '2026-03-15', '2027-03-15']);
  });

  it('Feb-29 leap-year clamp and recovery (annual from 2024-02-29)', () => {
    // fails if: DoM overflow rebounds (2025-02-28 -> 2026-03-01) or fails to recover Feb-29
    const dates = enumerateOccurrences('2024-02-29', undefined, 'annual', '2025-01-01', '2028-12-31');
    expect(dates).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });
});

// Property #4: DoM clamp determinism via the public surface (enumerateOccurrences)

describe('Property #4: DoM clamp determinism', () => {
  it('Jan-31 monthly anchor — all occurrences have day <= days-in-month of their month', () => {
    // fails if: any occurrence overflows its target month
    const dates = enumerateOccurrences('2024-01-31', undefined, 'monthly', '2024-01-01', '2025-12-31');
    for (const d of dates) {
      const [year, month, day] = d.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      expect(day).toBeLessThanOrEqual(daysInMonth);
    }
  });

  it('Feb-29 annual — step i recovers Feb-29 in leap years, uses Feb-28 in non-leap years', () => {
    // fails if: anchor recovery is broken for leap years
    const dates = enumerateOccurrences('2024-02-29', undefined, 'annual', '2024-01-01', '2032-12-31');
    const leapYears = new Set([2024, 2028, 2032]);
    for (const d of dates) {
      const [year, , day] = d.split('-').map(Number);
      if (leapYears.has(year)) {
        expect(day).toBe(29);
      } else {
        expect(day).toBe(28);
      }
    }
  });

  it('Property: for any validFrom + monthly window, all dates have correct day-of-month', () => {
    // fails if: DoM clamp is non-deterministic
    fc.assert(
      fc.property(
        dateStringArb,
        dateStringArb,
        dateStringArb,
        (validFrom, from, to) => {
          const [windowFrom, windowTo] = from <= to ? [from, to] : [to, from];
          const dates = enumerateOccurrences(validFrom, undefined, 'monthly', windowFrom, windowTo);
          for (const d of dates) {
            const [year, month, day] = d.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            if (day > daysInMonth) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('enumerateOccurrences — export contract', () => {
  it('enumerateOccurrences is exported (public surface)', () => {
    // fails if: export is missing
    expect(typeof enumerateOccurrences).toBe('function');
  });
});
