/**
 * What a configured envelope claims, and what a configured transfer label
 * catches.
 *
 * These live with the config rather than with the code that spends them,
 * because they are the *meaning* of a config key. If the page re-implemented
 * substring matching, then a validator saying "this matcher matches nothing"
 * and a runtime that matched something could disagree, and the disagreement
 * would be invisible.
 */

/**
 * Modelled as a union rather than a matcher with an optional sub-category, for
 * the same reason `Source` is: code that narrows on `kind` needs no defensive
 * branch, and "the whole of this category" and "this one sub-category" are
 * different claims rather than one claim with a hole in it.
 */
export type EnvelopeMatcher =
  | { readonly kind: 'category'; readonly category: string }
  | { readonly kind: 'sub-category'; readonly category: string; readonly subCategory: string };

/**
 * Does this matcher claim this transaction's category pair?
 *
 * Exact, case-sensitive comparison. The bank's taxonomy is a fixed list the
 * user picks from at source and cannot extend, so there is no spelling variance
 * to be lenient about — and leniency here would silently merge two categories
 * the bank deliberately keeps apart, which is the mistake that made an annual
 * charge and a monthly one look like one lumpy envelope.
 */
export function matcherMatches(
  matcher: EnvelopeMatcher,
  category: string,
  subCategory: string,
): boolean {
  if (matcher.category !== category) return false;
  return matcher.kind === 'category' || matcher.subCategory === subCategory;
}

/**
 * Could these two matchers ever claim the same transaction?
 *
 * Used to refuse a config where two envelopes overlap. A category matcher
 * overlaps every sub-category matcher beneath it, which is the case worth
 * catching: "all of Groceries" and "Groceries / Supermarket" look unrelated in
 * the file and count the same spending twice.
 */
export function matchersOverlap(a: EnvelopeMatcher, b: EnvelopeMatcher): boolean {
  if (a.category !== b.category) return false;
  if (a.kind === 'category' || b.kind === 'category') return true;
  return a.subCategory === b.subCategory;
}

/**
 * Collapse runs of whitespace and trim, so a label copied out of a statement
 * with doubled spaces still matches one typed by hand.
 */
export function normaliseLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Does a configured transfer label catch this transaction's label?
 *
 * Case-insensitive substring, after collapsing whitespace. Deliberately *not*
 * accent-folded: a missed match leaves a contribution in the visible
 * unattributed band, where it can be seen and fixed, while a false match
 * silently credits money to the wrong person. Given the choice, this fails in
 * the direction that shows.
 *
 * An empty pattern is never a match. It is refused by the validator too, but a
 * substring test would otherwise claim every transfer in the ledger, and that
 * is too expensive a default to leave to one caller remembering to check.
 */
export function labelMatches(pattern: string, label: string): boolean {
  const needle = normaliseLabel(pattern).toLowerCase();
  if (needle === '') return false;
  return normaliseLabel(label).toLowerCase().includes(needle);
}
