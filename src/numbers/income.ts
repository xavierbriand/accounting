import { allocate, type Cents } from '../core/money.ts';
import type { Person } from '../config/load.ts';

/**
 * What each person transfers this month — the household's monthly
 * requirement, split by income.
 *
 * Recomputed on every run, never read from a stored figure: the household's
 * incomes and the requirement both change, and a stale split would drift the
 * same way a stale envelope estimate does.
 */
export interface PersonShare {
  readonly personId: string;
  /** This person's own monthly-equivalent income — the weight, not the transfer. */
  readonly netMonthly: Cents;
  /** What they actually transfer this month. */
  readonly amount: Cents;
}

/**
 * A person's income, folded to one monthly figure.
 *
 * An `annual` entry (a bonus, a profit share) divides by twelve and rounds.
 * That rounding is deliberately not exactness-checked the way `allocate()`
 * is: this figure only ever feeds `computeShares` as a relative *weight*,
 * and it is `allocate()` that guarantees the transfers it produces sum to
 * the requirement exactly, regardless of a cent of drift in the ratio.
 */
export function netMonthly(person: Person): Cents {
  let total = 0;
  for (const source of person.income) {
    total += source.cadence === 'monthly' ? source.net : Math.round(source.net / 12);
  }
  return total;
}

/**
 * Split `monthlyRequirement` across `people`, proportionally to each
 * person's `netMonthly` income.
 *
 * `monthlyRequirement` is a plain `Cents` rather than anything derived from
 * envelopes on purpose — this module has no import edge toward
 * `numbers/envelopes.ts` or `numbers/consumption.ts`, and stays testable
 * with a bare number. `numbers/plan.ts` is what supplies the real figure:
 * this month's seasonally-paced total across every envelope.
 *
 * Order follows `people`, unchanged — the same order `sluice.toml`'s
 * `[people.*]` tables were declared in.
 */
export function computeShares(
  people: readonly Person[],
  monthlyRequirement: Cents,
): readonly PersonShare[] {
  const weights = people.map(netMonthly);
  const amounts = allocate(monthlyRequirement, weights);
  return people.map((person, i) => ({
    personId: person.id,
    netMonthly: weights[i]!,
    amount: amounts[i]!,
  }));
}
