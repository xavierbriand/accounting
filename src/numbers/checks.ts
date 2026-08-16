import type { Cents } from '../core/money.ts';
import { addMonths, monthOf, type Day, type Month } from '../core/dates.ts';
import type { Config } from '../config/load.ts';
import type { Ledger } from '../ingest/load.ts';
import { outflow } from './envelopes.ts';
import type { EnvelopeConsumption } from './consumption.ts';
import { attributeContributions, contributionsByMonth } from './funding.ts';

/**
 * Whether an envelope with a goal is still reachable, projected from how far
 * through its seasonal pace the year is — not a flat `×12/months-elapsed`,
 * which would mark a holiday envelope hopeless every January.
 *
 * `too-early` guards the one place that projection divides by the pace
 * fraction: an envelope entirely weighted to a month not yet reached has
 * `paceExpected === 0`, and nothing can be projected from zero.
 */
export type GoalStatus = 'no-goal' | 'too-early' | 'on-track' | 'at-risk';

export interface EnvelopeCheck {
  readonly envelope: EnvelopeConsumption['envelope'];
  readonly pastPace: boolean;
  readonly goalStatus: GoalStatus;
  /** Year-to-date spend, extrapolated by the seasonal pace fraction. `null` unless a goal exists and it isn't too early to project. */
  readonly projectedFullYear: Cents | null;
}

export interface PlanCheck {
  /** Sum of every configured envelope's estimate. */
  readonly plannedTotal: Cents;
  /** Actual net outflow across the trailing 12 months ending on the reference day. */
  readonly trailingYearActual: Cents;
  readonly drift: Cents;
  readonly bufferTarget: Cents;
  /**
   * The most negative single month of real cash flow observed in the whole
   * ledger — never positive: a household whose worst month was still a net
   * gain has a worst drawdown of zero, not the smallest of its gains.
   */
  readonly worstObservedMonth: Cents;
  readonly bufferSufficient: boolean;
  readonly envelopes: readonly EnvelopeCheck[];
}

function checkEnvelope(c: EnvelopeConsumption): EnvelopeCheck {
  const pastPace = c.yearToDateSpent > c.paceExpected;

  if (c.envelope.kind !== 'configured' || c.envelope.config.goal === null) {
    return { envelope: c.envelope, pastPace, goalStatus: 'no-goal', projectedFullYear: null };
  }
  if (c.paceExpected === 0) {
    return { envelope: c.envelope, pastPace, goalStatus: 'too-early', projectedFullYear: null };
  }

  const estimate = c.envelope.config.estimate;
  const projectedFullYear = Math.round((c.yearToDateSpent * estimate) / c.paceExpected);
  const goalStatus: GoalStatus = projectedFullYear <= c.envelope.config.goal ? 'on-track' : 'at-risk';
  return { envelope: c.envelope, pastPace, goalStatus, projectedFullYear };
}

/**
 * Real cash flow per calendar month across the whole ledger — the figure
 * `bufferTarget` has to cover, not the plan.
 *
 * Not a plain sum of `movement` amounts by `occurredOn`: a card purchase is
 * not yet cash leaving the account, its `settlement` is, at `settlesOn` —
 * the same distinction `reconcile.ts` exists to enforce, re-derived here
 * would risk disagreeing with it. Contributions count in the month they
 * *fund* (3a's `contributionsByMonth`), not when they post, for the same
 * reason 3a exists. A `transfer-out` is counted immediately, at
 * `occurredOn`: it is real cash leaving the tracked position the moment it
 * happens, the mirror image of a `transfer-in` funding it.
 */
function netFlowByMonth(config: Config, ledger: Ledger): ReadonlyMap<Month, Cents> {
  const byMonth = new Map<Month, Cents>();
  const add = (month: Month, amount: Cents) => byMonth.set(month, (byMonth.get(month) ?? 0) + amount);

  for (const t of ledger.transactions) {
    if (t.kind === 'movement' && t.source.kind === 'account') add(monthOf(t.occurredOn), t.amount);
    else if (t.kind === 'settlement') add(monthOf(t.settlesOn), t.amount);
    else if (t.kind === 'transfer-out') add(monthOf(t.occurredOn), t.amount);
  }

  for (const monthly of contributionsByMonth(attributeContributions(config, ledger))) {
    add(monthly.month, monthly.total);
  }

  return byMonth;
}

/**
 * How the plan compares to reality, as of `referenceDay`.
 *
 * `consumption` is supplied rather than recomputed, so this never disagrees
 * with what section 02 is showing at the same moment — both come from the
 * same call, in `numbers/plan.ts`.
 */
export function checkPlan(
  config: Config,
  ledger: Ledger,
  consumption: readonly EnvelopeConsumption[],
  referenceDay: Day,
): PlanCheck {
  const plannedTotal = consumption.reduce(
    (total, c) => (c.envelope.kind === 'configured' ? total + c.envelope.config.estimate : total),
    0,
  );

  const windowStart = addMonths(monthOf(referenceDay), -11);
  const trailingYearActual = outflow(
    ledger.transactions.filter(
      (t) => t.kind === 'movement' && monthOf(t.occurredOn) >= windowStart && t.occurredOn <= referenceDay,
    ),
  );

  // Floored at zero, the same convention outflow() uses: if every observed
  // month was net-positive, the worst drawdown the buffer ever had to
  // absorb was none at all, not the smallest of several gains.
  const monthly = [...netFlowByMonth(config, ledger).values()];
  const worstObservedMonth = Math.min(0, ...monthly);

  return {
    plannedTotal,
    trailingYearActual,
    drift: trailingYearActual - plannedTotal,
    bufferTarget: config.bufferTarget,
    worstObservedMonth,
    bufferSufficient: config.bufferTarget + worstObservedMonth >= 0,
    envelopes: consumption.map(checkEnvelope),
  };
}
