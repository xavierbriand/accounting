import type { AutoTagRule } from './auto-tag-rules.js';
import type { AccountConfig } from '@core/config/app-config.js';

// Matches French bank descriptions like:
//   "PAIEMENT CARTE X1234 AVRIL"
//   "PAIEMENT CARTE 1234"
// Capture group 1 is the 4-digit suffix.
export const CARD_SETTLEMENT_RE = /^PAIEMENT\s+CARTE\s+X?(\d{4})(?:\s.*)?$/i;

/**
 * Returns true if the description is already handled by either the auto-tag
 * rule set or the card-settlement pattern with a configured card account —
 * i.e. the description would NOT appear as a low-confidence prompt during ingest.
 *
 * Card-settlement matching mirrors tryCardSettlement's account-presence check:
 * only returns true when exactly one card account is configured with the
 * matching cardSuffix. An unconfigured suffix falls back to tagDescription
 * (low confidence) in ingest, so categorize must surface it.
 *
 * Shared by TransactionBuilder and categorize-scanner so both consumers stay
 * in lockstep (P1-E round-trip property).
 */
export function isAlreadyClassified(
  description: string,
  rules: readonly AutoTagRule[],
  accounts: readonly AccountConfig[],
): boolean {
  if (rules.some((r) => r.pattern.test(description))) return true;

  const cardMatch = CARD_SETTLEMENT_RE.exec(description);
  if (!cardMatch) return false;

  const suffix = cardMatch[1];
  const matchingCards = accounts.filter((a) => a.type === 'card' && a.cardSuffix === suffix);
  return matchingCards.length === 1;
}
