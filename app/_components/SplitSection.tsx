import { formatEur, sum } from '@/core/money.ts';
import type { Config } from '@/config/load.ts';
import type { Plan } from '@/numbers/plan.ts';
import { ContributionsChart } from './ContributionsChart.tsx';

const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)'] as const;

export function SplitSection({ config, plan }: { readonly config: Config; readonly plan: Plan }) {
  const totalNet = sum(plan.shares.map((s) => s.netMonthly));

  return (
    <section className="card">
      <h2>01 · The split</h2>
      <p className="deck">Income, net of tax, split proportionally. Recomputed every run — never a stored figure.</p>

      <div className="table-scroll">
        <table className="data-table income">
          <thead>
            <tr>
              <th>Person</th>
              <th>Source</th>
              <th className="amount">Net</th>
              <th className="amount">Share</th>
              <th className="amount">Transfers</th>
            </tr>
          </thead>
          <tbody>
            {config.people.map((person, personIndex) => {
              const share = plan.shares.find((s) => s.personId === person.id);
              const pct =
                share !== undefined && totalNet > 0 ? ((share.netMonthly / totalNet) * 100).toFixed(1) : null;
              return person.income.map((source, sourceIndex) => (
                <tr key={`${person.id}:${sourceIndex}`}>
                  {sourceIndex === 0 && (
                    <td rowSpan={person.income.length}>
                      <span className="person">
                        <span
                          className="swatch"
                          style={{ background: SERIES_COLORS[personIndex % SERIES_COLORS.length] }}
                        />
                        {person.name}
                      </span>
                    </td>
                  )}
                  <td>{source.label}</td>
                  <td className="amount num">
                    {formatEur(source.net)}{' '}
                    <span className="cadence">/{source.cadence === 'monthly' ? 'mo' : 'yr'}</span>
                  </td>
                  {sourceIndex === 0 && (
                    <td className="amount num share" rowSpan={person.income.length}>
                      {pct !== null ? `${pct}%` : '—'}
                    </td>
                  )}
                  {sourceIndex === 0 && (
                    <td className="amount num" rowSpan={person.income.length}>
                      {share !== undefined ? formatEur(share.amount) : '—'}
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <ContributionsChart months={plan.contributions} people={config.people} referenceDay={plan.referenceDay} />
    </section>
  );
}
