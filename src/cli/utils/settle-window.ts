function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export interface CalendarWindow {
  readonly from: string;
  readonly to: string;
}

export function nextCalendarMonth(asOf: string): CalendarWindow {
  const [year, month] = asOf.split('-').map(Number) as [number, number];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const from = `${nextYear}-${pad2(nextMonth)}-01`;

  // Last day of nextMonth: new Date(year, monthIndex+1, 0) gives last day of month at monthIndex
  // monthIndex is 0-based, so nextMonth-1 is the 0-based index; nextMonth is the 1-based index.
  // new Date(nextYear, nextMonth, 0) gives last day of month nextMonth in year nextYear.
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  const to = `${nextYear}-${pad2(nextMonth)}-${pad2(lastDay)}`;

  return { from, to };
}

// Subtracts one calendar month from `date`, clamping the day-of-month to the target
// month's last valid day (e.g. 2026-03-31 -> 2026-02-28; 2024-03-31 -> 2024-02-29,
// a leap year). Without this clamp, asOf on the 29th-31st would compose an
// impossible calendar date (e.g. "2026-02-31") that later date arithmetic
// (SplitRulesService validity windows, BufferStateService date comparisons) would
// silently mis-order or a real Date parse would roll over unexpectedly.
function oneCalendarMonthBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const lastDayOfPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfPrevMonth);
  return `${prevYear}-${pad2(prevMonth)}-${pad2(clampedDay)}`;
}

export interface PreviousSettleWindow extends CalendarWindow {
  readonly asOfLast: string;
}

/**
 * Composes the "last settle window" half of the `explain` as-of pair: `asOfLast`
 * (one calendar month before `asOf`, clamped for short months) and the calendar
 * month that precedes this settle window (`nextCalendarMonth(asOf)`).
 *
 * Silent-zero trap: `SafeTransferCalculator.calculateForWindow`'s buffer top-up
 * fill-slot enumeration starts counting fill slots from the `asOf` argument it is
 * given (see `enumerateMonthStarts(asOf, ...)` in safe-transfer-calculator.ts). If
 * the SAME `asOf` were passed to both the this-month and last-month
 * `calculateForWindow` calls, the "last month" run would enumerate fill slots
 * starting from the CURRENT asOf instead of one month earlier — silently
 * dropping or misdating buffer top-up line items that should appear in last
 * month's window. Callers must always pass this function's `asOfLast` to the
 * last-month `calculateForWindow` call, never the original `asOf`.
 */
export function previousSettleWindow(asOf: string): PreviousSettleWindow {
  const asOfLast = oneCalendarMonthBefore(asOf);
  const window = nextCalendarMonth(asOfLast);
  return { asOfLast, from: window.from, to: window.to };
}
