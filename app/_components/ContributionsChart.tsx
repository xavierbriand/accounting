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
const AXIS_ROOM = 26; // below the baseline, for the month label
const LEFT_AXIS_WIDTH = 56; // for the Y-axis tick labels

interface Segment {
  readonly height: number;
  readonly color: string;
  readonly muted: boolean;
  readonly label: string;
}

/** Rounds up to a "clean" step (1, 2, or 5 × a power of ten) for a Y-axis tick, the same rule the dataviz skill asks for. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 5, 10];
  const step = steps.find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function ContributionsChart({ months, people, referenceDay }: ContributionsChartProps) {
  if (months.length === 0) {
    return <p className="chart-empty">No contributions recorded yet.</p>;
  }

  // Rounded up to a clean tick value, not the raw max — a raw max would put
  // the tallest bar's label at an arbitrary figure nobody would round-trip
  // by eye, and every other bar would read off an axis with no clean anchor.
  const axisMax = niceMax(Math.max(...months.map((m) => m.total), 1));
  const scale = (cents: Cents): number => (cents / axisMax) * CHART_HEIGHT;

  const currentMonth = monthOf(referenceDay);
  const chartWidth = months.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
  const width = LEFT_AXIS_WIDTH + chartWidth;
  const svgHeight = CHART_HEIGHT + AXIS_ROOM;
  const baseline = CHART_HEIGHT;

  // Never a number on every point (the dataviz skill's own rule) — with up
  // to 18+ months of real bars, a total label on each one collides with its
  // neighbours long before it becomes readable. Two gridlines carry the
  // scale instead; the exact figure per month lives in the native tooltip.
  const gridlines = [0.5, 1].map((fraction) => ({
    y: baseline - CHART_HEIGHT * fraction,
    value: axisMax * fraction,
  }));

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
        {gridlines.map(({ y, value }) => (
          <g key={value}>
            <line className="grid-line" x1={LEFT_AXIS_WIDTH} y1={y} x2={width} y2={y} />
            <text className="axis-tick-label" x={LEFT_AXIS_WIDTH - 8} y={y} textAnchor="end" dominantBaseline="middle">
              {formatEurCompact(value)}
            </text>
          </g>
        ))}
        <line className="axis-line" x1={LEFT_AXIS_WIDTH} y1={baseline} x2={width} y2={baseline} />

        {months.map((month, i) => {
          const x = LEFT_AXIS_WIDTH + BAR_GAP + i * (BAR_WIDTH + BAR_GAP);
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

          const titleText = `${formatMonthShort(month.month)}${isInProgress ? ' (in progress)' : ''} — ${formatEur(
            month.total,
          )} total${segments.length > 0 ? ` (${segments.map((s) => s.label).join(', ')})` : ''}`;

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
