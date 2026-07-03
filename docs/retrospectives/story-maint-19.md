# Story maint-19 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/158  **Closes:** [#150](https://github.com/xavierbriand/accounting/issues/150)

Sandboxes `harness/metrics/tests/loop-metrics.integration.test.ts` and `harness/metrics/tests/usage-reader.integration.test.ts`'s story-mode test in a temp git repo, following `harness/dod-check/tests/dod-check.integration.test.ts`'s existing pattern. Both entrypoints (`loop-metrics.ts`, `usage-reader.ts`) resolve output paths from `process.cwd()`; the old tests invoked them with `cwd: REPO_ROOT`, so every `npm run test:harness` run modified the real, tracked `docs/metrics/loop.csv` and created an untracked `docs/metrics/story-h4.md`. No production code changed — pointing `cwd` at a temp repo was sufficient.

## Keep

- **Confirming the bug (and its exact shape) before writing a line of fixture code paid off.** Running the pre-change suite and checking `git status --porcelain -- docs/metrics` showed both symptoms directly — a modified `loop.csv` and an untracked `story-h4.md` — and traced the second one to a *different* test file (`usage-reader.integration.test.ts`) than the one named in issue #150's title. Reading `loop-metrics.ts`/`usage-reader.ts` before touching tests also surfaced the `origin/main` (branch-scoped `git log`) vs `--all` (unscoped) asymmetry between the two entrypoints early, which fed directly into a Phase 2 finding rather than a Phase 4 one.
- **A literal red/green split, even for a "just point cwd at tmpDir" change, caught a real fixture bug.** Committing C1 (fixture assertions, still pointed at `REPO_ROOT`) as genuinely failing, then flipping to `tmpDir` for C2, surfaced that tagging the retro-fixture commit's subject with `[story-aa]` made it double-count in `countStoryCommits('aa')` — a mistake that would have silently produced a wrong `diff_loc`/`commits` value if the test had been written cwd-correct from the start and merely "happened to pass."
- **Deferring the cross-module helper extraction (dod-check ↔ metrics) to #119, rather than bundling it here, kept the story small.** #150 itself named #119 as the adjacent candidate; both plan-reviewer and code-reviewer independently confirmed the local `harness/metrics/tests/_helpers/temp-git-repo.ts` was the right scope boundary for a single-issue fix.

## Change

- **A stale CI check on the PR (from an earlier, partially-pushed commit) briefly looked like a real P1 finding.** The code-reviewer agent flagged PR #158's `build` check as failing on `harness/drift-scan/tests/drift-scan.integration.test.ts` — a file this story never touched. Investigation showed the failure was on commit `32d1ac5` (the plan/DoR-link prep commits), pushed before C1–C5 existed; C1–C5 were sitting local-only at review time. Once pushed, the concern was moot. Worth internalizing: before treating a `gh pr checks` result as a finding, confirm it matches current `HEAD`, not a stale push.
- **The C5 refactor commit's actual diff (removing one unused import) didn't match its own slice-plan description** ("Local cleanup only (naming, shared `afterEach` cleanup list)"). Caught by the code-reviewer's Phase 4 pass, not self-caught during implementation — a slice-plan description should be treated as a checklist against the diff, not just prose written in advance.

## Try

- **When a plan's slice description promises a specific refactor shape (e.g. "shared cleanup list"), diff the actual commit against that sentence before moving on**, not just running the tests. This story's fix was cheap (extract `cleanupTempDirs` into the shared helper, ~15 min), but it would have been cheaper still to catch during C5 itself rather than at Phase 4.

## Code-review findings (Phase 4, 2026-07-03)

5 findings total (1 P1, 0 P2, 2 P3 non-soft + 2 soft).

| Finding | Resolution |
| --- | --- |
| PR #158's CI `build` check failing on `harness/drift-scan/tests/drift-scan.integration.test.ts`, a file untouched by this diff | acknowledged — traced to a stale CI run on commit `32d1ac5` (before C1–C5 were pushed); the test passes locally against both `origin/main` and this branch's `HEAD`. Resolved by pushing the full commit range for a fresh CI run |
| C5 (`refactor(harness): tidy temp-git-repo helper usage...`) diff (1-line unused-import removal) didn't match its plan description ("shared `afterEach` cleanup list") | fix-now — amended C5 (unpushed at review time) to add `cleanupTempDirs()` to `temp-git-repo.ts` and use it from both integration test files' `afterEach` blocks, matching the description |
| (soft) `TEMP_DIRS.push(tmpDir)` + `initTempRepo()` call-site pattern still duplicated across both files | acknowledged — explicitly deferred to #119 in the plan; first candidate for that follow-up when it lands |
| (soft) One `fails if` comment referenced "Gherkin Scenario A" while its sibling test's comment omitted the scenario tag | fix-now — added the matching scenario reference for consistency |
| Mock-diversity check (R8): loop-metrics fixture includes both a resolvable and an unresolvable/skip-case row, not defaults-only | acknowledged — positive, no change needed |

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** No CLAUDE.md changes; no new rule tag introduced.
- [x] If yes, reconciled in this PR? N/A — no contradictions.
- [x] `npx tsx harness/drift-scan/drift-scan.ts --all` — exit 0.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `harness/metrics/tests/_helpers/temp-git-repo.ts` shared helper | new file | done |
| Both metrics integration test files sandboxed in a temp repo | `harness/metrics/tests/*.integration.test.ts` | done |
| Cross-module (`dod-check` ↔ `metrics`) helper extraction | future story, tracked by [#119](https://github.com/xavierbriand/accounting/issues/119) | open |
