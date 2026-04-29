import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enumerateMonthStarts, dayBefore } from '@core/transfer/date-arithmetic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('enumerateMonthStarts', () => {
  describe('basic cases', () => {
    it('returns empty array when from > to', () => {
      // fails if out-of-range inputs produce any output
      expect(enumerateMonthStarts('2026-06-01', '2026-05-01')).toEqual([]);
    });

    it('returns the from date when from === to and from is a first-of-month', () => {
      // fails if from-inclusive contract is violated for exact first-of-month case
      expect(enumerateMonthStarts('2026-05-01', '2026-05-01')).toEqual(['2026-05-01']);
    });

    it('returns empty when from === to and from is NOT a first-of-month', () => {
      // fails if non-first-of-month dates are incorrectly included
      expect(enumerateMonthStarts('2026-05-15', '2026-05-15')).toEqual([]);
    });

    it('includes from when from itself is a first-of-month', () => {
      // fails if from-inclusive contract misses the start month when from is first-of-month
      const result = enumerateMonthStarts('2026-05-01', '2026-07-31');
      expect(result[0]).toBe('2026-05-01');
    });

    it('does not include from when from is not a first-of-month', () => {
      // fails if non-first-of-month start is treated as inclusive
      const result = enumerateMonthStarts('2026-05-28', '2026-07-31');
      expect(result[0]).toBe('2026-06-01');
    });

    it('returns [May 1, Jun 1, Jul 1] for from=2026-04-28 to=2026-07-31', () => {
      // fails if intermediate month-starts are miscounted
      expect(enumerateMonthStarts('2026-04-28', '2026-07-31')).toEqual([
        '2026-05-01', '2026-06-01', '2026-07-01',
      ]);
    });

    it('spans year boundary correctly', () => {
      // fails if year-boundary crossing breaks month enumeration
      const result = enumerateMonthStarts('2026-11-15', '2027-02-28');
      expect(result).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
    });

    it('returns [May 1..Nov 1] for asOf=2026-04-28, dayBefore(targetDate=2026-12-01)=2026-11-30', () => {
      // This is the plan scenario 3 anchor: monthsRemaining must be 7.
      // fails if enumerateMonthStarts(2026-04-28, 2026-11-30) != 7 entries
      const result = enumerateMonthStarts('2026-04-28', '2026-11-30');
      expect(result).toHaveLength(7);
      expect(result[0]).toBe('2026-05-01');
      expect(result[6]).toBe('2026-11-01');
    });

    it('returns [] for asOf=2026-04-28, dayBefore(targetDate=2026-05-01)=2026-04-30', () => {
      // fails if too-soon targetDate (Apr 28, target May 01) incorrectly yields 1 slot
      const result = enumerateMonthStarts('2026-04-28', '2026-04-30');
      expect(result).toHaveLength(0);
    });

    it('returns [May 1] for asOf=2026-04-28, dayBefore(targetDate=2026-05-15)=2026-05-14', () => {
      // fails if near-deadline case is miscounted
      const result = enumerateMonthStarts('2026-04-28', '2026-05-14');
      expect(result).toEqual(['2026-05-01']);
    });
  });

  describe('property tests', () => {
    const isoDateArb = fc
      .integer({ min: 2020, max: 2030 })
      .chain(year =>
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => {
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
          }),
        ),
      );

    it('Property: all returned dates are first-of-month (day part = "01")', () => {
      // fails if any non-first-of-month date sneaks into the output
      // Defect class: off-by-one in day computation, or wrong date string format
      fc.assert(
        fc.property(isoDateArb, isoDateArb, (from, to) => {
          const result = enumerateMonthStarts(from, to);
          return result.every(d => d.endsWith('-01'));
        }),
      );
    });

    it('Property: result is sorted in ascending order (lexicographic = chronological for YYYY-MM-DD)', () => {
      // fails if the enumeration is unsorted or reversed
      fc.assert(
        fc.property(isoDateArb, isoDateArb, (from, to) => {
          const result = enumerateMonthStarts(from, to);
          for (let i = 1; i < result.length; i++) {
            if (result[i] <= result[i - 1]) return false;
          }
          return true;
        }),
      );
    });

    it('Property: all returned dates are within [from, to] inclusive', () => {
      // fails if any returned date is outside the requested range
      fc.assert(
        fc.property(isoDateArb, isoDateArb, (from, to) => {
          const result = enumerateMonthStarts(from, to);
          return result.every(d => d >= from && d <= to);
        }),
      );
    });

    it('Property: from-inclusive — if from is a first-of-month, from is included', () => {
      // fails if the from-inclusive contract is broken for first-of-month from dates
      // Defect class: using strictly-greater-than comparison instead of >=
      fc.assert(
        fc.property(
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).map(month => {
              const mm = String(month).padStart(2, '0');
              return `${year}-${mm}-01`;
            }),
          ),
          isoDateArb,
          (firstOfMonth, to) => {
            if (firstOfMonth > to) return true;
            const result = enumerateMonthStarts(firstOfMonth, to);
            return result.length > 0 && result[0] === firstOfMonth;
          },
        ),
      );
    });
  });
});

describe('dayBefore', () => {
  it('returns the day before a mid-month date', () => {
    // fails if dayBefore(2026-12-01) != 2026-11-30
    expect(dayBefore('2026-12-01')).toBe('2026-11-30');
  });

  it('returns the last day of previous month for first-of-month input', () => {
    // fails if month boundary is not handled correctly
    expect(dayBefore('2026-05-01')).toBe('2026-04-30');
  });

  it('crosses year boundary correctly', () => {
    // fails if January 1 → December 31 of previous year is not handled
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });

  it('handles February end correctly (non-leap year)', () => {
    // fails if end-of-February day count is wrong for non-leap year
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });

  it('handles February end correctly (leap year)', () => {
    // fails if end-of-February day count is wrong for leap year
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
  });

  it('Property: purity — date-arithmetic.ts contains no Date.now, new Date(), or performance.now', () => {
    // fails if the helper reads the system clock (violates purity invariant from plan § 8)
    const arithFile = path.resolve(
      __dirname,
      '../../../../src/core/transfer/date-arithmetic.ts',
    );
    const source = fs.readFileSync(arithFile, 'utf8');
    // new Date(string) for ISO parsing IS allowed; new Date() without args is not.
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/new Date\(\s*\)/);
    expect(source).not.toMatch(/performance\.now/);
  });
});
