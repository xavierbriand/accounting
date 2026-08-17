export type StatusTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface StatusBadgeProps {
  readonly tone: StatusTone;
  readonly icon: string;
  readonly label: string;
}

const TONE_COLOR: Record<StatusTone, string> = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
  neutral: 'var(--ink-muted)',
};

/**
 * Icon + label, colour as a third channel never the only one — the
 * dataviz skill's own rule for status. `tone` picks a reserved status
 * token, never a categorical hue: these never mean "series 4."
 */
export function StatusBadge({ tone, icon, label }: StatusBadgeProps) {
  return (
    <span className="status-badge" style={{ color: TONE_COLOR[tone] }}>
      <span className="status-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </span>
  );
}
