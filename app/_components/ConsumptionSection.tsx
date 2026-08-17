import type { Plan } from '@/numbers/plan.ts';
import type { MonthlySpend } from '@/numbers/timeline.ts';
import { SpendTrendChart } from './SpendTrendChart.tsx';
import { EnvelopeMeters } from './EnvelopeMeters.tsx';

export interface ConsumptionSectionProps {
  readonly plan: Plan;
  /** `monthlySpendTimeline(ledger)` — computed separately from `Plan`: it has no `referenceDay` bound. */
  readonly timeline: readonly MonthlySpend[];
}

export function ConsumptionSection({ plan, timeline }: ConsumptionSectionProps) {
  return (
    <section className="card">
      <h2>02 · What we spent</h2>
      <p className="deck">Total spend by month, against its own average, and every configured envelope's pace.</p>

      <SpendTrendChart months={timeline} />
      <EnvelopeMeters consumption={plan.consumption} />
    </section>
  );
}
