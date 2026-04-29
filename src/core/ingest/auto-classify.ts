import type { AutoTagRule } from './auto-tag-rules.js';

// Matches French bank descriptions like:
//   "PAIEMENT CARTE X1234 AVRIL"
//   "PAIEMENT CARTE 1234"
// Capture group 1 is the 4-digit suffix.
export const CARD_SETTLEMENT_RE = /^PAIEMENT\s+CARTE\s+X?(\d{4})(?:\s.*)?$/i;

/**
 * Returns true if the description is already handled by either the auto-tag
 * rule set or the card-settlement pattern — i.e. the description would NOT
 * appear as a low-confidence prompt during ingest.
 *
 * Shared by TransactionBuilder and categorize-scanner so both consumers stay
 * in lockstep (P1-E round-trip property).
 */
export function isAlreadyClassified(
  description: string,
  rules: readonly AutoTagRule[],
): boolean {
  if (rules.some((r) => r.pattern.test(description))) return true;
  return CARD_SETTLEMENT_RE.test(description);
}
