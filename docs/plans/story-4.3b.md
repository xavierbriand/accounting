# Story 4.3b — Settlement Variance CLI (`explain` command)

## Context

Second half of the story-4.3 split (4.2 precedent): 4.3a shipped the settlement-variance domain — `src/core/settlement/` (LineItemKey, VarianceLine, FollowThrough, SettlementVariance, `explainSettlementVariance`), the `ContributionQuery` port + `SqliteContributionQuery`, and the `settlement:` config section (merged as `b5e3646`, PR #204). 4.3b wires it to the user: the month-scoped `explain` command (PRD:50-sanctioned verb) rendering the settle-ritual report — side-by-side variance table (cause · total Δ · per-partner Δ), follow-through line, Conversational-CFO headline — human + `--json`.

**Lane: Reduced** (CLI-only: `src/cli` + `program.ts` wiring; no Core/domain/schema changes). Phase 0: **No model impact — consumes 4.3a's signed model note verbatim (docs/domain/model-notes/story-4.3.md incl. its Phase-4 refinement); no new domain concepts, glossary terms, or invariants.** Phase 2: `sibling-overlap` only (plan-reviewer dropped per lane). **R4 applies** — `program.ts` is touched, so a composition-root subprocess test is required.

**Binding intake — [#208](https://github.com/xavierbriand/accounting/issues/208) (Phase-4 residue from 4.3a):**
1. Window/as-of composition helper shared with `status-command.ts`'s `nextCalendarMonth` (promote; never pass the same asOf to both `calculateForWindow` runs — silent-zero trap).
2. Widen the invariant-10 determinism property to the full `SettlementVariance` report.
3. Extract `SqliteContributionQuery`'s netting loop when touched.
4. **R8 mock diversity** applies — first structured-output surface for settlement variance (vary JSON fixture shapes: multi-partner, negative deltas, this-only/last-only lines).

Interview-decided output constraints (2026-07-07/08 discovery, carried from 4.3a's plan): side-by-side layout; two-part frame (movement + follow-through vs actual credits); line-item depth; blameless CFO voice (prd:172,189); every number reproducible (qa:27-28); `account`→`category` display remap where applicable; partner names never in stderr/logs.

### Maintenance sub-loop (§ 6.7) run 2026-07-08 pre-planning

- **Sibling work check:** open PRs: **none**. Open issues: #208 (this story's intake), #206/#207 (maint-24 test-smell triage — disjoint), #200/#198 (harness dod-check/lane-table — disjoint), #202/#203 (deferred explain siblings — by design). No overlap. ✓
- **Story-id uniqueness (R23):** no `story-4.3b` files on origin/main; no open PR branches. Free. ✓
- **Working tree clean:** fresh branch `story-4.3b` cut from origin/main (`b5e3646`). ✓
- **Open PRs / Dependabot:** none open. ✓
- **`npm audit --audit-level=high`:** 0 vulnerabilities. ✓
- **Standing debt cleared:** `npm run metrics:loop` regenerated docs/metrics/loop.csv (14 rows added; `loop-csv-stale` advisories now 0; lands with this story's prep commit). Note: maint-17 unresolvable (no merge commit) — pre-existing.
- **#156 closed this sub-loop** (user-approved): Epic-4 Phase-0 umbrella fulfilled by 4.0 → 4.3a; annotated with the shipped trail.
- **Proceed-to-planning:** PROCEED.

## Story

> As a **couple at the monthly settle ritual**, we want to run `accounting explain` and read — on one screen, in plain language — how this month's suggested transfer differs from last month's and how our actual transfers compared to the suggestion, so that the settle conversation starts from a shared, trustworthy picture.

## Domain model

No model impact — consumes the story-4.3 model note (signed 2026-07-08, incl. Phase-4 refinement) without additions. Presentation-only vocabulary (table headers, prose) uses existing glossary terms: Settlement variance, Variance line, Follow-through, Contribution, Safe transfer.

## Selected solution

Mirror the `status` command's proven architecture (orchestrator → report DTO → dual formatters), consuming 4.3a's domain unchanged:

- **`src/cli/utils/settle-window.ts`** *(new, #208 item 1)* — the single window/as-of composition: move `nextCalendarMonth(asOf)` here from `status-command.ts` (which re-exports or imports it — public behaviour unchanged) and add `previousSettleWindow(asOf): { asOfLast, from, to }` (`asOfLast = asOf minus one calendar month`, clamped for short months; window = the calendar month before this settle window). The two `calculateForWindow` runs always receive as-of dates one month apart — the silent-zero trap (fill-slot enumeration starts at `asOf`) is documented at the helper, and `tests/features/steps/settlement-variance.steps.ts` drops its duplicated `pad2`/`nextMonthWindow`/`oneMonthBefore` (steps.ts:95-115) in favour of this helper.
- **`src/cli/commands/explain-command.ts`** *(new)* — `runExplainCommand(opts, deps): Promise<number>` (status pattern: returns exit code; `program.ts` calls `process.exit`). Deps: `splitsService`, `buffersService`, `forecastService`-built `SafeTransferCalculator` ×1 instance (two `calculateForWindow` calls), `contributionQuery`, `settlementConfigured: boolean`, `clock: () => string`, `stdout`, `stderr`. Flow: validate `--as-of` (ISO regex, exit 2) → compose windows via the helper → run this-month + last-month calculations → `contributionQuery.contributionsInWindow(currency, lastFrom, lastTo)` → `explainSettlementVariance(...)` → assemble `ExplainReport` DTO → format. Tolerant sections mirror `StatusReport`: a failed calculation or missing `settlement:` config renders the rest of the report with an error + Suggested-action line (exit 0); only invalid input (2) or unrecoverable DB/currency errors (1) are non-zero. Month selection derives from `asOf` exactly like `status` (no `--month` flag — the ritual reads the upcoming window; an override is YAGNI until asked for).
- **`src/cli/commands/explain-report.ts`** *(new)* — the DTO both formatters consume: `{ asOf, thisWindow, lastWindow, variance: ok|error+suggestedAction, followThrough: ok|'not-configured'|error }` shapes.
- **`src/cli/commands/explain-formatter-human.ts`** *(new)* — CFO headline prose (blameless register, prd:189), the side-by-side variance table (`cli-table3`, `style:{head:[],border:[]}` idiom): Cause · Change · one column per partner; presence rendered as `new`/`gone`/delta; **Follow-through** section ("Last month you sent EUR X vs EUR Y suggested — Alex …, Sam …"); one footnote line ("movement computed with today's configuration"). Signed `Money` values via `.toString()`; sign-aware prose ("EUR 40.00 less" for negatives). `account`→`category` remap not needed (variance lines carry `category` already); partner names print to stdout only.
- **`src/cli/commands/explain-formatter-json.ts`** *(new)* — single documented JSON object: `{ asOf, thisWindow, lastWindow, variance: { lines: [{kind, category, description, presence, totalDelta, perPartnerDelta}], totalDelta, perPartnerDelta } | { error, suggestedAction }, followThrough: { perPartner: {partner: {suggested, actual, delta}}, totalSuggested, totalActual, totalDelta } | { notConfigured: true } | { error, suggestedAction } }`. Money via `.toString()`; Maps → objects explicitly (status-formatter-json precedent).
- **`src/cli/program.ts`** — register `explain` with `--as-of <YYYY-MM-DD>`, `--json`; composition root builds the same service stack as `status` + `new SqliteContributionQuery(db, config.settlement?.accounts ?? [])`; read-only command (no snapshot, `assertMigrated` fail-fast, status precedent).
- **#208 item 2** — widen the invariant-10 determinism property (Core test file) to serialize the full `SettlementVariance` (followThrough + perPartnerDelta), not just `lines`.
- **#208 item 3** (netting-loop extraction) — only if the adapter is otherwise touched (not expected); otherwise it stays with the issue for the next adapter-touching story. Honest deferral, not silent.

Alternatives set aside: `--month YYYY-MM` selector (YAGNI — ritual reads the upcoming window; asOf covers determinism); folding the report into `status --explain` (window-scoped bloat; PRD:50 names `explain`); a Core-side report DTO (presentation shape, belongs in CLI — status precedent).

## Production-code surface (R2)

- **New files:** `src/cli/utils/settle-window.ts`, `src/cli/commands/explain-command.ts`, `explain-report.ts`, `explain-formatter-human.ts`, `explain-formatter-json.ts`.
- **Changed:** `src/cli/program.ts` (new `explain` command registration + wiring — R4 trigger); `src/cli/commands/status-command.ts` (imports `nextCalendarMonth` from the shared helper; exported signature and behaviour unchanged); `tests/features/steps/settlement-variance.steps.ts` (drops duplicated window helpers — test-only); `tests/unit/core/settlement/settlement-variance-service.test.ts` (determinism property widened — test-only).
- **New output formats:** the `explain` human report and the `--json` document (shape documented above; Money via `Money.toString()`, satisfying the FR20/4.4 contract).
- **No changes** to Core production code, ports, config schema, or migrations. No new dependencies (R3 n/a).

## Gherkin acceptance scenarios

`tests/features/explain.feature`. Mechanisms per R7: scenarios 1–6 in-process (`runExplainCommand` with injected deps — real Core services over a real migrated temp SQLite via the 4.3a steps' `ensureDb` pattern, injected `clock`); scenario 7 subprocess (R4, `spawnCli`).

1. **Settle-ritual happy path, human output** — Given a config with splits/buffers/recurring + `settlement:` accounts for Alex and Sam, a ledger where last month has transfer credits and a bucket-draining expense, When I run `explain --as-of <date>`, Then stdout shows the CFO headline, a variance table containing a `both` cause with a signed delta, a `new`-this-month cause, and per-partner columns, and the follow-through line with both partners' actual vs suggested. *Fails if* orchestration miswires the two calculator runs or the prose contradicts the table's numbers. (in-process)
2. **`--json` full shape, R8-diverse** — same fixture plus a split-boundary month and a `gone` cause → JSON parses; variance lines carry all three presences; at least one negative `totalDelta`; per-partner maps object-shaped; follow-through numbers match the variance document's own arithmetic; nothing but JSON on stdout. *Fails if* the formatter drops a presence class, serializes Maps as `{}`, or emits prose to stdout. (in-process)
3. **`settlement:` not configured** — variance renders; follow-through section prints "not configured" + Suggested action naming `accounting.yaml settlement:`; exit 0. *Fails if* a missing optional config section aborts the whole report. (in-process)
4. **First month (empty last window)** — no last-month line items and zero credits → every cause `new`, follow-through shows actual EUR 0.00 per partner; exit 0. *Fails if* an empty prior window is treated as an error or divides against zero. (in-process)
5. **Invalid `--as-of`** — exit 2, path-cited message on stderr, nothing on stdout. *Fails if* input validation leaks past the boundary. (in-process)
6. **Calculation failure tolerated** — stale `targetDate` fixture → variance section shows the calc error + Suggested action (status's `buildSuggestedAction` pattern); follow-through still renders; exit 0. *Fails if* one failing section suppresses the report or flips the exit code. (in-process)
7. **Composition-root journey (R4)** — subprocess: `migrate` → `ingest` a fixture CSV containing settlement credits → `explain --as-of --json`; asserts exit 0 and the documented JSON shape end-to-end. *Fails if* `program.ts` wiring (adapter, config mapping, clock) is broken. (subprocess)

## Slice plan

R13 target 6–10 (4.2b CLI precedent ~8). Outside-in: `explain.feature` authored failing as the red half of slice 1 (uncounted, R28). Docs commits use R30 canonical subjects only.

| # | Slice (subjects carry `story-4.3b`; summary verbs R12) | Files |
|---|---|---|
| 1 | Acceptance feature (red) + shared settle-window helper (move `nextCalendarMonth`, add `previousSettleWindow`; steps dedup) | settle-window.ts, status-command.ts, 4.3a steps, unit tests, explain.feature (failing) |
| 2 | Explain orchestration — deps, validation, window composition, dual calc + contributions, report assembly, tolerant sections, exit codes | explain-command.ts, explain-report.ts + unit tests |
| 3 | Human formatter — CFO headline, side-by-side table, follow-through, footnote, sign-aware prose | explain-formatter-human.ts + unit tests |
| 4 | JSON formatter — documented shape, Money `.toString()`, Maps→objects (R8-diverse fixtures) | explain-formatter-json.ts + unit tests |
| 5 | `program.ts` wiring + R4 subprocess journey | program.ts, tests/integration/cli/explain-program.test.ts (or feature scenario 7 steps) |
| 6 | Determinism property widened to full report (#208 item 2) — R10 green-on-landing | settlement-variance-service.test.ts |
| 7 | Acceptance green — steps + index registration, scenarios 1–7 pass | steps + index.ts |
| 8 | `refactor(explain): <from Phase-4 review>` (R11 empty slot if unused) | — |

## Risks & deferred items

| Risk | Mitigation |
|---|---|
| Moving `nextCalendarMonth` breaks `status` | Exported signature unchanged; status unit + subprocess tests already cover it; slice 1 runs the full suite |
| `previousSettleWindow` month-end arithmetic (asOf on the 31st) | Deterministic clamp rule stated in the helper + unit-tested (Jan 31 → Feb 28/29 class of cases) |
| Same-asOf silent-zero regression | Helper is the only window source; scenario 1 fixture has a buffer top-up that vanishes if the trap recurs (4.3a scenario-3 lesson) |
| Empty/first-month division or zero-credit edge | Scenario 4 pins exit-0 honest output |
| Prose/number divergence (QA truthfulness) | Formatters render only `ExplainReport` numbers — no arithmetic in formatters; scenario 1 asserts prose quotes table figures |
| PII | Partner names stdout-only; error paths name paths/sections, never partners (4.3a scenario-8 precedent) |
| Netting-loop extraction (#208 item 3) not done here | Adapter not touched by this story; stays with #208, noted for the next adapter story |

## Verification plan

- `npm run lint && npm run build && npm test` green (test-smell rules at warning tier — no new errors introduced).
- R5 mapping: each scenario above → named test file/mechanism at Phase 4; R4 subprocess test present because `program.ts` changed.
- `--json` shape documented in the PR body (FR20 contract); R8 fixtures verified diverse (three presences, negative delta, multi-partner).
- Drift-scan + dod-check clean; envelope ≤ 10 slices (R28 counting); prep/retro commits use R30 canonical subjects.
- Read-only guarantee: no snapshot file created; DB untouched after `explain` (assert in integration test).

## Suggestion log

Phase-2 review 2026-07-08: `sibling-overlap` only (Reduced lane — plan-reviewer dropped).

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| SO-1 | No sibling overlap: zero open PRs; 42 open issues cross-checked against the file surface — #208 intake coverage confirmed (items 1/2/4 sliced, item 3 honestly deferred); #206/#207 hit-files disjoint; #186 is a future e2e tier blocked on #181, not this story's R4 test; #202/#203 are by-design future `explain` siblings; no claim on the verb or the settle-window helper | ACKNOWLEDGE | Proceed; no plan changes |

Phase-4 rows: see § Phase-4 review & dispositions below (11 consolidated rows, 5 FIX-NOW applied on-branch, 0 deferred needing new issues).

## Phase-4 review & dispositions (2026-07-08)

`code-reviewer` (15 findings) + `sibling-overlap` (1 coordinate item) in parallel — Reduced lane, no Mode-B leg (no model note; 4.3a's governs). Dispositions (Opus-owned):

| # | Finding | Disposition |
|---|---|---|
| CR-P1-1..5 (R6) | ~16 missing `// fails if` clauses across 5 unit-test files (feature file itself clean) | FIX-NOW — `2d7524f` adds every clause, naming the guarded production path |
| CR-P1-6 (R4) | Read-only assertion was a `.bak`-absence proxy; plan promised "DB untouched" | FIX-NOW — `2d7524f` adds before/after row-count equality on `transactions` + `transaction_entries`; step renamed "creates no snapshot and writes no rows" |
| CR-P2-1 | Raw `.amount` sign-reads in `signedDeltaPhrase` bypass Money for presentation | ACKNOWLEDGE — established idiom (`transaction.ts:71`, csv parser); 4.3a model note ruled sign-helpers implementation detail |
| CR-P3-1/2/3 | Verbatim duplication: `monthLabel` (~9 LOC), `buildSuggestedAction` (~8 LOC), `ISO_DATE` — each across 2 files | FIX-NOW — `071cf27` extracts `src/cli/utils/report-format.ts` + `report-command.ts`; both commands/formatters consume shared versions |
| CR-P3-4 | `explainSettlementVariance` invoked twice per happy-path run; synthetic empty-last-month fired always (implementer's "only when last-month fails" framing was narrower than the code) | FIX-NOW — `071cf27`: single domain call feeds both sections; synthetic fallback only when the real computation is unavailable. Review had verified both paths numerically identical |
| CR-P3-5 | `604f09b` consumed the reserved refactor slot | ACKNOWLEDGE — envelope closed at exactly 10/10 with the two fix slices |
| CR-P3-soft ×4 | 7-param signature; 48-LOC orchestrator; test-helper duplication (~70 LOC); ISO_DATE fold-in | ACKNOWLEDGE — noted for future growth; test-helper extraction is a candidate for a later `tests/_helpers` pass (maint-23 precedent) |
| SO-1 | PR #212 touched the same Core test file (non-overlapping region) | COORDINATE — resolved in-flight: #212 merged first; the mandated fetch+rebase rewrote cleanly (no conflicts), `--force-with-lease` push with lease guard |
| SO-2 | #208 mapping: items 1/2/4 shipped, 3 honestly deferred | ACKNOWLEDGE — #208 annotated at DoD; item 3 retargeted to the next adapter-touching story |

**Run provenance:** implementation executed by a `general-purpose` agent carrying the sonnet-implementer spec inline (CLAUDE.md § 6.3), model pinned Sonnet — the registered agent type failed at launch 3× (first stall harness-verified; two subsequent kills were coordinator misdiagnosis via symlink-size measurement — see retro). Tier separation preserved; fix round executed by resuming the same agent with context intact.

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [ ] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — sibling-overlap per Reduced lane, 2026-07-08): clean; triaged above.
- [x] Draft PR with template sections 1–6 filled: [#210](https://github.com/xavierbriand/accounting/pull/210).
