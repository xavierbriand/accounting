# Story h2 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/125  **Closed:** 2026-05-11  **Closes:** [#120](https://github.com/xavierbriand/accounting/issues/120)

Follow-up to [story-h1](./story-h1.md). Closes the documented chicken-and-egg compromise: `harness/drift-scan/drift-scan.ts` `table-only` findings (a CLAUDE.md § 8 row with no originating retro reference) are now hard — they contribute to exit 1, restoring Check A's bidirectional invariant. The compromise was unblocked the moment story-h1's retro (mentioning R21) merged to main; every R-tag R1..R21 now has an originating retro.

## Keep

- **Tracking #120 from story-h1's retro paid off.** Filing the cleanup ticket at the moment the compromise was made (rather than reopening the conversation later) meant the precondition was checkable from a single source: the issue's acceptance criteria. The maintenance sub-loop step "is there an existing issue that already plans this work?" returned a clean yes/no.
- **R13 lower-bound (4 body slices) was the right call.** No fake refactor slot, no padding. The story is a 1-LOC behaviour change with a test and a README cleanup; conflating slices would have broken the failing→green pairing. Plan § Slice plan justified the bound explicitly so the Phase-2 reviewer didn't have to re-derive it.
- **Plan-reviewer's "test insertion position" finding caught a real ordering hazard.** The new test mutates `CLAUDE.md`; the existing `--json` test mutates a retro file *and* asserts on the same scanner run's stderr. If the new test had been inserted before the `--json` test, the new orphan-row injection would have polluted the `--json` test's assertions. Phase 2 spotted this from the plan alone, before Sonnet wrote a single line. The kind of finding that's cheap to catch on paper and expensive once it ships.
- **Second `afterEach` keeps cleanup hooks per-slice.** Folding the CLAUDE.md restore into the existing `TEMP_RETRO_FILES` hook would have touched code outside slice 2's intended diff. Two hooks is cleaner — vitest runs them all, the responsibilities don't overlap, and `git blame` keeps each story's cleanup attributable.
- **Snapshot-then-mutate pattern stayed exception-safe without try/catch noise.** The `CLAUDE_MD_SNAPSHOT` variable is set on the line *before* the mutating write. If the write throws, the snapshot is captured; if the assertion throws, the afterEach still restores. No `try`/`finally` boilerplate, and the "no bare catches" rule in `engineering-standards.md` is honoured.

## Change (what to do differently next time)

- **R21 self-test arrived as an after-thought rather than a deliberate piece of the original story-h1 plan.** The bidirectional invariant of Check A was conceptually the spec from day one; story-h1 shipped only one direction (retro→table). Better future pattern: when a tool implements a "check X *and* Y" specification, sketch the test for both directions at planning time, even if one of them has a chicken-and-egg dependency. The plan would then surface the chicken-and-egg explicitly as a *deferred test*, not a *deferred behaviour*. Cost would have been one Gherkin scenario and a `// TODO: enable in cleanup PR` in story-h1; benefit would have been story-h2 reducing from a 5-commit PR to a 2-commit PR (uncomment + delete filter).
- **The retro-only test's `// fails if` comment carried a stale identifier (`hardFindings`) post-merge of c3d83b0.** Phase 4 caught it; the same comment was *not* identified in plan § 3a (which scoped the cleanup to the clean-repo test only). **Lesson:** when a story deletes a named construct, plan § 3a-style cleanup audits should `grep -rn '<construct>'` across the test tree at planning time, not just inspect comments adjacent to assertions being modified. One grep, no follow-up Phase-4 nit. Worth considering as a soft hardening of R6 — "when deleting a production identifier, audit *all* `// fails if` comments that mention it."
- **The "(Gherkin scenario N)" labeling convention isn't documented anywhere.** Five of six pre-existing tests carry it; the new test arrived without one because the plan didn't ask for one. Phase 4 caught the inconsistency. **Lesson:** if a convention is followed consistently enough that an inconsistency reads as a bug, write it down. Either: codify in `.claude/agents/sonnet-implementer.md` § Process under TDD rhythm, or accept it as soft taste and let Phase 4 catch the misses. The drift-scan tool itself doesn't enforce test-comment shape, so codification is the cheaper option.
- **"slice 10" reference in the clean-repo test description aged.** It was historically accurate when written; it's still accurate today, but a reader unfamiliar with story-h1's slice numbering has to dig into git history to decode it. Test descriptions that reference internal story slice numbers are durable for the author and brittle for everyone else. **Lesson:** prefer descriptive test names ("clean repo passes once R20 and R21 are codified") over slice-numbered ones; let the commit log carry the "when" pin. Not a rule, but a soft taste worth keeping in mind on the next story that adds an integration test.

## Code-review findings (Phase 4)

`code-reviewer` sub-agent on 2026-05-11 — 3 findings (0 P1, 0 P2, 3 P3 soft). Tally: 2 fix-now · 1 acknowledged · 0 defer-issue · 0 rejected.

| Phase | Finding | Resolution | Where |
| --- | --- | --- | --- |
| P3 (soft) | Retro-only test's `fails if` comment names deleted identifier `hardFindings`. | fix-now | Phase-4 refactor (`2cecd75`) — renamed to `non-empty findings list`. |
| P3 (soft) | New `table-only` test missing `(Gherkin scenario N: …)` label for parity. | fix-now | Phase-4 refactor (`2cecd75`) — added the new scenario label; tightened `fails if` phrasing. |
| P3 (soft) | Clean-repo test description retains `(slice 10)` — story-h1 internal slice reference. | acknowledged | Historically accurate; renaming would lose the pin. |

## Try

- **New rule candidate:** when a story deletes a named production identifier (function, variable, type), the implementation slice should include a `grep -rn <name>` of the test tree and update any `// fails if` comment that references the deleted name. Mark as `R22 *(pending)*` until a second story has data on whether it generalises. Pairs with story-h1's "R22 *(pending)*" candidate on the over-import trap — both are R6/R12-adjacent rule-of-thumb refinements that need 2-3 stories of corroboration before codification.
- **New maintenance-sub-loop step candidate:** "If this story closes a `*(pending)*` or chicken-and-egg compromise from a prior retro, has the precondition been verified on `origin/main`?" Story-h2 implicitly did this (the plan's maintenance-sub-loop ran `git fetch origin` and the plan's § Context narrated the precondition), but the checklist didn't ask for it. Worth a single line in `docs/templates/maintenance-sub-loop.md` after the next 1-2 cleanup-PR follow-ups happen — too early to codify on this story's data alone.
- **Curriculum delta candidate.** This PR exists *because* drift-scan exists — without it, the R21 chicken-and-egg compromise would have shipped silently and the soft regime would have persisted indefinitely. Worth a sentence in [docs/learning/harness-engineering.md § Module 1](../learning/harness-engineering.md) under "what Module 1 buys you": tooling that flags a compromise the moment it ships also makes the cleanup cheap *and* legible. Not in scope for this PR; flag for the next Module-1 documentation pass (likely when Module 2 starts).

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** CLAUDE.md is untouched. R21's rule statement still accurately describes drift-scan's behaviour ("enforces … consistency at write/CI time"); the *implementation* of that rule is what tightened, not the rule itself. `tsx harness/drift-scan/drift-scan.ts` exits 0 on `origin/main + this PR` (verified locally on the branch tip).
- [x] If yes, reconciled in this PR? N/A — no contradictions.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Delete `hardFindings` filter in `drift-scan.ts` | `harness/drift-scan/drift-scan.ts` | done (slice 3, commit `c3d83b0`) |
| New subprocess test: orphan § 8 row exits 1 | `harness/drift-scan/tests/drift-scan.integration.test.ts` | done (slice 2, commit `829f837`) |
| Clean-repo test: rewrite block comment + add `not.toContain('table-only:')` | `harness/drift-scan/tests/drift-scan.integration.test.ts` | done (slice 3, commit `c3d83b0`) |
| Drop soft/hard distinction from drift-scan README | `harness/drift-scan/README.md` | done (slice 4, commit `4511fd1`) |
| Phase-4 fix-now (retro-only test comment + Gherkin label on new test) | `harness/drift-scan/tests/drift-scan.integration.test.ts` | done (Phase-4 refactor, commit `2cecd75`) |
| Close [#120](https://github.com/xavierbriand/accounting/issues/120) | PR body `Closes #120` | done (auto-close on merge) |
| Status fragment | `docs/status.d/2026-05-11-story-h2.md` | done (slice 5, this commit) |
| Rule-of-thumb: `grep -rn <name>` audit when deleting a production identifier | next process-touching PR — mark `R22 *(pending)*` until data | open |
| Maintenance-sub-loop step: verify precondition on `origin/main` for cleanup PRs | future retro observation | open |
| Curriculum delta: Module 1 narrative on "tool that flags its own compromises" | next Module-1 doc pass | open |
