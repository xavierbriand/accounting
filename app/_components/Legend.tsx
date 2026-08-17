/**
 * Always present for two or more series — the dependable identity channel,
 * per the dataviz skill: never make the reader rely on colour-matching a
 * chart to memory alone.
 */
export interface LegendItem {
  readonly label: string;
  /** A CSS colour, e.g. `'var(--series-1)'`. Ignored when `muted` is set. */
  readonly color?: string;
  /** The "unattributed" treatment — a muted grey, not a categorical hue: see ContributionsChart. */
  readonly muted?: boolean;
}

export function Legend({ items }: { readonly items: readonly LegendItem[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span className="legend-key" key={item.label}>
          <span
            className={item.muted === true ? 'swatch swatch-muted' : 'swatch'}
            style={item.muted === true ? undefined : { background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
