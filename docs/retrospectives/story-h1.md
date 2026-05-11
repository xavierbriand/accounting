# Story h1 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/115  **Closed:** 2026-05-01

First story under the harness-engineering curriculum (Module 1 of 6 in [docs/learning/harness-engineering.md](../learning/harness-engineering.md)). Ships `harness/drift-scan/` — the first inhabitant of a brand-new top-level `harness/` tree carved out from product `src/`/`tests/`. The structural choice is more load-bearing than the tool itself: Modules 2–5 inherit the pattern. Codifies R20 (from story-D's open Try), R21 (drift-scan rule itself), and a § 5 carve-out exempting `harness/` from the 100% branch-coverage target.

## Keep

- **harness/ separation paid off immediately.** Two tsconfigs (`tsconfig.json` + `tsconfig.harness.json`) and two vitest configs kept the product test count untouched (`npm test` reported 680 passes + 2 *pre-existing* failures, unchanged from main). The fork story for Module 6 ("delete `src/`, keep `harness/`") is no longer aspirational — the boundary is real and grep-verified (separation audit in plan § Verification step 9 passed).
- **plan-reviewer + code-reviewer round-trip caught the right things.** Phase 2 surfaced the missing `fails if` clauses (R6) and the unanchored path-extraction regex; Phase 4 caught the `--json` shape under-assertion (R8) and the `formatJsonReport`-placement drift (R2). Neither sub-agent caught the same finding twice; the two reviews complemented rather than duplicated.
- **`*(pending)*` opt-out marker is the right primitive.** Lets a retro propose a future R-tag without breaking the scan (the chicken-and-egg pattern story-D ran into). Three syntactic variants tested (`*(pending)*`, `_(pending)_`, case-insensitive `(Pending)`); the regex was easy to write and easy to read.
- **Diff-scoped Check B is the right default.** Avoiding retroactive failures on frozen historical plans removed a whole class of false alarms before they could appear. The `--all` escape hatch is there for backfill but is opt-in. This is the same principle CLAUDE.md § 4.3 prefers (forward-only sync) but operationalised via the scan's scope rather than the scan's existence.
- **Plan's Suggestion log captured every adoption decision.** The 19 Phase-2 findings + 10 Phase-4 findings round-tripped into a single trace that maps reviewer-finding → resolution → diff/issue link. Future reviewers don't need to re-derive the decision tree.

## Change (what to do differently next time)

- **Slice-4 over-implementation broke the strict TDD pairing on slice 7.** Sonnet implemented `extractPlanSurfacePaths` ahead of the plan because the slice-3 failing-test file imported all five parser exports. Slice 7's tests landed green-on-first-run; slice 8 became an empty `chore(workflow): empty slice` per R20. **Lesson:** a failing-test slice's test file should import only the surface the *current* slice introduces, not the eventual final surface. Adopt this as a hardening of R12/R13 in a future story.
- **R21 chicken-and-egg.** Codifying R21 in slice 10 made the live-repo `tsx drift-scan` reporter emit a `table-only: R21` finding because no retro mentioned R21 yet (this file mentions it for the first time). Sonnet's pragmatic resolution was to make `table-only` a *soft* (exit-0) finding. Honest, but it weakened Check A's bidirectional invariant in production. **Lesson:** a story that codifies a new R-tag should be designed with a path to honest validation post-merge. Filed as [#120](https://github.com/xavierbriand/accounting/issues/120) for the cleanup PR that promotes `table-only` to hard once this retro is on main.
- **Two Gherkin scenarios shipped without explicit backing tests.** Scenarios 4 (default-scope deleted file in diff) and 5 (frozen historical, default scope) both probe `getPlanFiles`'s diff-scope filter, which is only honestly testable at the subprocess tier with a temp-git-repo scaffold. **Lesson:** when a `fails if` clause names production behaviour that requires non-trivial test infra, the plan should either budget for the infra (extra slice) or explicitly defer the scenario as a known gap with a follow-up ticket. Filed as [#119](https://github.com/xavierbriand/accounting/issues/119).
- **Plan's Production-code surface drifted mid-implementation.** Two omissions: `formatJsonReport` was implemented in `drift-parser.ts` (pure) instead of `drift-scan.ts` (I/O), and `tsconfig.harness.json` gained `types: ["node"]`. Phase 4 caught both; the plan's R2 table was corrected retroactively. **Lesson:** when Sonnet diverges from the surface table, the implementation commit should patch the plan table in the same diff, not leave it for Phase 4 to reconcile. Soft new rule worth considering — pair with R2 if it recurs across the next 2–3 stories.
- **Force-push rebase friction.** A `fix(ingest)` commit landed on main mid-Phase-4. The rebase rewrote 11 SHAs; the remote feature branch still held the originals; push was rejected. § 6.4.1's conflict-resolution protocol handled this cleanly (diagnosis + options + ask), but the operation was blocked by the harness permission rules until explicit auth. **Lesson:** consider adding `Bash(git push --force-with-lease:*)` to `.claude/settings.local.json` for the worktree to make rebase-driven force-pushes single-keystroke. Risk surface: feature branches only; main is protected by repo rules.

## Code-review findings (Phase 4)

`code-reviewer` sub-agent on 2026-05-01 — 10 findings (6 P1, 1 P2, 3 P3 soft). Tally: 5 fix-now · 3 defer-issue · 3 acknowledged · 0 rejected.

| Phase | Finding | Resolution | Where |
| --- | --- | --- | --- |
| P1 | R6 — `// fails if …` comments missing from both test files | fix-now | Phase-4 refactor — added to `drift-parser.test.ts` (3 blocks) and `drift-scan.integration.test.ts` (5 tests) |
| P1 | R5 — Gherkin scenario 4 (default-scope deleted file) has no backing test | defer-issue | [#119](https://github.com/xavierbriand/accounting/issues/119) — requires temp-git-repo scaffolding |
| P1 | R5 — Gherkin scenario 5 (frozen historical, default scope) has no backing test | defer-issue | Subsumed by [#119](https://github.com/xavierbriand/accounting/issues/119) |
| P1 | R7 — `getPlanFiles` diff-scope filter has no subprocess-tier test | defer-issue | Subsumed by [#119](https://github.com/xavierbriand/accounting/issues/119) |
| P1 | R2 — `formatJsonReport` placement divergence | acknowledged | Pure-parser placement is actually better than plan; surface table corrected retroactively |
| P1 | R2 — output contract divergence (`hardFindings` filter; table-only ≠ exit 1) | fix-now (docs) + defer-issue | README documents the soft/hard split; [#120](https://github.com/xavierbriand/accounting/issues/120) promotes table-only post-retro |
| P2 | R8 — `--json` integration test under-asserts entry shape | fix-now | Phase-4 refactor — iterate every finding and assert discriminated-union shape per `kind` |
| P3 (soft) | Clean-repo test asserts only `status === 0`; doesn't pin stderr | fix-now | Phase-4 refactor — block `retro-only:` and `missing-path:` in stderr |
| P3 (soft) | Dead `tempPlan` variable in integration test | fix-now | Phase-4 refactor — removed; `node:os` import dropped |
| P3 (soft) | `runScanner` return type forces `as string` cast | fix-now | Phase-4 refactor — narrowed return to `SpawnSyncReturns<string>` |

## Try

- **New rule candidate (deferred to next process-touching PR):** when a failing-test slice's test file imports more surface than the slice introduces, the next slice's commit-time R12-style verb gets a "preparedness" suffix or the slice is split. Lighter version: just write a one-line note in `.claude/agents/sonnet-implementer.md` § Process (under "TDD rhythm") naming the over-import trap. Mark as `R22 *(pending)*` until the next story has data on whether it generalises.
- **Adopt the convention that R-tag codification stories file the corresponding cleanup ticket as part of the same plan.** Story-h1 filed [#120](https://github.com/xavierbriand/accounting/issues/120) retroactively; better to have anticipated the chicken-and-egg at Phase 1. Worth a single sentence in the maintenance-sub-loop checklist: "If this story codifies a new R-tag, has the path to honest validation post-retro been planned?"
- **Phase-4 fix-now lane that bypasses Phase 5.** The 5 fix-now items in this retro landed in a single `refactor(drift-scan)` commit before the retro itself. The plan's slice envelope had no slot for this; it accreted as slice "9b" effectively. Worth considering whether the R13 envelope should explicitly budget for a Phase-4 refactor slice on stories that touch >5 files. Mark as observation, not yet a rule.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** § 5 gains a one-line carve-out for `harness/`; § 8 gains R20 + R21 rows; this retro is the originating retro for both R20 (closes story-D's open Try) and R21 (drift-scan rule itself). `tsx harness/drift-scan/drift-scan.ts` will report zero findings (including soft `table-only`) once this retro file lands on main — the very mechanism this story shipped is what gates the answer here.
- [x] If yes, reconciled in this PR? N/A — no contradictions.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `harness/` tree + isolated tsconfig + vitest config | `harness/`, `tsconfig.harness.json`, `vitest.harness.config.ts` | done (slice 2, commit `460c1bd`) |
| `drift-parser.ts` pure parsers (extract / suppress / scan / format) | `harness/drift-scan/lib/drift-parser.ts` | done (slices 4–8, commits `6cb1264`/`73dcd0f`/`d0e5e07`) |
| `drift-scan.ts` CLI entrypoint + integration test | `harness/drift-scan/drift-scan.ts`, `harness/drift-scan/tests/drift-scan.integration.test.ts` | done (slice 9, commit `26234b6`) |
| R20 + R21 + § 5 carve-out in CLAUDE.md | `CLAUDE.md` | done (slice 10, commit `d316482`) |
| CI steps (Harness Tests + Drift scan) + `fetch-depth: 0` | `.github/workflows/ci.yml` | done (slice 11, commit `73f908f`) |
| PostToolUse hook + 3 new permissions | `.claude/settings.json` | done (slice 11, commit `73f908f`) |
| Phase-4 fix-now (R6/R8/dead var/return type/README) | parser + integration tests, `harness/drift-scan/README.md` | done (Phase-4 refactor, commit `b9698b9`) |
| Explicit subprocess tests for default-scope diff filter | [#119](https://github.com/xavierbriand/accounting/issues/119) | open |
| Promote `table-only` findings to exit-1 once this retro lands on main | [#120](https://github.com/xavierbriand/accounting/issues/120) | open |
| New rule candidate: over-import trap in failing-test slice | next process-touching PR — mark `R22 *(pending)*` until data | open |
| Observation: Phase-4 refactor slice in R13 envelope on >5-file stories | future retro observation | open |
