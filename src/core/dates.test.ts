import { describe, expect, it } from 'vitest';
import {
  addMonths,
  DateParseError,
  dayOfMonth,
  formatMonthLong,
  makeMonth,
  monthOf,
  monthRange,
  parseFrenchDay,
  parseOfxDay,
  type Day,
  type Month,
} from './dates.ts';

describe('parseFrenchDay', () => {
  it('reads the CSV’s DD/MM/YYYY', () => {
    expect(parseFrenchDay('14/08/2026')).toBe('2026-08-14');
    expect(parseFrenchDay('01/02/2026')).toBe('2026-02-01');
  });

  it('does not silently swap day and month', () => {
    // 04/09 is 4 September, not 9 April. Getting this backwards would move a
    // card settlement by five months and still look plausible.
    expect(parseFrenchDay('04/09/2026')).toBe('2026-09-04');
  });

  it('refuses impossible dates', () => {
    expect(() => parseFrenchDay('32/01/2026')).toThrow(DateParseError);
    expect(() => parseFrenchDay('01/13/2026')).toThrow(DateParseError);
    expect(() => parseFrenchDay('2026-08-14')).toThrow(DateParseError);
  });
});

describe('parseOfxDay', () => {
  it('reads a bare YYYYMMDD', () => {
    expect(parseOfxDay('20260814')).toBe('2026-08-14');
  });

  it('ignores the time and timezone suffix OFX may append', () => {
    expect(parseOfxDay('20260815171313')).toBe('2026-08-15');
    expect(parseOfxDay('20260815120000[+1:CET]')).toBe('2026-08-15');
  });

  it('is timezone-independent by construction', () => {
    // A calendar date is not an instant. Round-tripping through Date would
    // return the 3rd west of UTC, turning a paid month into a missed one.
    expect(parseOfxDay('20260804')).toBe('2026-08-04');
  });
});

describe('month arithmetic', () => {
  const aug26 = '2026-08' as Month;

  it('extracts the month of a day', () => {
    expect(monthOf('2026-08-14' as Day)).toBe('2026-08');
  });

  it('rolls over a year boundary in both directions', () => {
    expect(addMonths('2025-12' as Month, 1)).toBe('2026-01');
    expect(addMonths('2026-01' as Month, -1)).toBe('2025-12');
    expect(addMonths(aug26, -12)).toBe('2025-08');
    expect(addMonths(aug26, 5)).toBe('2027-01');
  });

  it('builds an inclusive ascending range', () => {
    expect(monthRange('2025-11' as Month, '2026-02' as Month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns a single month when both ends are equal', () => {
    expect(monthRange(aug26, aug26)).toEqual(['2026-08']);
  });

  it('reads the day of the month, which decides which month a transfer funds', () => {
    expect(dayOfMonth('2026-05-28' as Day)).toBe(28);
  });

  it('formats a month for a chart label', () => {
    expect(formatMonthLong(makeMonth(2026, 8))).toBe('Aug 2026');
  });
});
