/**
 * Bank dates are calendar dates, not instants. A transaction posted on the 4th
 * is posted on the 4th in every timezone, so nothing here goes near `Date` —
 * constructing one from "2026-08-04" and reading it back in a westward timezone
 * yields the 3rd, which is exactly the class of bug that turns a paid month into
 * a missed one.
 */

/** An ISO calendar date, `YYYY-MM-DD`. */
export type Day = string & { readonly __brand: 'Day' };
/** An ISO calendar month, `YYYY-MM`. */
export type Month = string & { readonly __brand: 'Month' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FRENCH = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const OFX = /^(\d{4})(\d{2})(\d{2})/;

export class DateParseError extends Error {
  readonly raw: string;
  readonly where: string;

  constructor(raw: string, where: string) {
    super(`Cannot read "${raw}" as a date (${where})`);
    this.name = 'DateParseError';
    this.raw = raw;
    this.where = where;
  }
}

function checked(iso: string, raw: string, where: string): Day {
  if (!DAY.test(iso)) throw new DateParseError(raw, where);
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new DateParseError(raw, where);
  return iso as Day;
}

/** `14/08/2026` → `2026-08-14`. The CSV format. */
export function parseFrenchDay(raw: string, where = 'date'): Day {
  const m = FRENCH.exec(raw.trim());
  if (!m) throw new DateParseError(raw, where);
  return checked(`${m[3]}-${m[2]}-${m[1]}`, raw, where);
}

/** `20260814` or `20260814120000[+1:CET]` → `2026-08-14`. The OFX format. */
export function parseOfxDay(raw: string, where = 'date'): Day {
  const m = OFX.exec(raw.trim());
  if (!m) throw new DateParseError(raw, where);
  return checked(`${m[1]}-${m[2]}-${m[3]}`, raw, where);
}

export function monthOf(day: Day): Month {
  return day.slice(0, 7) as Month;
}

export function yearOf(day: Day | Month): number {
  return Number(day.slice(0, 4));
}

/** 1-12. */
export function monthNumber(month: Month): number {
  return Number(month.slice(5, 7));
}

export function makeMonth(year: number, month1to12: number): Month {
  return `${year}-${String(month1to12).padStart(2, '0')}` as Month;
}

export function dayOfMonth(day: Day): number {
  return Number(day.slice(8, 10));
}

export function addMonths(month: Month, delta: number): Month {
  const total = yearOf(month) * 12 + (monthNumber(month) - 1) + delta;
  return makeMonth(Math.floor(total / 12), (total % 12) + 1);
}

/** Inclusive range of months, ascending. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatMonthShort(month: Month): string {
  return MONTH_NAMES[monthNumber(month) - 1] ?? month;
}

export function formatMonthLong(month: Month): string {
  return `${formatMonthShort(month)} ${yearOf(month)}`;
}
