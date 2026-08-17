import { loadConfig, expandHome } from '@/config/load.ts';
import { loadLedger, type Ledger } from '@/ingest/load.ts';
import { computePlan, type Plan } from '@/numbers/plan.ts';
import { todayAsDay } from './_lib/today.ts';
import { newTrace, emitSpan } from './_lib/telemetry.ts';
import { InstalmentStrip } from './_components/InstalmentStrip.tsx';
import { SplitSection } from './_components/SplitSection.tsx';

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
  const ledger = await loadLedger(config.exportsDirectory);
  emitSpan(trace, 'sluice.ingest.load', ingestAttrs(ledger));

  const plan = computePlan(config, ledger, todayAsDay());
  emitSpan(trace, 'sluice.numbers.compute_plan', planAttrs(plan));

  emitSpan(trace, 'sluice.page.report_displayed', { reference_day: plan.referenceDay });

  return (
    <main>
      <header className="page-header">
        <h1>sluice</h1>
        <span className="as-of">as of {plan.referenceDay}</span>
      </header>

      <InstalmentStrip config={config} plan={plan} />
      <SplitSection config={config} plan={plan} />
    </main>
  );
}
