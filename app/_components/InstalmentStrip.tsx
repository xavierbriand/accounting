import { formatEur, sum } from '@/core/money.ts';
import type { Config } from '@/config/load.ts';
import type { Plan } from '@/numbers/plan.ts';
import { StatTile } from './StatTile.tsx';

// Same colour-slot convention as ContributionsChart — see its comment on why
// only two exist.
const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)'] as const;

/** A KPI row, one stat tile per person — a handful of headline numbers, not a chart. */
export function InstalmentStrip({ config, plan }: { readonly config: Config; readonly plan: Plan }) {
  const totalNet = sum(plan.shares.map((s) => s.netMonthly));

  return (
    <div className="strip">
      {config.people.map((person, i) => {
        const share = plan.shares.find((s) => s.personId === person.id);
        const pct = share !== undefined && totalNet > 0 ? ((share.netMonthly / totalNet) * 100).toFixed(1) : null;
        // exactOptionalPropertyTypes: an optional prop must be omitted, not
        // passed `undefined` — the same rule this codebase's fixture
        // builders already follow.
        return (
          <StatTile
            key={person.id}
            label={`${person.name} transfers`}
            value={share?.amount ?? 0}
            seriesColor={SERIES_COLORS[i % SERIES_COLORS.length]!}
            {...(share !== undefined
              ? { sub: `net income ${formatEur(share.netMonthly)}${pct !== null ? ` · ${pct}% share` : ''}` }
              : {})}
          />
        );
      })}
    </div>
  );
}
