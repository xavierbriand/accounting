# Story 4.3a — Settlement Variance (Core domain + ports + Infra adapters)

## Context

FR19 ("Human-Readable Explanations for why a transfer amount changed") reframed by a three-round user interview (2026-07-07/08): the real need is a **month-over-month settlement variance report** for the monthly settle ritual — an itemized, penny-perfect breakdown of why this month's suggested transfer differs from last month's, per cause and per partner, plus a follow-through check of last month's **actual transfers** (ledger credits on config-named settlement accounts) against the suggestion. Corrections are explicitly out of the conversation (they fold into balances); the epics.md story text is amended in this PR accordingly.

**Lane: Full** (new Core module `src/core/settlement/`, new Core port, config-schema extension). Phase 0 ran 2026-07-08: model note signed off, glossary/context-map deltas applied on this branch. **Split (R13/§ 6.6, 4.2a/4.2b precedent): 4.3a = Core + Infra (this plan) · 4.3b = CLI `explain` command + formatters + wiring + R4 subprocess test (planned when 4.3a ships).**

Session branch `claude/story-4-3-ed82de` used in place (story-ddd-1 precedent).

### Maintenance sub-loop (§ 6.7) run 2026-07-07 pre-planning

- **Sibling work check:** open PRs #197 (story-maint-21 csv-parse major bump, sibling session/branch), #192 (superseded by #197), #188 (CI-blocked per #196) — no overlap with 4.3. Adjacent issues #183 (>2-entry corrections) and #180 (atomic event recording) out of scope.
- **Story-id uniqueness (R23):** no `story-4.3*` files in docs/plans / docs/retrospectives / docs/status.d on origin/main; no open PR branch carries the id (covers 4.3a/4.3b). ✓
- **Working tree clean:** clean; branch even with origin/main at session start. ✓
- **Open issues:** reviewed (50); no stale closures required for this story.
- **Open PRs / Dependabot:** #192 handled by sibling story-maint-21; #188 blocked upstream (#196). No action here.
- **`npm audit --audit-level=high`:** 0 vulnerabilities. ✓
- **Proceed-to-planning:** PROCEED.

## Story

> As a **couple at the monthly settle ritual**, we want an itemized, penny-perfect breakdown of how this month's suggested transfer differs from last month's — per cause and per partner — plus how last month's actual transfers compared to the suggestion, so that both of us understand and trust the number without reconstructing it from memory.

4.3a delivers the domain: the report value objects, the assembly service, the contribution read port + SQLite adapter, and the `settlement:` config section. No CLI surface (4.3b).

## Domain model

Phase-0 model note: [docs/domain/model-notes/story-4.3.md](../domain/model-notes/story-4.3.md) (signed off 2026-07-08). Summary (R24):

- **Glossary terms added** (applied on this branch): Settlement, Settlement variance, Variance line, Follow-through, Contribution. **Used:** Safe transfer, Line item, Split rule, Validity window, Buffer, Recurring rule, Forecast occurrence, Partner, Transaction, Entry, Money, Ledger.
- **Read model** — value objects + one domain service + one read port; nothing persisted; **no domain events**.
- `LineItemKey` VO (`kind`,`category`,`description`; exact equality, total order) · `VarianceLine` VO (presence `both|this-only|last-only`, signed `Money` deltas total + per-partner) · `FollowThrough` VO (`per-partner` vs `totals-only` attribution) · `SettlementVariance` report VO · `SettlementVarianceService` domain service · `ContributionQuery` port.
- Movement = diff of two `SafeTransferCalculation`s — the **existing** `SafeTransferCalculator.calculateForWindow` run for this settlement window and the previous one. No new calculation machinery; last month's run uses today's configuration by definition of movement (no caveat structure in the model).
- Invariants 1–10 of the note (penny-perfect sums, partition, presence truthfulness, split fidelity, follow-through arithmetic, no-credit-dropped, currency mismatch fails, determinism) — each maps to a test below.
- Context map: `settlement/` added to the Liquidity & Settlement module (applied on this branch).

## Selected solution

New Core module `src/core/settlement/` + one port + one SQLite adapter + config extension:

- `src/core/settlement/line-item-key.ts` — `LineItemKey` VO: `of(item: LineItem): LineItemKey`; `equals`, `compare` (total order: kind, category, description), `toString` for stable output.
- `src/core/settlement/variance-line.ts` — `VarianceLine` VO as modeled.
- `src/core/settlement/follow-through.ts` — `FollowThrough` VO as modeled.
- `src/core/settlement/settlement-variance.ts` — `SettlementVariance` report VO.
- `src/core/settlement/settlement-variance-service.ts` — pure domain service, implemented as a plain exported function (no constructor dependencies to inject — the "service" is the domain role, not a class requirement; P3-7):
  ```ts
  export function explainSettlementVariance(
    thisMonth: SafeTransferCalculation,
    lastMonth: SafeTransferCalculation,
    contributions: ContributionsInWindow,
  ): Result<SettlementVariance>
  ```
  *Derivation delta from the signed model note (P1-5):* the note's `contributions: readonly PartnerContribution[] | ContributionTotal` union is refined to the single `ContributionsInWindow` object below — same information, plus `totalActual` needed by invariant 8. A dated refinement line is appended to the model note in this PR.
- **Window/as-of composition (P1-4 — binding for the acceptance steps and 4.3b's caller):** this window = `status` semantics (`asOf`, `from = first-of-next-month(asOf)`, `to = last-of-that-month`); last window = the calendar month before it, computed with `asOfLast = asOf minus one calendar month`. The as-of dates are **one month apart** (model note § Model). Passing this month's `asOf` to the last-month run is wrong — `buildBufferTopupLineItems` enumerates fill slots from `asOf` forward, so a window strictly before `asOf` yields zero buffer-topup lines and breaks the movement diff.
- **Follow-through baseline (P1-6):** `FollowThrough.suggested` is **this month's** suggestion (`thisMonth.perPartner` / `totalRequired`) set against last month's actual Contributions — the signed model-note/glossary reading ("In July you sent €2,100; August asks €2,340"). Last month's own suggestion is never presented (user decision, interview round 3).
- `src/core/ports/contribution-query.ts`:
  ```ts
  export interface PartnerContribution { readonly partner: string; readonly amount: Money; }
  export interface ContributionsInWindow {
    readonly attributed: readonly PartnerContribution[];
    readonly unattributed: Money;      // zero-Money when all credits map to a partner
    readonly totalActual: Money;       // net credits (credits − debits) on settlement accounts in window
  }
  export interface ContributionQuery {
    contributionsInWindow(currency: string, from: string, to: string): Result<ContributionsInWindow>;
  }
  ```
  Adapter constructed with the config's account→partner mapping (constructor DI at the composition root); the port speaks glossary language only.
- `src/infra/db/repositories/sqlite-contribution-query.ts` — net per-account sums (credits − debits, so corrections net out — invariant 8) over `transaction_entries JOIN transactions` for the mapped accounts, `occurred_at` in window; maps snake_case→camelCase at the boundary. **Money idiom (P2-5):** accumulate raw integer cents (SQL SUM / JS integer loop) and wrap once via `Money.fromCents` at the end — the `sqlite-buffer-ledger-query.ts` precedent; no intermediate `Money` arithmetic. **SQL parameterization (P1-10):** the variable-length account list binds through dynamically built placeholders (`IN (${accounts.map(() => '?').join(',')})`) with every value bound, never interpolated; N is household-scale (2–4 accounts), far below the 999-parameter cap.
- Config: `src/infra/config/config-schema.ts` gains optional `settlement:` section following the file's established array + `superRefine` convention (P1-8/P3-4): `{ accounts: Array<{ account: z.string().min(1), partner: z.string().min(1) }> }` with `findDuplicateIndices` rejecting duplicate `account` entries and a roster check that every `partner` exists in the splits windows (path-cited errors; partner names never echoed — PII rule; account labels are user-typed aliases, the same non-PII class as `buffers[].account` per security-checklist § carve-out, P2-3). `src/core/config/app-config.ts` gains the typed shape. Absent section = valid config (follow-through unavailability is a 4.3b CLI concern).

**Alternatives set aside** (full detail in the model note): restated-suggestion concept with structured caveat (user: baseline is actual credits); Core attribution-policy object (attribution decided at ingest tagging + config mapping); correction-counterfactual narration via `explain <transactionId>` (superseded by interview — deferred issue at Phase 2); fuzzy rename matching (non-deterministic); persisting the report (drift risk).

## Production-code surface (R2)

- **New types (Core):** `LineItemKey`, `VarianceLine`, `FollowThrough`, `SettlementVariance`, `explainSettlementVariance` (domain-service function), `ContributionQuery` + `PartnerContribution` + `ContributionsInWindow` (port).
- **New Infra:** `SqliteContributionQuery`.
- **Changed types (P3-5):** `AppConfig` gains an optional `settlement?: SettlementConfig` field (additive edit to a shipped interface; existing configs without the section remain valid). No other existing type, port, or service signature is touched — `SafeTransferCalculator` is consumed as-is.
- **Config format:** `accounting.yaml` gains optional `settlement:` section (documented in the config schema; absence is valid).
- **Output formats:** none in 4.3a (no CLI surface; `--json` shape lands in 4.3b).
- **Migrations:** none (read-only feature; `domain_events` untouched).

## Gherkin acceptance scenarios

Feature file `tests/features/settlement-variance.feature`. No CLI exists until 4.3b, so no subprocess scenario here (R4 lands in 4.3b with `program.ts`). **Mechanism per scenario (R7 — two distinct precedents, not one):**

- *In-process, in-memory* (the `safe-transfer.steps.ts` pattern — service interfaces only, no SQL/FS): scenarios 2 and 7 (pure calculation/assembly math). **Where date-scoped balances matter (scenarios 1, 3) the flat fake is insufficient** — `safe-transfer.steps.ts`'s `sumEntriesByAccount` fake ignores `asOfDate`; these two scenarios use an **asOf-aware fake** honoring the `occurred_at <= asOfDate` contract so the two windows see different balances.
- *In-process, real adapter + migrated temp SQLite* (the `correct.steps.ts` `makeTmpDb` pattern): scenarios 4, 5, 6 — their `fails if` clauses name `SqliteContributionQuery` behavior, so they must route through the real adapter and real rows, never a hand-built `ContributionsInWindow` (R6 honesty).
- *In-process, config-schema unit* (parse `parseRawConfig` directly): scenario 8.

1. **Matched, appeared, and disappeared causes** — Given rent recurs in both windows, insurance occurs only in this window, and a one-off top-up existed only in the last window, When the variance is explained, Then three lines carry presence `both`/`this-only`/`last-only` with deltas `this−last` / `+this` / `−last`. *Fails if* the `LineItemKey` diff or presence classification in `explainSettlementVariance` is broken. (in-process, in-memory with asOf-aware ledger fake)
2. **Penny-perfect totals across a split boundary** — Given the split changes 60/40 → 50/50 between the two windows, Then `sum(lines.totalDelta) == thisTotal − lastTotal` and each partner's line-delta column sums to their headline delta, with each month's own window-resolved split (a line whose gross is unchanged still shows per-partner movement). *Fails if* per-partner deltas are computed by applying one ratio to the net delta instead of diffing each month's allocations. (in-process, in-memory)
3. **Buffer top-up movement** — Given a buffer-account expense last month lowered the balance, Then the buffer's top-up line shows the increase like any other cause — using the plan's window/as-of composition (as-of dates one month apart). *Fails if* buffer-topup line items are excluded from the key diff, or both runs receive the same `asOf` (which yields zero topup lines for the past window). (in-process, in-memory with asOf-aware ledger fake)
4. **Follow-through, per-partner** — Given last month's window contains credits on both mapped settlement accounts, Then follow-through sets `suggested` from **this month's** calculation, shows each partner's actual vs suggested with exact deltas, and `attribution: 'per-partner'`. *Fails if* the adapter's account→partner mapping or the service's delta arithmetic is wrong, or the baseline uses the wrong month's suggestion. (in-process, real adapter + temp DB)
5. **Follow-through, totals-only fallback** — Given a credit on a settlement account **not** mapped to any partner, Then `attribution: 'totals-only'`, `totalActual` still includes every credit to the cent, and no per-partner detail is fabricated. *Fails if* unattributed credits are dropped (invariant 8) or per-partner mode is claimed with incomplete attribution (invariant 7). (in-process, real adapter + temp DB)
6. **Corrections net out of actuals** — Given a transfer credit last month was corrected (reversal + correcting entry on the settlement account), Then `totalActual` reflects the net amount. *Fails if* `SqliteContributionQuery` sums only credit-side entries instead of net credits−debits. (in-process, real adapter + temp DB)
7. **Currency mismatch fails** — Given a contribution in a different currency, Then the service returns `Result.fail`. *Fails if* cross-currency values are silently mixed (invariant 9). (in-process, in-memory)
8. **Config: settlement section validated** — Given a `settlement:` section naming a partner absent from the splits roster, When the config loads, Then validation fails with a path-cited message (no partner names echoed — PII rule); And a section listing the same `account` twice is rejected via `findDuplicateIndices` (P1-8). *Fails if* the zod schema accepts an unknown partner, a duplicate account, or leaks names. (in-process, config-schema unit)

Property tests (colocated with unit, `fast-check`): invariants 1–5 over generated window pairs (random line-item sets with unique keys per window, random splits) — the penny-perfect and partition guarantees — **plus invariant 10 (P1-9): identical inputs produce a deep-equal report with stable line ordering (the `LineItemKey` total order).**

## Slice plan

R13 target 6–10 slices; one slice = one behaviour (failing `test:` + `feat:` green pair = one slice, R28).

**TDD-rhythm ordering (P3-2):** outside-in — `settlement-variance.feature` is authored **failing at the start** (the red half of slice 1, uncounted per R28); each subsequent slice turns its scenarios green as the behaviour lands. Slice 8 is therefore the *final greening + steps-index registration* (a single wiring behaviour), not first authorship of the acceptance layer.

| # | Slice (commit subjects carry `story-4.3a`; summary verbs per R12) | Files |
|---|---|---|
| 1 | Acceptance feature (red) + `LineItemKey` — equality, total order, key-of-LineItem | `settlement-variance.feature` (failing), `line-item-key.ts` + unit tests |
| 2 | Movement diff → `VarianceLine[]` (presence + total deltas) | `variance-line.ts`, `settlement-variance-service.ts` + unit tests |
| 3 | Per-partner deltas with each month's own split (split-boundary fidelity) | service + unit tests |
| 4 | Property tests — penny-perfect, partition, and determinism invariants (R10 green-on-landing) | property test file |
| 5 | `FollowThrough` assembly + totals-only fallback + currency-mismatch fail | `follow-through.ts`, service + unit tests |
| 6 | Config `settlement:` section — zod array schema + duplicate/roster validation + `AppConfig` mapping | `config-schema.ts`, `app-config.ts` + unit tests |
| 7 | `SqliteContributionQuery` — net credits per mapped account (integration, real SQLite; correction-netting case) | port, adapter + integration test |
| 8 | Acceptance green — steps + steps-index registration; all 8 scenarios pass | steps file + `steps/index.ts` |
| 9 | `refactor(settlement): <from Phase-4 review>` (R11 empty slot if unused) | — |

**R13 bundling note (P3-1, the 4.2a-precedent justification):** slice 5 bundles scenarios 4/5/7 because they are one behaviour — `FollowThrough` assembly — exercised under three input shapes (complete attribution, incomplete attribution, bad currency); the unit slices, not the scenario count, carry the behaviour boundaries. Slice 8 bundles the acceptance greening because every underlying behaviour has its own slice (1–7); the acceptance layer adds wiring, not new behaviour. Commit subjects use summary verbs, never scenario enumerations (R12/P3-3).

Also in this PR (prep commit, outside the envelope per R16 precedent): this plan, the model note, glossary/context-map deltas, and the **epics.md story-4.3 amendment** (reframed text + a/b split).

## Risks & deferred items

| Risk | Mitigation |
|---|---|
| Line-key uniqueness within a window (invariant 4's premise) breaks for non-monthly windows | Property test generates monthly windows (the settle ritual's shape); the service returns `Result.fail` on duplicate keys rather than silently merging — honest failure if a future story widens windows |
| Renamed rule/bucket reads as disappear+appear | Signed-off model decision; deterministic honesty. Stable-rule-id continuity = possible future config story |
| Ingest tagging discipline: per-partner attribution only as good as autoTagRules routing | `totals-only` fallback is modeled and tested; config maps accounts explicitly; user confirmed transfer credits land in the ledger |
| Movement uses today's config for last month's window | Model-note definition of movement (signed off); one-line footnote possible at 4.3b presentation |
| PII: raw bank rows shown during discovery contain a real name | Never copied into repo artifacts; fixtures use Alex/Sam only (glossary rule) |
| Config-change labelling of causes not possible yet | Deferred to 4.5 (`ConfigChanged`) — [#203](https://github.com/xavierbriand/accounting/issues/203) |
| Per-transaction correction-story view (original FR19 reading) dropped from 4.3 | Deferred with the feasibility-verified counterfactual design attached — [#202](https://github.com/xavierbriand/accounting/issues/202) |

## Verification plan

- `npm run lint && npm run build && npm test` green locally and on CI.
- New property tests present for every financial invariant (DoD 3): invariants 1–5 via fast-check; 6–10 via targeted unit/integration tests mapped in the Gherkin table above (R5 mapping audit at Phase 4).
- 100% branch coverage on `src/core/` maintained (coverage gate).
- No migration ⇒ DoD 2 unaffected; `domain_events` untouched.
- Config docs: `settlement:` section documented; absent-section validity covered by a unit test.
- Drift-scan clean (`npx tsx harness/drift-scan/drift-scan.ts`); expect and accept #193's known Check-B `*(new)*`-path false positive on the plan-only commit (self-resolving once code lands).

## Suggestion log

Phase-2 review 2026-07-08: `plan-reviewer` (23 findings) + `sibling-overlap` (clean) in parallel.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| P1-1 | Mixed R7 mechanism citation (safe-transfer vs correct.steps are different precedents) | ADOPT | Gherkin preamble now assigns a mechanism per scenario |
| P1-2 | Scenarios 4–6 `fails if` name the adapter but could be satisfied by hand-built inputs | ADOPT | Scenarios 4–6 pinned to real adapter + migrated temp DB |
| P1-3 | Scenarios 1/3 need date-scoped balances; existing fake ignores `asOfDate` | ADOPT | asOf-aware ledger fake specified for scenarios 1/3 |
| P1-4 | "As-of dates one month apart" dropped from plan; same-asOf misread breaks topup lines | ADOPT | Binding window/as-of composition added to Selected solution; scenario 3 `fails if` extended |
| P1-5 | `explain()` third param diverges from signed model note without flagging | ADOPT | Derivation delta called out in plan; dated refinement line appended to the model note |
| P1-6 | Follow-through baseline (this month's suggestion) not restated in plan | ADOPT | Stated in Selected solution + scenario 4 |
| P1-7 | PRD FR19 wording not reconciled | REJECT | PRD:270's "higher heating bill" example is variance-flavored and already matches the reframe; only epics.md carried the correction flavor (amended in this PR). PRD:50 lists `explain` — consistent with 4.3b |
| P1-8 | `Record<account,partner>` diverges from array+`superRefine` convention; YAML duplicate-key hazard; no duplicate scenario | ADOPT | Schema switched to array + `findDuplicateIndices` + roster check; scenario 8 extended with the duplicate case |
| P1-9 | Invariant 10 (determinism) unmapped to any test | ADOPT | Added to property-test set (deep-equal report, stable ordering) |
| P1-10 | Dynamic `IN (...)` parameterization unspecified | ADOPT | Placeholder-building idiom specified; values always bound, never interpolated |
| P2-1 | Baseline ambiguity risks CFO-truthfulness | ADOPT | Resolved via P1-6 |
| P2-2 | Determinism QA invariant untested | ADOPT | Resolved via P1-9 |
| P2-3 | Settlement account labels vs PII carve-out unstated | ADOPT | Stated: user-typed aliases, same non-PII class as `buffers[].account`; partner names never echoed |
| P2-4 | R8 mock diversity N/A in 4.3a | ACKNOWLEDGE | No structured-output surface until 4.3b |
| P2-5 | Money-netting idiom not pinned | ADOPT | Adapter committed to integer-cents accumulation + single `Money.fromCents` (buffer-ledger-query precedent) |
| P3-1 | Slice bundling (5, 8) lacked 4.2a-style justification | ADOPT | R13 bundling note added to slice plan |
| P3-2 | Acceptance-first ordering inverted | ADOPT | Feature authored red in slice 1; slice 8 = final greening + registration |
| P3-3 | R12: slice label enumerated scenarios | ADOPT | Summary-verb commitment added; slice 8 relabeled |
| P3-4 | Config shape convention divergence | ADOPT | Resolved via P1-8 |
| P3-5 | R2 "Changed signatures: none" vs `AppConfig` edit | ADOPT | `AppConfig` addition moved under "Changed types" |
| P3-6 | `.min(1)` missing from schema sketch | ADOPT | Folded into P1-8 schema |
| P3-7 | Service class without constructor deps is ceremony | ADOPT | `explainSettlementVariance` as plain exported function; domain-service role unchanged |
| P3-8 | `Result.all` combinator opportunity | ACKNOWLEDGE | Implementation freedom for Sonnet; `buffer-state-service.ts:59` precedent noted |
| SO-1 | Sibling overlap: none (PR #201 disjoint; both planned deferred issues confirmed fresh) | ACKNOWLEDGE | No coordination needed. Hygiene note: #156 (Epic-4 Phase-0 umbrella) may be near-closeable — queued for the next maintenance sub-loop |

## DoR checklist

- [x] Phase 0 (Model): model note committed at [docs/domain/model-notes/story-4.3.md](../domain/model-notes/story-4.3.md), signed off 2026-07-08 (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel, 2026-07-08): 24 findings triaged above; deferred items → #202, #203.
- [x] Draft PR with template sections 1–6 filled: [#204](https://github.com/xavierbriand/accounting/pull/204).
