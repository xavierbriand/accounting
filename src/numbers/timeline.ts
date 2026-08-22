import type { Cents } from '../core/money.ts';
import { monthOf, monthRange, type Month } from '../core/dates.ts';
import type { Ledger } from '../ingest/load.ts';
import type { Transaction } from '../ingest/ledger.ts';
import { outflow } from './envelopes.ts';

export interface MonthlySpend {
  readonly month: Month;
  /** Net outflow (`outflow()`) across every `movement` transaction, every envelope, that month. */
  readonly total: Cents;
}

/**
 * Total household spend, one figure per calendar month, across the whole
 * ledger — unlike `computeConsumption`, this has no `referenceDay` bound:
 * every month the ledger has a `movement` in is a historical fact, not
 * something to cut off "so far."
 *
 * `monthRange` fills any month with no `movement` transactions at all in
 * with a zero, between the first and last month seen — a real gap (the
 * household simply spent nothing that month, or an export is missing) reads
 * as a genuine dip on 4b's line chart rather than vanishing as a silent
 * skip in the x-axis.
 *
 * The last month in the returned range is very likely partial — however far
 * through it `referenceDay` is — and this function has no way to know that;
 * a caller charting this must show that last point distinctly, as the
 * step-4 plan calls out.
 */
export function monthlySpendTimeline(ledger: Ledger): readonly MonthlySpend[] {
  const movements = ledger.transactions.filter((t) => t.kind === 'movement');
  // Equivalent, not dead: bypassing this leaves `months` empty, so `first`
  // and `last` below are `undefined` (past the `!`, which is compile-time
  // only). `monthRange(undefined, undefined)`'s loop condition,
  // `m <= undefined`, is false for any `m` — JS resolves any comparison
  // against `undefined` to false — so the loop body never runs and it
  // returns `[]` regardless. Verified directly: removing this guard changes
  // nothing observable for any ledger with zero movements. Kept because it
  // states the case explicitly rather than relying on a comparison quirk
  // three lines away from the type-unsafe `!` that depends on it.
  if (movements.length === 0) return [];

  const byMonth = new Map<Month, Transaction[]>();
  for (const t of movements) {
    const month = monthOf(t.occurredOn);
    const bucket = byMonth.get(month);
    if (bucket === undefined) byMonth.set(month, [t]);
    else bucket.push(t);
  }

  const months = [...byMonth.keys()].sort();
  const first = months[0]!;
  const last = months[months.length - 1]!;

  return monthRange(first, last).map((month) => ({
    month,
    total: outflow(byMonth.get(month) ?? []),
  }));
}
