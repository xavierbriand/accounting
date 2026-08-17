import { monthOf, type Day } from '@/core/dates.ts';
import { loadConfig, expandHome } from '@/config/load.ts';
import { loadLedger, type Ledger } from '@/ingest/load.ts';
import { computePlan, type Plan } from '@/numbers/plan.ts';
import { monthlySpendTimeline, type MonthlySpend } from '@/numbers/timeline.ts';
import { todayAsDay } from './_lib/today.ts';
import { newTrace, emitSpan } from './_lib/telemetry.ts';
import { InstalmentStrip } from './_components/InstalmentStrip.tsx';
import { SplitSection } from './_components/SplitSection.tsx';
import { ConsumptionSection } from './_components/ConsumptionSection.tsx';

// Never statically prerendered: `next.config.ts`'s own comment already says
// this app re-reads its inputs on every request because a stale render is
// worse than a slow one. Without this, `next build` tries to prerender "/"
// once at build time — executing this component with no SLUICE_CONFIG_DIR
// available and no exports to read — and fails the build for the wrong
// reason (a missing env var) while quietly implying the opposite of what
// this app actually promises.
export const dynamic = 'force-dynamic';

function ingestAttrs(ledger: Ledger): Record<string, string | number | boolean> {
  const r = ledger.reconciliation;
  return {
    transaction_count: ledger.transactions.length,
    source_count: ledger.sources.length,
    reconciled_count: r.reconciled,
    in_flight_count: r.inFlight,
    window_edge_count: r.windowEdge,
    mismatched_count: r.mismatched,
  };
}

/**
 * `monthlySpendTimeline` stops at the last month with a real `movement` in
 * it, which is not necessarily the current one — bank exports lag behind
 * today more often than not. Left alone, a household that hasn't spent yet
 * this month would see the chart silently end last month with no sign the
 * current one even exists. `monthlySpendTimeline` itself stays wall-clock
 * -free (`src/numbers/` never reads it); this is the edge extending its
 * result by exactly one point when needed, the same place `todayAsDay()`
 * itself lives.
 */
function withCurrentMonth(timeline: readonly MonthlySpend[], referenceDay: Day): readonly MonthlySpend[] {
  const currentMonth = monthOf(referenceDay);
  const last = timeline[timeline.length - 1];
  if (last !== undefined && last.month >= currentMonth) return timeline;
  return [...timeline, { month: currentMonth, total: 0 }];
}

function planAttrs(plan: Plan): Record<string, string | number | boolean> {
  const configuredCount = plan.consumption.filter((c) => c.envelope.kind === 'configured').length;
  const pastPaceCount = plan.check.envelopes.filter((e) => e.pastPace).length;
  return {
    envelope_count: plan.consumption.length,
    configured_envelope_count: configuredCount,
    warning_count: plan.warnings.length,
    past_pace_count: pastPaceCount,
    buffer_sufficient: plan.check.bufferSufficient,
  };
}

export default async function Page() {
  const directory = process.env.SLUICE_CONFIG_DIR;
  if (directory === undefined || directory === '') {
    throw new Error(
      'SLUICE_CONFIG_DIR is not set. Point it at the folder holding sluice.toml, ' +
        'e.g. SLUICE_CONFIG_DIR=~/sluice-private npm run dev.',
    );
  }

  const trace = newTrace();

  const config = await loadConfig(expandHome(directory));

  // Only two categorical colours exist for the page to draw with (see
  // app/globals.css's --series-1/--series-2) — refused here, loudly, rather
  // than letting a third person silently reuse a colour and misrepresent
  // whose money is whose further down the page.
  if (config.people.length > 2) {
    throw new Error(
      `"${directory}/sluice.toml" declares ${config.people.length} people, but this page only has colours ` +
        'for two (see app/globals.css). Add a third series colour before adding a third person.',
    );
  }

  const ledger = await loadLedger(config.exportsDirectory);
  emitSpan(trace, 'sluice.ingest.load', ingestAttrs(ledger));

  const plan = computePlan(config, ledger, todayAsDay());
  emitSpan(trace, 'sluice.numbers.compute_plan', planAttrs(plan));

  const timeline = withCurrentMonth(monthlySpendTimeline(ledger), plan.referenceDay);

  emitSpan(trace, 'sluice.page.report_displayed', { reference_day: plan.referenceDay });

  return (
    <main>
      <header className="page-header">
        <h1>sluice</h1>
        <span className="as-of">as of {plan.referenceDay}</span>
      </header>

      <InstalmentStrip config={config} plan={plan} />
      <SplitSection config={config} plan={plan} />
      <ConsumptionSection plan={plan} timeline={timeline} />
    </main>
  );
}
