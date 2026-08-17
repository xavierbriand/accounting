import { formatMonthShort, monthOf, type Day } from '@/core/dates.ts';
import { formatEur, formatEurCompact, type Cents } from '@/core/money.ts';
import type { Person } from '@/config/load.ts';
import type { MonthlyContributions } from '@/numbers/funding.ts';
import { Legend } from './Legend.tsx';

export interface ContributionsChartProps {
  readonly months: readonly MonthlyContributions[];
  /** For name + colour-slot order — `config.people`, declaration order. */
  readonly people: readonly Person[];
  /** Marks the in-progress month distinctly: it is not yet a complete data point. */
  readonly referenceDay: Day;
}

// Only two categorical colours exist in globals.css — #296 frames this as a
// two-person tool throughout, and the schema doesn't cap [people.*] at two.
// A third person renders with an undefined CSS variable, which fails loudly
// (a missing swatch) rather than silently reusing a colour.
const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)'] as const;

const BAR_WIDTH = 22;
const BAR_GAP = 16;
const CHART_HEIGHT = 140;
const SEGMENT_GAP = 2; // the surface gap between stacked segments, per the dataviz skill
const LABEL_ROOM = 20; // above the tallest bar, for the total label
const AXIS_ROOM = 26; // below the baseline, for the month label

interface Segment {
  readonly height: number;
  readonly color: string;
  readonly muted: boolean;
  readonly label: string;
}

export function ContributionsChart({ months, people, referenceDay }: ContributionsChartProps) {
  if (months.length === 0) {
    return <p className="chart-empty">No contributions recorded yet.</p>;
  }

  const maxTotal = Math.max(...months.map((m) => m.total), 1);
  const scale = (cents: Cents): number => (cents / maxTotal) * CHART_HEIGHT;

  const currentMonth = monthOf(referenceDay);
  const width = months.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
  const svgHeight = CHART_HEIGHT + LABEL_ROOM + AXIS_ROOM;
  const baseline = LABEL_ROOM + CHART_HEIGHT;

  return (
    <div className="chart-wrap">
      <Legend
        items={[
          ...people.map((person, i) => ({ label: person.name, color: SERIES_COLORS[i % SERIES_COLORS.length]! })),
          { label: 'Unattributed', muted: true },
        ]}
      />
      <svg
        className="contrib"
        viewBox={`0 0 ${width} ${svgHeight}`}
        width="100%"
        height={svgHeight}
        role="img"
        aria-label="Contributions by month, stacked by sender"
      >
        <line className="axis-line" x1={0} y1={baseline} x2={width} y2={baseline} />
        {months.map((month, i) => {
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP);
          const isInProgress = month.month === currentMonth;

          const segments: Segment[] = [];
          for (const [idx, person] of people.entries()) {
            const amount = month.byPerson.get(person.id) ?? 0;
            if (amount <= 0) continue;
            segments.push({
              height: scale(amount),
              color: SERIES_COLORS[idx % SERIES_COLORS.length]!,
              muted: false,
              label: `${person.name} ${formatEur(amount)}`,
            });
          }
          if (month.unattributed > 0) {
            segments.push({
              height: scale(month.unattributed),
              color: '',
              muted: true,
              label: `Unattributed ${formatEur(month.unattributed)}`,
            });
          }

          const totalHeight = segments.reduce((a, s) => a + s.height, 0) + SEGMENT_GAP * Math.max(segments.length - 1, 0);
          const titleText = `${formatMonthShort(month.month)}${isInProgress ? ' (in progress)' : ''} — ${
            segments.length > 0 ? segments.map((s) => s.label).join(', ') : 'nothing recorded'
          }`;

          let cursorTop = baseline;
          const rects = segments.map((seg, idx) => {
            const top = cursorTop - seg.height;
            cursorTop = top - SEGMENT_GAP;
            const isTopmost = idx === segments.length - 1;
            return (
              <rect
                key={idx}
                x={x}
                y={top}
                width={BAR_WIDTH}
                height={seg.height}
                rx={isTopmost ? 4 : 0}
                ry={isTopmost ? 4 : 0}
                fill={seg.muted ? 'var(--ink-muted)' : seg.color}
                fillOpacity={seg.muted ? 0.55 : 1}
              />
            );
          });

          return (
            <g key={month.month} opacity={isInProgress ? 0.6 : 1}>
              <title>{titleText}</title>
              {rects}
              {month.total > 0 && (
                <text
                  className="bar-total-label"
                  x={x + BAR_WIDTH / 2}
                  y={baseline - totalHeight - 8}
                  textAnchor="middle"
                >
                  {formatEurCompact(month.total)}
                </text>
              )}
              <text className="month-label" x={x + BAR_WIDTH / 2} y={svgHeight - 8} textAnchor="middle">
                {formatMonthShort(month.month)}
                {isInProgress ? '*' : ''}
              </text>
            </g>
          );
        })}
      </svg>
      {months.some((m) => m.month === currentMonth) && (
        <p className="chart-note">* month in progress — not yet a complete data point</p>
      )}
    </div>
  );
}
