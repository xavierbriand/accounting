/**
 * Returns all ISO YYYY-MM-DD first-of-month dates in the closed interval [from, to].
 * When from itself is a first-of-month, it is included.
 * Returns an empty array when from > to.
 */
export function enumerateMonthStarts(from: string, to: string): readonly string[] {
  if (from > to) return [];

  const result: string[] = [];

  // Parse from: advance to the first day of the next month if from is not a first-of-month.
  const [fromYear, fromMonth] = from.split('-').map(Number) as [number, number];
  const fromDay = Number(from.split('-')[2]);

  let year = fromYear;
  let month = fromMonth;

  // If from is NOT a first-of-month, advance to next month-start.
  if (fromDay !== 1) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  while (true) {
    const mm = String(month).padStart(2, '0');
    const date = `${year}-${mm}-01`;
    if (date > to) break;
    result.push(date);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return result;
}

/**
 * Returns the ISO YYYY-MM-DD date one day before the given date.
 * Uses new Date(string) for ISO parsing — purely date-arithmetic, no system clock.
 */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
