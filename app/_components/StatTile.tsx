import { formatEur, type Cents } from '@/core/money.ts';

/**
 * A headline number, not a column: proportional figures, not `.num`
 * (tabular) — `tabular-nums` gives every digit the width of a `0`, which
 * looks loose at display sizes and is reserved for columns that must align
 * vertically (the dataviz skill's own rule for stat-tile values).
 */
export interface StatTileProps {
  readonly label: string;
  readonly value: Cents;
  /** A CSS colour, e.g. `'var(--series-1)'` — identity for the label, never for the value text itself. */
  readonly seriesColor?: string;
  readonly sub?: string;
}

export function StatTile({ label, value, seriesColor, sub }: StatTileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">
        {seriesColor !== undefined && <span className="swatch" style={{ background: seriesColor }} />}
        {label}
      </span>
      <span className="stat-tile-value">{formatEur(value)}</span>
      {sub !== undefined && <span className="stat-tile-sub">{sub}</span>}
    </div>
  );
}
