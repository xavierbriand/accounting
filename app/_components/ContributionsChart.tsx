import { formatMonthShort, monthOf, type Day } from '@/core/dates.ts';
import { formatEur, formatEurCompact, type Cents } from '@/core/money.ts';
import type { Person } from '@/config/load.ts';
import type { MonthlyContributions } from '@/numbers/funding.ts';
import { niceMax } from '../_lib/chart.ts';
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
// A third `[people.*]` entry is refused loudly in page.tsx before this
// component ever renders, rather than silently reusing a colour here.
const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)'] as const;

const BAR_WIDTH = 22;
const BAR_GAP = 16;
const CHART_HEIGHT = 140;
const SEGMENT_GAP = 2; // the surface gap between stacked segments, per the dataviz skill
const AXIS_ROOM = 26; // below the baseline, for the month label
const TOP_ROOM = 14; // above the 100% gridline, so its label isn't clipped by the viewBox
const LEFT_AXIS_WIDTH = 56; // for the Y-axis tick labels

interface Segment {
  readonly height: number;
  readonly color: string;
  readonly muted: boolean;
  readonly label: string;
}

/**
 * A rectangle rounded at the top two corners only, square at the bottom —
 * "4px rounded data-end, square at the baseline" from the dataviz skill's
 * mark spec. Plain `<rect rx>` rounds all four corners uniformly, which is
 * wrong specifically when a stacked bar has only one segment: that segment
 * is then both the data-end *and* the one touching the baseline, and a
 * plain `rx` would round its bottom too. Radius is clamped to the
 * segment's own size so a very small amount never produces overlapping arcs.
 */
function roundedTopRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, height / 2, width / 2));
  if (r === 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  return [
    `M${x + r},${y}`,
    `H${x + width - r}`,
    `A${r},${r} 0 0 1 ${x + width},${y + r}`,
    `V${y + height}`,
    `H${x}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');
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
  const svgHeight = TOP_ROOM + CHART_HEIGHT + AXIS_ROOM;
  const baseline = TOP_ROOM + CHART_HEIGHT;

  // Never a number on every point (the dataviz skill's own rule) — with up
  // to 18+ months of real bars, a total label on each one collides with its
  // neighbours long before it becomes readable. Two gridlines carry the
  // scale instead; the exact figure per month lives in the native tooltip.
  //
  // `value` is rounded to a whole cent — `axisMax * fraction` is only ever
  // fractional for a very small `axisMax` (1 or 5, `niceMax`'s two odd
  // steps), but "integer cents, never a float" has no exception for that.
  // Keyed by `fraction`, not `value`: two gridlines can legitimately round
  // to the same displayed cent at a small `axisMax`, and `fraction` (0.5,
  // 1) is unique by construction where the rounded `value` isn't.
  const gridlines = [0.5, 1].map((fraction) => ({
    fraction,
    y: baseline - CHART_HEIGHT * fraction,
    value: Math.round(axisMax * fraction),
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
        {gridlines.map(({ fraction, y, value }) => (
          <g key={fraction}>
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
            const fill = seg.muted ? 'var(--ink-muted)' : seg.color;
            const fillOpacity = seg.muted ? 0.55 : 1;
            return isTopmost ? (
              <path key={idx} d={roundedTopRectPath(x, top, BAR_WIDTH, seg.height, 4)} fill={fill} fillOpacity={fillOpacity} />
            ) : (
              <rect key={idx} x={x} y={top} width={BAR_WIDTH} height={seg.height} fill={fill} fillOpacity={fillOpacity} />
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
