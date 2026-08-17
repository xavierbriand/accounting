import type { Plan } from '@/numbers/plan.ts';
import { EnvelopeYearTable } from './EnvelopeYearTable.tsx';

/**
 * The reference for rebuilding next year's plan. Deliberately read-only —
 * `generateEnvelopeBlock` stays a script, run manually when rebuilding the
 * year; a button here would be this stateless app's first mutation.
 */
export function NextYearSection({ plan }: { readonly plan: Plan }) {
  return (
    <section className="card">
      <h2>04 · Envelopes for next year</h2>
      <p className="deck">
        Every envelope&apos;s prior-year actual against what&apos;s currently configured — the reference for
        rebuilding the plan. Run the generator to turn the completed year into a ready-to-paste block.
      </p>
      <EnvelopeYearTable consumption={plan.consumption} />
    </section>
  );
}
