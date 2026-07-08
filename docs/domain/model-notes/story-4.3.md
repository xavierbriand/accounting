# Model note — story-4.3

## Domain question

When the couple settles each month, how does the system explain — item by item, partner by partner — why this month's safe transfer differs from last month's, and how well last month's actual transfers matched what was suggested?

## Terms

- **Used:** Safe transfer, Line item, Split rule, Validity window, Buffer, Buffer status, Recurring rule, Forecast occurrence, Partner, Transaction, Entry, Money, Ledger.
- **Added:**
  - **Settlement** — the monthly moment when both partners square up: each moves their share to the joint account, and the couple checks how last month actually went.
  - **Settlement variance** — the itemized story of why this month's suggested transfer differs from last month's, plus the follow-through check — every number backed by math either partner can recheck.
  - **Variance line** — one row of that story: a single cause (a bill, a buffer top-up) with its signed change, total and per partner. A cause is tracked month-to-month by the same name; a renamed rule honestly reads as one cause disappearing and a new one appearing.
  - **Follow-through** — the check on what actually happened: last month's real transfers into the joint account versus this month's suggestion — per partner when the ledger can tell who sent what, as totals otherwise.
  - **Contribution** — one partner's real transfer into the joint account, as recorded in the ledger. (The word the status prose already uses: "Alex contributes €960".)
- **Changed:** none.

## Model

A **read model** — nothing persisted, no identity, no writes. All value objects, one domain service, one new read port. New Core module folder: `src/core/settlement/`.

- `LineItemKey` — **value object**: the identity of a cause across months — `{ kind, category, description }` with equality and a total order (stable output). Exact match only; no fuzzy matching.
- `VarianceLine` — **value object**: `{ key, presence: 'both' | 'this-only' | 'last-only', totalDelta: Money, perPartnerDelta: ReadonlyMap<partner, Money> }`. Deltas are ordinary `Money` values that may be negative — no new signed-amount concept.
- `Movement` (part 1) — the list of variance lines from diffing two `SafeTransferCalculation`s: the existing `SafeTransferCalculator.calculateForWindow` run for this settlement window and for the previous one (as-of dates one month apart; defaults mirror `status`, exact flags at Phase 1). **No new calculation machinery** — same calculator, same real ledger, two windows. Last month's run uses today's configuration; this is the definition of movement, not a reconstruction claiming to be a photograph (presentation may add a one-line footnote; the model carries no caveat structure).
- `FollowThrough` (part 2) — **value object**: `{ perPartner?: ReadonlyMap<partner, { suggested: Money, actual: Money, delta: Money }>, totalSuggested, totalActual, totalDelta, attribution: 'per-partner' | 'totals-only' }`. Compares this month's suggestion against last month's **Contributions** (actual ledger credits). When any contribution in the window cannot be attributed to a partner, the whole section drops to `totals-only` — honest totals rather than wrong detail.
- `SettlementVariance` — **value object** (report root): `{ lines: readonly VarianceLine[], totalDelta, perPartnerDelta, followThrough }`.
- `SettlementVarianceService` — **domain service**: pure assembly `explain(thisMonth: SafeTransferCalculation, lastMonth: SafeTransferCalculation, contributions: readonly PartnerContribution[] | ContributionTotal): Result<SettlementVariance>`.
  *Refinement (Phase 1, 2026-07-08):* the contributions parameter is carried as a single `ContributionsInWindow` value (`attributed` + `unattributed` + `totalActual`) rather than the union above — same information, plus the `totalActual` that invariant 8 checks; the service ships as a plain exported function (`explainSettlementVariance`), the domain-service role unchanged. See [plans/story-4.3a.md](../../plans/story-4.3a.md) suggestion log P1-5/P3-7.
- `ContributionQuery` — **port** (`src/core/ports/contribution-query.ts`): returns last month's contributions from the ledger — credits on the settlement account(s) named in config, within the window. Attribution happens **at the ledger edge**: ingest tagging (autoTagRules) routes each partner's transfers to per-partner accounts; `accounting.yaml` gains a `settlement:` section mapping those accounts to partners (zod-validated at the boundary, like buffers). Bank wording never enters the domain — in glossary language these are Contributions.

Corrections need no special handling: contributions are net sums of ledger credits, so a correction's reversal + correcting entry net out by construction.

## Invariants

1. `sum(lines[].totalDelta) == thisMonth.totalRequired − lastMonth.totalRequired`, to the cent.
2. For each partner `p`: `sum(lines[].perPartnerDelta[p]) == thisMonth.perPartner[p] − lastMonth.perPartner[p]`, to the cent.
3. For each line: `sum over partners of perPartnerDelta == totalDelta`, to the cent.
4. Line keys partition the union of both months' line items: every item maps to exactly one line; no key appears twice (holds because a key occurs at most once per settlement window — property-tested).
5. `presence` is truthful: `both` ⇒ delta = this − last; `this-only` ⇒ delta = this month's amount; `last-only` ⇒ delta = −(last month's amount).
6. Per-line partner deltas use each month's own window-resolved split — never one ratio applied to a net delta (a split change surfaces as per-partner movement even when the line's total is unchanged).
7. Follow-through arithmetic: per partner `delta == suggested − actual`; totals are the sums of their parts; `attribution: 'per-partner'` only when every contribution in the window is attributed.
8. No contribution is dropped or double-counted: `totalActual` equals the ledger's net credit sum on the settlement account(s) for the window, regardless of attribution mode.
9. Cross-currency inputs ⇒ `Result.fail` (mismatch is a failure, not a warning).
10. Determinism: identical ledger + config + dates ⇒ identical report.

## Events

None. This story is purely explanatory — it records no happened-fact. (Config-change labelling of variance lines waits for `ConfigChanged`, story 4.5.)

## Rejected alternatives

- **Restated suggestion as a named concept** (structured reconstruction caveat) — user: the baseline that matters is last month's *actual credits*; movement is just the same math run twice, not a reconstruction claim.
- **Correction-counterfactual narration** (`explain <transactionId>`, event reader, counterfactual ledger decorator) — superseded by user interview: corrections are "mostly irrelevant" to the settle-table conversation; deferred to its own story.
- **Core attribution policy object** — attribution is already decided at ingest tagging; a Core rule would re-decide what the ledger edge knows. Config maps accounts → partners; done.
- **Fuzzy matching for renamed rules** — non-deterministic; exact keys with honest appear/disappear is the deterministic choice. (A stable rule id in config would give rename continuity — separate config-model change, not this story.)
- **First-class signed-delta concept** — ordinary possibly-negative `Money` suffices; small `Money` helpers (e.g. `isNegative`) are implementation detail, not vocabulary.
- **Persisting the report or emitting a "variance computed" event** — a read model derivable from the ledger; storage would invite drift.

## Sign-off

- User: Xavier Briand, 2026-07-08 — signed off as drafted (in-session), including the five glossary terms, the rename/caveat/Contribution decisions, and the context-map folder delta.
