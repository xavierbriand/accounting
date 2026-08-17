import { formatEur } from '@/core/money.ts';
import type { EnvelopeCheck, GoalStatus } from '@/numbers/checks.ts';
import { StatusBadge, type StatusTone } from './StatusBadge.tsx';

export interface EnvelopeCheckTableProps {
  readonly envelopes: readonly EnvelopeCheck[];
}

function idOf(envelope: EnvelopeCheck['envelope']): string {
  return envelope.kind === 'configured' ? envelope.config.id : envelope.id;
}

function nameOf(envelope: EnvelopeCheck['envelope']): string {
  return envelope.kind === 'configured' ? envelope.config.name : envelope.id;
}

function goalBadge(status: GoalStatus): { readonly tone: StatusTone; readonly icon: string; readonly label: string } {
  switch (status) {
    case 'on-track':
      return { tone: 'good', icon: '✓', label: 'On track' };
    case 'at-risk':
      return { tone: 'serious', icon: '!', label: 'At risk' };
    case 'too-early':
      return { tone: 'neutral', icon: '…', label: 'Too early' };
    case 'no-goal':
      return { tone: 'neutral', icon: '–', label: 'No goal' };
  }
}

/** At-risk first, then merely over pace, then everyone else — the same "highest-signal row first" rule 02's meters already use. */
function rank(c: EnvelopeCheck): number {
  if (c.goalStatus === 'at-risk') return 0;
  if (c.pastPace) return 1;
  return 2;
}

/**
 * `> ~7 classes` → table, per the dataviz skill's own form heuristic — a
 * real household clears that with room to spare (54 envelopes, one real
 * test run so far).
 */
export function EnvelopeCheckTable({ envelopes }: EnvelopeCheckTableProps) {
  const rows = [...envelopes].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="table-scroll">
      <table className="checks">
        <thead>
          <tr>
            <th>Envelope</th>
            <th>Pace</th>
            <th>Goal</th>
            <th className="amount">Projected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const badge = goalBadge(c.goalStatus);
            return (
              <tr key={idOf(c.envelope)}>
                <td>{nameOf(c.envelope)}</td>
                <td className={c.pastPace ? 'pace-over' : 'pace-ok'}>{c.pastPace ? 'Over' : '—'}</td>
                <td>
                  <StatusBadge tone={badge.tone} icon={badge.icon} label={badge.label} />
                </td>
                <td className="amount num">{c.projectedFullYear !== null ? formatEur(c.projectedFullYear) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
