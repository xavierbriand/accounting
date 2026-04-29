# Story D retrospective

**PR:** [accounting#102](https://github.com/xavierbriand/accounting/pull/102)  **Closed:** 2026-04-29 (pending merge)

## Keep

- **Auto-mode end-to-end run worked.** User invoked `/loop`-equivalent autonomy after plan approval; the harness ran phases 2 → 4 in one continuous arc with three sub-agent hand-offs (`plan-reviewer`, `sonnet-implementer` ×2, `code-reviewer`). Net 13 commits over ~30 min wall clock. The phase-gating discipline held: no agent skipped a phase or invoked another out of order. **This is the cleanest auto-mode multi-phase run on this repo to date.** Worth keeping as a baseline next time auto-mode is used on a feature story.
- **The plan-reviewer's P1-E finding (round-trip determinism gap) was load-bearing.** The agent constructed the precise counter-example — `"PAIEMENT CARTE X9999 AVRIL"` with no configured card account — that broke the determinism note. Without it, the bug would have shipped silently because the unit tests covered only the configured-card path. This is a textbook plan-reviewer save: a finding that requires reading two files (`auto-classify.ts` + `transaction-builder.ts`) and reasoning about a gap between them. The agent did. The Phase-4 code-reviewer then confirmed the gap survived into implementation (Sonnet's first cut copied `tryCardSettlement`'s regex but not its `matchingCards.length === 1` check), and the fix landed in commit `a36bebe`. Two-pass review caught both the planning gap and the implementation gap.
- **The R14 over-count (8 slices vs 5–7 target) was justified inline and not abused.** The plan acknowledged the over-count at authoring time, named both reasons (P1-E refactor unavoidable + test-then-feat split mandated by P3-J), and proposed no second slice expansion at refactor time. Phase-4 added 5 more commits (4 fixes + 1 test addition), so the total ended at 13 — but the *story* slice count stayed at 8 because Phase-4 fixes are not story slices. Accepting the over-count up front is cleaner than retrofitting an apology in retro.
- **The "follow-up issue at story kickoff" pattern (Option B = #103) prevented suggestion-log abuse.** Filing #103 *before* the plan-reviewer ran meant the deferred Option B was already linked when the suggestion log filled. The plan-reviewer didn't have to debate "is Option B in scope?" — it could focus on Option A's correctness. Repeat this on the next story that has a known sibling-fix decision: file the deferred issue at Phase 1 exit, before Phase 2 starts.
- **Reusing Story C's `appendAutoTagRules` verbatim was the right architectural call.** Zero new YAML schema, zero new mtime-race code, zero new atomic-rename plumbing. The full reuse audit fit on five lines of the plan and matched reality on the diff (R3: zero new dependencies). When a story's "new orchestration over existing pieces" can be enumerated in five lines, plan-reviewer noise drops sharply.

## Change

- **Sonnet over-implemented slice 5 (made `--non-interactive` and `--json` paths green-on-landing for slice 6).** This collapsed the planned slice 7 to an empty `feat:` commit (`d7f8e38`). Code-reviewer flagged R11 (empty-commit carve-out) as applicable but noted R11 canonically covers `refactor:` not `feat:`. Two issues here:
  - The slice 5 → slice 7 plan boundary was not load-bearing; merging them cost nothing semantically. **Try:** when a plan has a "minimal slice N + minimal slice M" split for the same orchestrator, mark whether the split is for *separability of behaviour* (must split) or *separability of review* (split if Sonnet judges helpful). Phrase the slice description so Sonnet has explicit license to merge.
  - The empty `feat:` commit type is a real R-rule mismatch. R11 says `refactor:` for empty commits with justification; an empty `feat:` is a category error. **Try:** add a CLAUDE.md § 6.4 carve-out for "if a planned `feat:` slice lands as empty due to upstream-slice over-implementation, retitle as `chore(workflow): empty slice — TDD rhythm note`" or similar — the body justification is fine, the type prefix should not lie.
- **The Phase-4 review surfaced a real bug (P1-E partial) that Sonnet's slice-3 unit tests missed.** The scanner unit tests covered the autotag-rule filter and the card-settlement *regex* but not the card-settlement *account-presence* branch. Phase-4 caught it; Phase-2 had already named the lockstep guarantee but not the account-presence sub-condition. **Try:** when extracting a shared predicate (auto-classify pattern), the Phase-2 review must demand a unit test for *every* branch in the original predicate — not just every input pattern. Codify as a sub-rule: "predicate-extraction stories require one unit test per branch of the original predicate."
- **The `runCategorizeCommand` LOC issue (161 LOC → 140 LOC after Phase-4 extraction) didn't fully resolve.** Sonnet extracted `runCategorizeSummary` (22 LOC) but left the prompt loop inline — `rememberedMap`, `categoriesSoFar`, `promptedGroups`, `rulesSkippedByUser`, `aborted` all share state across the loop. Code-reviewer accepted 140 LOC as "structural — defer to next story" but the engineering-standards.md target is ~50 LOC. **Try:** when a Phase-4 extraction lands at a "good enough but not target" LOC count, file the followup as a maint issue *before* writing the retrospective so the action item stays tracked. (Filed below: see Action items table.)
- **Sonnet didn't collapse the double `isAlreadyClassified` call** (asked in the refactor brief). The reason given — "would update all 13 scanner-test call sites, exceeding the Phase-4 20-LOC touch budget" — is reasonable, but the budget heuristic ("don't touch more than 20 LOC of existing tests during a Phase-4 refactor") is implicit, not codified. **Try:** make the touch budget explicit in the refactor brief next time. Either "≤ 30 LOC of existing tests touched" or "no widening of public function signatures" — pick one and pin it. Saves the back-and-forth.

## Try

- **New refactor-brief sub-rule: explicit "touch budget" for Phase-4 refactors.** When Opus hands a fix-now bundle to Sonnet, name a ceiling: "≤ N LOC of existing test changes" or "no public signature widening." Closes the implicit-budget gap that left the double-`isAlreadyClassified` call deferred.
- **New Phase-2 sub-rule: "predicate-extraction stories require a unit test per branch of the original predicate."** Story D extracted `tagDescription` + card-settlement into `auto-classify.ts`. The card-settlement branch had two sub-conditions (regex match AND `matchingCards.length === 1`); only one was tested. Codify so future plan-reviewers demand the per-branch coverage.
- **New process-touching-PR rule R20: empty `feat:` slices retitle to `chore(workflow): empty slice — TDD rhythm note <reason>`.** R11 covers `refactor:` only; we now have one empty `feat:` (slice 7, `d7f8e38`) on the record. Codify the rename rule before another empty `feat:` ships.
- **Carry-over from Story C retro (forwarded — still open):**
  - "Promote pinned-with-fallback decisions to R2 surface" — not triggered by Story D (no pinned-with-fallback decision in this plan).
  - "Red-commit hygiene: verify-test-fails-for-right-reason" — partially applied here (slice 6 of Phase-4 was a real test-failing commit verified at land time), but the rule itself is still uncodified. Forward to next process-touching PR.
  - "Code-reviewer sub-rule: scan previous N stories' R4 claims for end-to-end gaps" — applied implicitly here (Story D's R4 test asserts `.db` file absence, which would have caught a Story-A latent if the same paths existed). Not triggered as a finding. Forward.
  - "R16 codification (R15-extension to zero-code stories)" — not triggered (Story D ships behaviour). Forward.
- **Specific to Story D — collapse the double `isAlreadyClassified` call.** Track as a maint issue (see Action items). Approach: widen `scanForUnmatched` return to `{ groups, alreadyMatchedCount }`. Single pass.
- **Specific to Story D — extract `runPromptLoop` from `runCategorizeCommand`.** Reduce from 140 → ~60 LOC. Track as a maint issue (see Action items).

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** No CLAUDE.md or `docs/*` file was edited in this PR (the plan adds a new doc at `docs/plans/story-D.md`, but that's plan content, not a rule). The empty-`feat:` slice + new sub-rules from Try are forwarded to the next process-touching PR — no R-row added in this story.
- [x] If yes, reconciled in this PR? N/A.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `auto-classify.ts` shared predicate (P1-E fix) — extract `tagDescription` + card-settlement regex from `transaction-builder.ts` | `src/core/ingest/auto-classify.ts` | done (slice 1) |
| `categorize-scanner.ts` — pure scanner with `scanForUnmatched(descriptions, rules, accounts, opts)` | `src/core/ingest/categorize-scanner.ts` | done (slice 3 + Phase-4 widening) |
| `runCategorizeCommand` orchestrator + `program.ts` subcommand wiring | `src/cli/commands/categorize-command.ts` + `src/cli/program.ts` | done (slice 5) |
| Gherkin scenarios 1–6 + property test + R4 subprocess + unit tests | `tests/features/categorize.feature`, `tests/features/steps/categorize.steps.ts`, `tests/integration/cli/categorize-end-to-end-wiring.test.ts`, `tests/unit/core/ingest/categorize-scanner.test.ts`, `tests/unit/cli/commands/categorize-command.test.ts` | done (slices 2, 4, 6) |
| `accounting.example.yaml` note that both `categorize` and `ingest` write `autoTagRules` | `accounting.example.yaml` | done (slice 8) |
| Phase-4 fix: feature-scenario `the prompter is never invoked` honesty step | `tests/features/categorize.feature` + step def | done (commit `4a82255`) |
| Phase-4 fix: `isAlreadyClassified` widened to `(description, rules, accounts)` — mirrors `tryCardSettlement`'s account-presence check | `src/core/ingest/auto-classify.ts` + `categorize-scanner.ts` + `categorize-command.ts` + tests | done (commits `6243284` + `a36bebe`) |
| Phase-4 refactor: extract `runCategorizeSummary` (~22 LOC), remove 9 `// Step N:` comments | `src/cli/commands/categorize-command.ts` | done (commit `38406bb`) |
| Phase-4 fix: `--limit` truncation unit test | `tests/unit/cli/commands/categorize-command.test.ts` | done (commit `fe45b4b`) |
| Option B (re-apply rules mid-`ingest`) tracked as separate workstream | issue [#103](https://github.com/xavierbriand/accounting/issues/103) | done (filed at Phase-1 exit) |
| `appendAutoTagRules` should return `{ added, skippedAsDuplicate }` so JSON `rulesSkippedAsDuplicate` is accurate | issue [#104](https://github.com/xavierbriand/accounting/issues/104) | open |
| `categorize` multi-file / glob input | issue [#105](https://github.com/xavierbriand/accounting/issues/105) | open |
| Token-similarity grouping ranker (v2) | issue [#106](https://github.com/xavierbriand/accounting/issues/106) | open |
| Shared base type for `IngestCommandDeps` / `CategorizeCommandDeps` | issue [#107](https://github.com/xavierbriand/accounting/issues/107) | open |
| Collapse double `isAlreadyClassified` call (widen scanner return type) | issue [#109](https://github.com/xavierbriand/accounting/issues/109) | open |
| Extract `runPromptLoop` to reduce `runCategorizeCommand` 140 → ~60 LOC | issue [#110](https://github.com/xavierbriand/accounting/issues/110) | open |
| `docs/status.d/2026-04-29-story-D.md` log fragment | this PR | done (Phase 5) |
| New Phase-2 sub-rule: "predicate-extraction requires per-branch unit test" | next process-touching PR | open |
| New refactor-brief sub-rule: explicit Phase-4 touch budget | next process-touching PR | open |
| New R20: empty `feat:` slices retitle to `chore(workflow): empty slice` | next process-touching PR | open |
| Forwarded carry-overs from Stories A/B/C (3 process rules + R16 codification) | next process-touching PR | open |
