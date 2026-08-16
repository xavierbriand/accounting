import { sum, type Cents } from '../core/money.ts';
import { labelMatches } from '../config/match.ts';
import { matcherMatches, type Config, type EnvelopeMatcher, type Person } from '../config/load.ts';
import type { Ledger } from '../ingest/load.ts';
import type { Transaction } from '../ingest/ledger.ts';
import { attributeContributions } from './funding.ts';

/**
 * The bank's own markers for a row nobody has filed under a real category
 * yet — measured against the real exports, not assumed. Nothing here is
 * blank: an uncategorised row carries one of these two categories, each
 * with its own `… - a categoriser` sub-categories.
 */
export const UNCATEGORISED_OUTGOING = "A categoriser - sortie d'argent";
export const UNCATEGORISED_INCOMING = "A categoriser - rentree d'argent";

/**
 * Runtime findings a static read of `sluice.toml` cannot see — every one a
 * warning, never thrown, the same non-throwing shape `ReconciliationReport`
 * already uses. A shape problem in the config is refused at parse time; an
 * audit finding here means the file parsed fine and still doesn't match
 * this household's real data.
 */
export type PlanWarning =
  /** A matcher shaped correctly but never firing against a real transaction — almost always the bank's wording moved. */
  | { readonly kind: 'matcher-matches-nothing'; readonly envelopeId: string; readonly matcher: EnvelopeMatcher }
  /** A transfer label that never catches a real inbound transfer. */
  | { readonly kind: 'label-matches-nothing'; readonly personId: string; readonly label: string }
  /**
   * One real transfer whose label happens to satisfy two people's patterns
   * at once — distinct from the config-time collision check, which only
   * catches two *declared* labels containing one another. Two otherwise
   * unrelated labels can both appear in one label no static check sees.
   */
  | { readonly kind: 'transfer-matches-two-people'; readonly transaction: Transaction; readonly people: readonly Person[] }
  | { readonly kind: 'uncategorised-rows'; readonly count: number; readonly total: Cents };

export function auditPlan(config: Config, ledger: Ledger): readonly PlanWarning[] {
  const warnings: PlanWarning[] = [];

  for (const envelope of config.envelopes) {
    for (const matcher of envelope.matches) {
      const fires = ledger.transactions.some(
        (t) => t.kind === 'movement' && matcherMatches(matcher, t.category, t.subCategory),
      );
      if (!fires) warnings.push({ kind: 'matcher-matches-nothing', envelopeId: envelope.id, matcher });
    }
  }

  for (const person of config.people) {
    for (const label of person.transferLabels) {
      const fires = ledger.transactions.some((t) => t.kind === 'transfer-in' && labelMatches(label, t.label));
      if (!fires) warnings.push({ kind: 'label-matches-nothing', personId: person.id, label });
    }
  }

  // Reuses attributeContributions rather than re-matching labels: the same
  // reason 3a itself uses peopleMatching() instead of reimplementing the
  // comparison — the meaning of a label match must never drift between the
  // two places that check it.
  for (const c of attributeContributions(config, ledger)) {
    if (c.people.length >= 2) {
      warnings.push({ kind: 'transfer-matches-two-people', transaction: c.transaction, people: c.people });
    }
  }

  const uncategorised = ledger.transactions.filter(
    (t) =>
      t.kind === 'movement' &&
      (t.category === UNCATEGORISED_OUTGOING || t.category === UNCATEGORISED_INCOMING),
  );
  if (uncategorised.length > 0) {
    warnings.push({
      kind: 'uncategorised-rows',
      count: uncategorised.length,
      total: sum(uncategorised.map((t) => t.amount)),
    });
  }

  return warnings;
}
