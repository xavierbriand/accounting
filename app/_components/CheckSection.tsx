import { dayOfMonth, formatMonthShort, monthOf, yearOf, type Day } from '@/core/dates.ts';
import { formatEur } from '@/core/money.ts';
import type { Config, EnvelopeMatcher } from '@/config/load.ts';
import type { Plan } from '@/numbers/plan.ts';
import type { PlanWarning } from '@/numbers/audit.ts';
import { StatTile } from './StatTile.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { EnvelopeCheckTable } from './EnvelopeCheckTable.tsx';

function describeMatcher(matcher: EnvelopeMatcher): string {
  return matcher.kind === 'category' ? `"${matcher.category}"` : `"${matcher.category} / ${matcher.subCategory}"`;
}

/** "24 Jan 2026" — every other date-like figure on the page is formatted for humans; a findings sentence shouldn't be the one place a raw ISO string shows through. */
function formatDay(day: Day): string {
  return `${dayOfMonth(day)} ${formatMonthShort(monthOf(day))} ${yearOf(day)}`;
}

function describeWarning(warning: PlanWarning): string {
  switch (warning.kind) {
    case 'matcher-matches-nothing':
      return `Envelope "${warning.envelopeId}": the matcher for ${describeMatcher(warning.matcher)} never fires against a real transaction.`;
    case 'label-matches-nothing':
      return `${warning.personId}: transfer label "${warning.label}" never matches a real inbound transfer.`;
    case 'transfer-matches-two-people':
      return `Transfer "${warning.transaction.label}" (${formatEur(warning.transaction.amount)}, ${formatDay(warning.transaction.occurredOn)}) matches ${warning.people.map((p) => p.name).join(' and ')} at once — not credited to anyone.`;
    case 'uncategorised-rows':
      // `warning.total` sums both uncategorised-outgoing (negative) and
      // uncategorised-incoming (positive) rows — a real net, not a
      // magnitude. "Totalling X" would read as "X of unfiled spend," which
      // overstates or understates the true unfiled volume whenever both
      // kinds are present and partly offset. "Net" says plainly that the
      // two can cancel.
      return `${warning.count} row${warning.count === 1 ? '' : 's'} still uncategorised — net ${formatEur(warning.total)} (outgoing and incoming both count toward this figure).`;
  }
}

/**
 * Plan vs. reality: drift as a signed figure (no invented good/bad
 * threshold — the domain layer has none), envelopes past pace and their
 * goal status as a table, buffer sufficiency as a status badge, and
 * whatever the audit found as a plain findings list.
 */
export function CheckSection({ config, plan }: { readonly config: Config; readonly plan: Plan }) {
  const { check, warnings } = plan;

  return (
    <section className="card">
      <h2>03 · The check</h2>
      <p className="deck">
        The trailing year&apos;s actual spend against what&apos;s planned, and the buffer that has to absorb the
        gap.
      </p>

      <div className="check-summary">
        <StatTile
          label="Drift — trailing year vs. planned"
          value={check.drift}
          signed
          sub={`${formatEur(check.trailingYearActual)} actual · ${formatEur(check.plannedTotal)} planned`}
        />
        <div className="buffer-status">
          <span className="stat-tile-label">Buffer</span>
          {check.bufferSufficient ? (
            <StatusBadge tone="good" icon="✓" label="Sufficient" />
          ) : (
            <StatusBadge tone="critical" icon="!" label="Insufficient" />
          )}
          <span className="stat-tile-sub">
            {formatEur(config.bufferTarget)} target · worst month observed {formatEur(check.worstObservedMonth)}
          </span>
        </div>
      </div>

      <EnvelopeCheckTable envelopes={check.envelopes} />

      {warnings.length > 0 && (
        <div className="findings">
          <h3>Findings</h3>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{describeWarning(w)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
