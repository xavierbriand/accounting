/**
 * Pure date-arithmetic helpers for recurring-cost cadence enumeration.
 *
 * Design note: only `enumerateOccurrences` is exported. A two-arg
 * `nextOccurrence(date, cadence)` form is NOT exported because it cannot
 * preserve the anchor day across day-of-month overflow steps.
 *
 * Algorithm: each step i computes validFrom + (i × cadenceStep) months,
 * then clamps the day-of-month to the target month's last valid day.
 * The anchor day is always taken from `validFrom`, so Feb-29 annual rules
 * recover correctly in the next leap year:
 *   2024-02-29 → 2025-02-28 → 2026-02-28 → 2027-02-28 → 2028-02-29.
 *
 * No system clock reads. new Date(string) for ISO parsing IS used.
 */
import type { RecurringCadence } from '@core/config/app-config.js';

const CADENCE_STEP: Record<RecurringCadence, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function stepDate(validFrom: string, stepIndex: number, cadence: RecurringCadence): string {
  const base = new Date(validFrom + 'T00:00:00Z');
  const anchorDay = base.getUTCDate();
  const step = CADENCE_STEP[cadence] * stepIndex;
  const baseYear = base.getUTCFullYear();
  const baseMonth = base.getUTCMonth() + 1; // 1-based
  const totalMonths = baseYear * 12 + (baseMonth - 1) + step;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1; // 1-based
  const maxDay = daysInMonth(targetYear, targetMonth);
  const clampedDay = Math.min(anchorDay, maxDay);
  return (
    String(targetYear).padStart(4, '0') +
    '-' +
    String(targetMonth).padStart(2, '0') +
    '-' +
    String(clampedDay).padStart(2, '0')
  );
}

export function enumerateOccurrences(
  validFrom: string,
  validTo: string | undefined,
  cadence: RecurringCadence,
  windowFrom: string,
  windowTo: string,
): readonly string[] {
  const results: string[] = [];
  let i = 0;
  while (true) {
    const date = stepDate(validFrom, i, cadence);
    // Once date exceeds both lifecycle end and window end, stop.
    const lifecycleEnd = validTo ?? '9999-12-31';
    if (date > lifecycleEnd || date > windowTo) break;
    if (date >= windowFrom) {
      results.push(date);
    }
    i++;
  }
  return results;
}
