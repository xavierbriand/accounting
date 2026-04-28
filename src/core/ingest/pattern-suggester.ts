// Noise tokens for French banking descriptions.
// These are legal-form suffixes, payment-method prefixes, and generic labels
// extracted from real BPCE description shapes. Exported for property tests.
export const NOISE_TOKENS: readonly string[] = [
  'sarl', 'sas', 'sasu', 'sa', 'eurl', 'scop', 'scea', 'sci', 'gie', 'asbl', 'snc', 'scs',
  'cb', 'vir', 'prlv', 'carte', 'dab', 'retrait', 'paiement', 'facture', 'achat',
  'date', 'ref', 'num', 'montant', 'libelle', 'operation', 'type', 'code',
  'france', 'paris',
];

/**
 * Returns the longest alphabetic token (≥4 chars, not a noise token) from the
 * description, lowercased. Tokenises on /[\W_]+/. Tie-break: first occurrence.
 * Returns null if no eligible token exists.
 */
export function suggestPattern(description: string): string | null {
  const tokens = description.toLowerCase().split(/[\W_]+/);

  let best: string | null = null;

  for (const token of tokens) {
    if (!/^[a-z]+$/.test(token)) continue;
    if (token.length < 4) continue;
    if (NOISE_TOKENS.includes(token)) continue;
    if (best === null || token.length > best.length) {
      best = token;
    }
  }

  return best;
}
