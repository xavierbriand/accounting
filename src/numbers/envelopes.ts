import { sum, type Cents } from '../core/money.ts';
import { envelopeIndex, matcherMatches, type Config, type EnvelopeConfig } from '../config/load.ts';
import type { Ledger } from '../ingest/load.ts';
import type { Transaction } from '../ingest/ledger.ts';

/**
 * Every `(category, subCategory)` pair the ledger actually holds spending
 * under, resolved to whichever configured envelope claims it, or a derived
 * one synthesised on the spot.
 *
 * `envelopeIndex()` (`config/load.ts`) already answers "which *configured*
 * envelope claims this pair, or none" — this is the whole picture: nothing
 * money moved through in `movement` transactions is left unaccounted for,
 * the way section 02 needs.
 *
 * One entry per *envelope*, not per matcher: a configured envelope with
 * several matchers (an insurance premium filed under two sub-categories) is
 * still one entry, because `estimate`/`goal` are set against the whole
 * envelope, not against one matcher of it.
 */
export type ResolvedEnvelope =
  | { readonly kind: 'configured'; readonly config: EnvelopeConfig }
  | { readonly kind: 'derived'; readonly id: string; readonly category: string; readonly subCategory: string };

/**
 * The id every consumer identifies this envelope by — a configured
 * envelope's own `id`, or a derived one's `category / subCategory` pair.
 * Exported so `app/_components/` reads an envelope's id in exactly one
 * place, rather than reimplementing the same two-branch check per
 * component (the same "no third copy" reasoning `funding.ts`'s `compare()`
 * is exported for).
 */
export function envelopeId(envelope: ResolvedEnvelope): string {
  return envelope.kind === 'configured' ? envelope.config.id : envelope.id;
}

/**
 * The name a reader sees — a configured envelope's own `name`, or a
 * derived one's id, which is the only name it has (its `category /
 * subCategory` pair, already human-readable). Exported for the same
 * reason `envelopeId` is.
 */
export function envelopeName(envelope: ResolvedEnvelope): string {
  return envelope.kind === 'configured' ? envelope.config.name : envelope.id;
}

/**
 * Sorted by id — every list `src/numbers/` returns commits to an order, the
 * same discipline `reconcile.ts`'s `checks.sort` and `mergeLedger`'s final
 * sort already apply. `(category, subCategory)` is not a usable sort key
 * here: a configured envelope with several matchers has several pairs, not
 * one.
 */
export function resolveEnvelopes(config: Config, ledger: Ledger): readonly ResolvedEnvelope[] {
  const index = envelopeIndex(config);
  const configured: ResolvedEnvelope[] = config.envelopes.map((c) => ({
    kind: 'configured' as const,
    config: c,
  }));

  // A category and a sub-category, kept as two map levels rather than one
  // key joined from both — the same reason `envelopeIndex()` in
  // `config/schema.ts` is two levels rather than one. A joined string is not
  // safe here: several of the bank's real category names carry spaces
  // ("Loisirs et vacances"), so a delimiter chosen without checking against
  // them risks two genuinely different pairs colliding onto one key, and one
  // of the two silently vanishing from the result.
  const derivedPairs = new Map<string, Set<string>>();
  for (const t of ledger.transactions) {
    if (t.kind !== 'movement') continue;
    if (index.find(t.category, t.subCategory) !== null) continue;
    let subCategories = derivedPairs.get(t.category);
    if (subCategories === undefined) {
      subCategories = new Set();
      derivedPairs.set(t.category, subCategories);
    }
    subCategories.add(t.subCategory);
  }

  const derived: ResolvedEnvelope[] = [...derivedPairs.entries()].flatMap(([category, subCategories]) =>
    [...subCategories].map((subCategory) => ({
      kind: 'derived' as const,
      id: `${category} / ${subCategory}`,
      category,
      subCategory,
    })),
  );

  // Plain code-point comparison, not localeCompare(): the latter's ordering
  // depends on the runtime's default locale, which is not guaranteed to
  // agree between two machines (or two Node builds) — precisely the
  // opposite of the deterministic order this function promises.
  //
  // Mutation testing flags six survivors on the comparator below. Three are
  // killed by the sort-order test in envelopes.test.ts. The other three —
  // pinning the inner ternary (`idA > idB ? 1 : 0`) to `true`, to `false`,
  // and widening `>` to `>=` — are equivalent, for the same reason as the
  // comparator in `core/money.ts`'s `allocate`: `.sort()` only ever invokes
  // this comparator with `a` being the later-positioned element in the
  // pre-sort array (verified directly: over 2.1M calls per mutant, `a`'s
  // original index exceeded `b`'s every time). The inner ternary only
  // executes once the outer `idA < idB` has already ruled out `a` sorting
  // first, so all three mutants can only turn a `0` (tie) into a `1`
  // (explicitly "a after b") or a `1` into a `0` — never into a negative
  // value. Since `a` is always the later-positioned element already, "tied,
  // stable-sort keeps it after" and "explicitly place it after" are the same
  // outcome, so the final permutation never differs (verified: 0 sign-class
  // disagreements across the same 2.1M calls).
  return [...configured, ...derived].sort((a, b) => {
    const idA = envelopeId(a);
    const idB = envelopeId(b);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}

/**
 * Which resolved envelope claims this pair, or `null` if none does.
 *
 * `null` is the ordinary case only for a caller probing pairs the *config*
 * declares (the audit, checking whether a matcher fires against anything
 * real) — for anything iterating the ledger itself, `resolveEnvelopes`
 * already guarantees every pair it produced has a match, so `null` there is
 * a programming error, not a real case.
 */
export function envelopeFor(
  resolved: readonly ResolvedEnvelope[],
  category: string,
  subCategory: string,
): ResolvedEnvelope | null {
  for (const envelope of resolved) {
    if (envelope.kind === 'derived') {
      if (envelope.category === category && envelope.subCategory === subCategory) return envelope;
      continue;
    }
    if (envelope.config.matches.some((m) => matcherMatches(m, category, subCategory))) return envelope;
  }
  return null;
}

/**
 * Every `movement` transaction this resolved envelope claims.
 *
 * Shared by `seasonal.ts` and `consumption.ts` so "does this transaction
 * belong to this envelope" is answered in exactly one place — a configured
 * envelope's several matchers only need testing once, here, rather than
 * copied into every module that needs an envelope's transactions.
 */
export function transactionsFor(envelope: ResolvedEnvelope, ledger: Ledger): readonly Transaction[] {
  return ledger.transactions.filter((t) => {
    if (t.kind !== 'movement') return false;
    if (envelope.kind === 'derived') {
      return t.category === envelope.category && t.subCategory === envelope.subCategory;
    }
    return envelope.config.matches.some((m) => matcherMatches(m, t.category, t.subCategory));
  });
}

/**
 * Net outflow across `transactions` — spending net of refunds, floored at
 * zero rather than reported as negative.
 *
 * `movement` amounts are negative for spending, positive for a refund
 * against it. Netting them (not just summing the negative side) is what
 * makes a partial return read as "spent less that month" rather than being
 * ignored outright; flooring at zero is what stops a month where refunds
 * outweigh purchases from reading as spending in reverse — nothing under
 * `src/numbers/` reports a negative amount "spent."
 */
export function outflow(transactions: readonly Transaction[]): Cents {
  return Math.max(0, -sum(transactions.map((t) => t.amount)));
}
