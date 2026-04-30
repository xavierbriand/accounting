# Story maint-17 retrospective

**PR:** [#116](https://github.com/xavierbriand/accounting/pull/116)  **Closed:** 2026-04-30

## Keep

- **Reproduce-then-fix discipline.** Phase 1 confirmed the diagnosis empirically (4 collision groups in the reporter's CSV) before drafting the plan. The decision tree on user-facing semantics (silent dedup vs hard-fail vs tie-breaker) was offered explicitly, not assumed. Worth keeping for any bug whose fix has multiple defensible behaviours.
- **In-batch sequence tie-breaker.** Backward-compatible by construction (1st-occurrence canonical unchanged), no schema/migration, six lines of production code. Limitation around cross-batch reorder is documented inline. The simplicity-vs-determinism trade-off is good.
- **Phase-4 substantive refactor commit.** Fixed three real findings (R6 wording, US duplication, vacuous-truth property return) plus the scenario consolidation. R11 empty-refactor would have been the lazy choice.

## Change

- **Privacy-rule scope was applied too narrowly.** The first plan draft contained a date-and-amount table from the reporter's real CSV plus the CSV filename (which embeds a bank account number). The user flagged it; redaction extended to *all* transaction-private data (vendor, account, sums, calendar dates, account-id-bearing filenames), not just merchant strings as before. **Action:** existing memory entry [feedback_no_private_details_in_plans.md](../../.claude/projects/-Users-xavier-briand-Projects-accounting/memory/feedback_no_private_details_in_plans.md) updated this session; promote to a new R20 in CLAUDE.md § 8 alongside the existing § 3 PII rule.
- **Plan-reviewer rejection of P1-1 was based on a false premise.** Phase-2 review of the suggestion log rejected "add `fails if` to the new acceptance scenario" with the reasoning "no precedent in `tests/features/*.feature`." `tests/features/ingest.feature` actually carries `# fails if:` annotations on every prior scenario (lines 11, 23, 33, 46, 56, 67). Sonnet authored the annotations correctly despite the rejected ruling; Phase-4 surfaced the integrity gap. The suggestion log entry was corrected in the refactor commit. **Cause:** I asserted "no precedent" without grepping for it. **Lesson:** before rejecting a finding on `no precedent / not a convention here` grounds, run the grep that would falsify the claim.
- **Plan's acceptance Gherkin specified an unreachable assertion.** The plan said `When I run ingest with "--non-interactive --json"` then `stderr contains "transaction(s) committed"`, but `--non-interactive` skips both confirmation **and** `saveBatch` — that line is never emitted. Sonnet caught this at implementation time and pivoted to "first commit interactively, then re-ingest" but ended up with two structurally-identical scenarios. Phase-4 collapsed them into one. **Lesson:** when a plan dictates a CLI step + assertion combo, walk the actual `runNonInteractive` / `runInteractiveLoop` paths to confirm the assertion can fire under the bug.
- **Slice-plan drift.** The cross-batch limitation comment landed in the `feat:` commit (#3) instead of the planned `refactor:` commit (#5). Result: the refactor commit was substantive on other axes, but the original sequencing wasn't followed. Not a defect, but suggests slice-plan should explicitly say "documentation comment lands inline with the code it explains" rather than carving comments off into a separate slice.

## Try

- **Plan/scenario walk before locking the plan.** Add to the Phase-2 reviewer's mandate (or to the maintenance sub-loop): for any scenario in the plan that names a CLI flag combo, the reviewer must trace at least one production code path under that flag combo and confirm the asserted output is reachable. This would have caught the `--non-interactive` issue before sonnet had to deviate.
- **Suggestion-log "evidence pointer" field.** When Phase-2 rejects on convention/precedent grounds, require a one-line evidence pointer ("grep result: 0 hits in `tests/features/*.feature`") rather than a bare assertion. Falsifiable claims would have flagged my P1-1 mistake immediately.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between [CLAUDE.md](../../CLAUDE.md) and any `docs/` file? **No.** No § 8 rule changes; § 3 PII rule still applies (broader interpretation, not new wording).
- [x] If yes, reconciled in this PR? N/A.

The privacy-rule scope expansion (memory + retro lesson) is a candidate for a new R20 in § 8 — flagged as a Try, deferred to a future maintenance story so this PR stays bug-fix-scoped.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Suggestion log P1-1 corrected | In-PR (`docs/plans/story-maint-17.md`, refactor commit) | done |
| US constant deduplicated (export from canonicalize.ts) | In-PR (`src/core/ingest/canonicalize.ts`, refactor commit) | done |
| Test 2b `fails if` names production path (R6) | In-PR (`tests/unit/core/ingest/idempotency-service.test.ts`, refactor commit) | done |
| Property test vacuous-truth return strengthened | In-PR (refactor commit) | done |
| Two redundant in-batch-dups acceptance scenarios merged into one | In-PR (`tests/features/ingest.feature`, refactor commit) | done |
| Memory: privacy rule broadened to sums/dates/filenames | In-session (memory file updated) | done |
| Test infra: `writeStubYaml` extras + scoped `Given a fresh migrated DB` | Issue [#117](https://github.com/xavierbriand/accounting/issues/117) | open |
| Promote privacy-scope rule to a CLAUDE.md § 8 R20 entry | Future maintenance story | open |
| Add "scenario assertion reachability" to Phase-2 reviewer mandate | Future maintenance story | open |
| Add "evidence pointer" field to suggestion-log rejection | Future maintenance story | open |
