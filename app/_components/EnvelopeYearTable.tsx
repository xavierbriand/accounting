import { formatEur } from '@/core/money.ts';
import { envelopeId, envelopeName } from '@/numbers/envelopes.ts';
import type { EnvelopeConsumption } from '@/numbers/consumption.ts';

export interface EnvelopeYearTableProps {
  readonly consumption: readonly EnvelopeConsumption[];
}

/**
 * Every envelope's shape from the completed prior year, alongside what's
 * currently configured — the reference a household rebuilds next year's
 * estimates from. A derived envelope has no estimate or goal to show,
 * only what it actually cost; a configured one with no `goal` set shows
 * `—` there too, same as `EnvelopeCheckTable`'s "no goal" case.
 *
 * A table, not a chart: `> ~7 classes` already argues for one, and a real
 * household clears that many times over (54 rows, one real test run so
 * far). Sorted the same way `plan.consumption` already is — this is a
 * reference to read down, not a "which one first" ranking the way 02's
 * meters or 03's check table are.
 */
export function EnvelopeYearTable({ consumption }: EnvelopeYearTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table year">
        <thead>
          <tr>
            <th>Envelope</th>
            <th className="amount">Prior year actual</th>
            <th className="amount">Estimate</th>
            <th className="amount">Goal</th>
          </tr>
        </thead>
        <tbody>
          {consumption.map((c) => (
            <tr key={envelopeId(c.envelope)}>
              <td>{envelopeName(c.envelope)}</td>
              <td className="amount num">{formatEur(c.priorYearActual)}</td>
              <td className="amount num">
                {c.envelope.kind === 'configured' ? formatEur(c.envelope.config.estimate) : '—'}
              </td>
              <td className="amount num">
                {c.envelope.kind === 'configured' && c.envelope.config.goal !== null
                  ? formatEur(c.envelope.config.goal)
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
