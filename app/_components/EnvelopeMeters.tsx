import { formatEur, type Cents } from '@/core/money.ts';
import type { EnvelopeConsumption } from '@/numbers/consumption.ts';

export interface EnvelopeMetersProps {
  readonly consumption: readonly EnvelopeConsumption[];
}

interface MeterRow {
  readonly id: string;
  readonly name: string;
  readonly spent: Cents;
  readonly estimate: Cents;
  readonly paceExpected: Cents;
}

/**
 * How far over its own expected-by-now pace this envelope is, as a ratio —
 * the sort key, not a rendered figure. An envelope whose season hasn't
 * started yet has `paceExpected === 0`; any spending against it at all is
 * as over-pace as an envelope can get, so it sorts ahead of every real
 * ratio rather than dividing by zero.
 */
function paceRatio(row: MeterRow): number {
  if (row.paceExpected > 0) return row.spent / row.paceExpected;
  return row.spent > 0 ? Number.POSITIVE_INFINITY : 0;
}

/**
 * Only configured envelopes have an estimate to meter against — a derived
 * envelope has nowhere to put a track. Sorted worst-pace-first, so the
 * highest-signal envelope is the first thing seen, not alphabetical.
 */
function toRows(consumption: readonly EnvelopeConsumption[]): readonly MeterRow[] {
  const rows: MeterRow[] = [];
  for (const c of consumption) {
    if (c.envelope.kind !== 'configured') continue;
    rows.push({
      id: c.envelope.config.id,
      name: c.envelope.config.name,
      spent: c.yearToDateSpent,
      estimate: c.envelope.config.estimate,
      paceExpected: c.paceExpected,
    });
  }
  return [...rows].sort((a, b) => paceRatio(b) - paceRatio(a));
}

/**
 * A single ratio against a limit, per envelope — the dataviz skill's own
 * "meter" row. Spend is the fill, the estimate is the track, and the
 * seasonally-paced expectation is an overlaid tick: where spending *should*
 * be by now, not a flat one-twelfth-per-month line. Native `title` carries
 * the exact figures — this is a plain HTML meter, not an SVG chart, so the
 * browser's own tooltip is the cheap baseline rather than a `<title>` mark.
 */
export function EnvelopeMeters({ consumption }: EnvelopeMetersProps) {
  const rows = toRows(consumption);
  if (rows.length === 0) {
    return <p className="chart-empty">No configured envelopes yet.</p>;
  }

  return (
    <div className="meters">
      {rows.map((row) => {
        const fillPct = row.estimate > 0 ? Math.min(100, (row.spent / row.estimate) * 100) : row.spent > 0 ? 100 : 0;
        const pacePct = row.estimate > 0 ? Math.min(100, (row.paceExpected / row.estimate) * 100) : 0;
        const overflow = row.spent > row.estimate;
        const title = `${row.name}: ${formatEur(row.spent)} spent of ${formatEur(row.estimate)} estimated — expected ${formatEur(row.paceExpected)} by now`;
        return (
          <div className="meter-row" key={row.id} title={title}>
            <div className="meter-label">
              <span className="meter-name">{row.name}</span>
              <span className="meter-figures num">
                {formatEur(row.spent)} / {formatEur(row.estimate)}
              </span>
            </div>
            <div className="meter-track">
              <div
                className={overflow ? 'meter-fill meter-fill-over' : 'meter-fill'}
                style={{ width: `${fillPct}%` }}
              />
              <div className="meter-pace-tick" style={{ left: `${pacePct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
