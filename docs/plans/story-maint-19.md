# Story maint-19 — Sandbox metrics integration tests in a temp git repo

## Context

Deferred from story-h6 Phase-4 review (PR #149, finding F7). Tracked by [#150](https://github.com/xavierbriand/accounting/issues/150).

`harness/metrics/tests/loop-metrics.integration.test.ts` invokes `harness/metrics/loop-metrics.ts` with `cwd: REPO_ROOT` (the real repo). `loop-metrics.ts` resolves `repoRoot = process.cwd()` and unconditionally writes `docs/metrics/loop.csv` under it — so running `npm run test:harness` leaves the real, tracked `docs/metrics/loop.csv` modified. Separately, `harness/metrics/tests/usage-reader.integration.test.ts`'s `--story h4` subprocess-smoke test invokes `harness/metrics/usage-reader.ts --story h4` the same way; `usage-reader.ts`'s `runStory()` also resolves `repoRoot = process.cwd()` and writes `docs/metrics/story-<id>.md` under it, leaving an untracked `docs/metrics/story-h4.md` in the real tree.

**Impact:** a dirtied `loop.csv`/story corpus can cause `loop-metrics.integration.test.ts` to fail on a second run, and pollutes the working tree during any harness-test run — easy to mistake for a regression. Confirmed both symptoms trace to `process.cwd()`-relative output paths in the two entrypoints, exercised by two different test files (not just the one named in #150's title).

**Fix (per #150):** sandbox both subprocess-smoke tests in a temp git repo, following the pattern `harness/dod-check/tests/dod-check.integration.test.ts` already uses (`fs.mkdtempSync` scaffold + `afterEach` cleanup) — run each entrypoint with `cwd: tmpDir` instead of `cwd: REPO_ROOT`. No production-code change: both entrypoints already resolve everything relative to `process.cwd()`, so pointing `cwd` at a temp repo is sufficient.

No FR/NFR coverage — harness/test-infra maintenance only.

**Maintenance sub-loop (§ 6.7) run 2026-07-03 pre-planning:**

- [x] **Sibling work check.** `gh pr list --state open --draft --base main` → `[]` (no open/draft PRs). `gh issue list --state open --limit 50` → 32 open issues; none overlaps this story's scope. #119 (drift-scan subprocess tests / temp-git-repo scaffolding) is adjacent (shared temp-dir helper candidate, noted in #150 itself) but out of scope — deferred below.
- [x] **Story-id uniqueness.** `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i "story-maint-19"` → no hits. `story-maint-19` is free (highest existing is `story-maint-18`).
- [x] **Working tree clean.** `git status` clean; branch rebased onto `origin/main` (`9154250`).
- [x] **Open issues.** Reviewed above; #150 (this story) and #154 (deferred by user — trigger-discipline issue, not yet actionable) are the only issues in scope for this session.
- [x] **Open PRs.** None open.
- [x] **`npm audit --audit-level=high`** — 0 vulnerabilities.
- [x] **Proceed-to-planning.**

## Story

> As a developer running `npm run test:harness`, I want the metrics integration tests to run against an isolated temp git repo instead of the real working tree, so that a routine test run never leaves `docs/metrics/loop.csv` modified or a stray `docs/metrics/story-h4.md` behind — eliminating a source of test pollution that can be mistaken for a regression.

## Domain model

No model impact — harness/test-infra maintenance, not product Core domain (R24 default for maint/process stories).

## Selected solution

Add a small shared helper, `harness/metrics/tests/_helpers/temp-git-repo.ts`, colocated with the two test files it serves (both under `harness/metrics/tests/`), mirroring `dod-check.integration.test.ts`'s inline `initTempRepo`/`git` helpers but factored out since two files need it here. It exposes:
- `initTempRepo(): string` — `git init` + user config + `commit.gpgsign false` (same 1Password-signing workaround as dod-check's helper) + one base commit.
- `git(cwd, args): string` — thin `execFileSync` wrapper.

**`loop-metrics.integration.test.ts`** rewritten to: build a temp repo with a handful of `docs/plans/story-<id>.md` files and commits tagged `[story-<id>]` (plus one story with no matching commit, to exercise the skip-report path, and one with a `docs/retrospectives/story-<id>.md` carrying a `## Loop metrics` heading), create an `origin/main` branch at HEAD (matching `getCommitLog`'s `git log ... origin/main` invocation), then run the entrypoint with `cwd: tmpDir`. Assertions move from "the real repo's `docs/metrics/loop.csv` has ≥35 rows sourced from real history" to "the temp repo's `docs/metrics/loop.csv` has exactly the expected header + one row per fixture story, with the fixture's skip case correctly reported." A trailing assertion, captured once via a `beforeEach` snapshot at the top of the file (vitest runs `it()` blocks within one file sequentially, so this is safe from within-file races; no other spec file reads/writes the real `docs/metrics/loop.csv`), confirms the **real** repo's `docs/metrics/loop.csv` (via `REPO_ROOT`) is byte-identical to its state before the test ran — a regression guard for the pollution this story fixes.

**`usage-reader.integration.test.ts`**'s `'writes docs/metrics/story-<id>.md with an attribution note'` test rewritten to: build a temp repo with one commit tagged `[story-zz]`, run `usage-reader.ts --story zz` with `cwd: tmpDir`, assert `tmpDir/docs/metrics/story-zz.md` is written with the expected markers (session count / attribution / unattributed sessions — these lines are unconditional per `formatStoryReport`, independent of whether any real `~/.claude/projects` session file happens to overlap the fabricated commit window). Trailing assertion confirms the real repo's `docs/metrics/story-h4.md` was never created.

**Why not sandbox `findSessionFiles()` too:** it reads `$HOME/.claude/projects`, independent of `cwd` — untouched by this story's `cwd`-based fix and not a source of *repo* pollution (the bug this story targets). Leaving it as-is keeps the fix minimal and matches #150's "no product-code change" framing.

**Why a local helper instead of extracting one shared with `dod-check.integration.test.ts`:** #150 itself flags this as a "shared temp-dir helper candidate" adjacent to #119 (drift-scan subprocess tests), not a requirement of this story. Cross-module extraction (`harness/dod-check` ↔ `harness/metrics`) is a separate, coarser refactor with its own review surface — deferred to #119 rather than bundled here.

## Production-code surface (R2)

None. Files touched: `harness/metrics/tests/loop-metrics.integration.test.ts`, `harness/metrics/tests/usage-reader.integration.test.ts` (one test block), new `harness/metrics/tests/_helpers/temp-git-repo.ts`. No changes to `harness/metrics/loop-metrics.ts`, `harness/metrics/usage-reader.ts`, or any `src/` file.

## Gherkin acceptance scenarios

These are harness-tooling tests (no product `tests/features/*.feature` — consistent with `dod-check.integration.test.ts`'s precedent of subprocess-only coverage for harness scripts). Scenarios below describe the subprocess-smoke behaviour the rewritten tests assert; `fails if` names the guarded regression (R6/R7 — both in-process-launched subprocess tests, R7 scope note: guards script-level `cwd`/output-path wiring, not the pure lib logic already covered elsewhere).

**Scenario A — loop-metrics runs against a temp repo, not the real tree**
Given a temp git repo with fixture `docs/plans/story-*.md` files, tagged commits, and an `origin/main` branch
When `harness/metrics/loop-metrics.ts` runs with `cwd` pointed at the temp repo
Then `<tmpDir>/docs/metrics/loop.csv` is written with the expected header and one row per fixture story (including the skip-case row), and the real repo's `docs/metrics/loop.csv` is unchanged
`fails if`: the entrypoint's `cwd` argument is ignored/dropped and `docs/metrics/loop.csv` under the real `REPO_ROOT` is modified again — guards the exact regression #150 reports.

**Scenario B — usage-reader story mode runs against a temp repo, not the real tree**
Given a temp git repo with one commit tagged `[story-zz]`
When `harness/metrics/usage-reader.ts --story zz` runs with `cwd` pointed at the temp repo
Then `<tmpDir>/docs/metrics/story-zz.md` is written with session-count/attribution/unattributed-sessions markers, and the real repo never gains a `docs/metrics/story-h4.md` (or `story-zz.md`)
`fails if`: the entrypoint's `cwd` argument is ignored/dropped and an untracked `docs/metrics/story-<id>.md` appears in the real repo — guards the second regression #150 reports.

Note: `usage-reader.ts`'s `getStoryCommitWindow` resolves the fixture commit via `git log --all ...`, not `origin/main`-scoped like `loop-metrics.ts`'s `getCommitLog`. `initTempRepo`'s `origin/main` branch is therefore inert scaffolding for Scenario B — the fixture commit only needs to exist on *some* ref in the temp repo, matched by `--all`, regardless of `origin/main`.

## Slice plan (R13: target 6–10 commits)

Preparatory (before Phase 3; not counted per R16 convention):
- **P0:** `chore(docs): story-maint-19 plan + P1/P2/P3 review`

Change-body commits:
1. **C1:** `test(harness): sandbox loop-metrics integration test in a temp repo — failing [story-maint-19]`
   Add `harness/metrics/tests/_helpers/temp-git-repo.ts`; rewrite `loop-metrics.integration.test.ts` to build a fixture temp repo and assert against `tmpDir`-relative paths — red, since the `spawnSync` call still points `cwd` at `REPO_ROOT` and never writes those paths.
2. **C2:** `feat(harness): run loop-metrics entrypoint against the temp repo — green [story-maint-19]`
   Switch the `spawnSync` call's `cwd` to `tmpDir`; add the real-repo-untouched regression assertion; green.
3. **C3:** `test(harness): sandbox usage-reader story-mode integration test in a temp repo — failing [story-maint-19]`
   Rewrite the `'writes docs/metrics/story-<id>.md...'` test to build a fixture temp repo; red.
4. **C4:** `feat(harness): run usage-reader story-mode entrypoint against the temp repo — green [story-maint-19]`
   Switch that test's `spawnSync` call's `cwd` to `tmpDir`; add the real-repo-untouched regression assertion; green.
5. **C5:** `refactor(harness): tidy temp-git-repo helper usage across both metrics integration tests [story-maint-19]`
   Local cleanup only (naming, shared `afterEach` cleanup list) — no cross-module extraction (see plan's "Why a local helper" note).
6. **C6:** `chore(retro): story-maint-19 retrospective + status fragment [story-maint-19]`

**Total: 6 change-body commits** — within R13's 6–10 target.

## Risks & deferred items

| Risk | Mitigation |
|------|-----------|
| Fixture temp repo drifts from what `getCommitLog`/`getPlanStoryIds`/`countStoryCommits` actually expect (e.g. `origin/main` ref shape), silently passing against a repo shape `loop-metrics.ts` wouldn't see in reality | Model `initTempRepo`'s `origin/main` branch creation directly on the pattern `getCommitLog` uses (`git log --format=... origin/main`), matching `dod-check.integration.test.ts`'s own established `origin/main` branch-creation convention |
| Shared helper duplicated (not extracted) between `dod-check` and `metrics` test suites — two near-identical `initTempRepo`/`git` implementations now exist in the repo | Acceptable per plan's own reasoning (cross-module extraction is #119's concern, not this story's); flagged here so it isn't silently forgotten |
| `usage-reader.ts --story` test's session-count/attribution assertions are unconditional per `formatStoryReport`, so a future change weakening that guarantee wouldn't be caught by *this* story's rewrite | Pre-existing test scope (unchanged from today); out of scope for a pollution fix |

Cross-module temp-repo helper extraction → tracked by existing issue [#119](https://github.com/xavierbriand/accounting/issues/119) (no new issue needed; #150 itself named #119 as the adjacent candidate).

## Verification plan

1. `npm run test:harness` (or targeted `npx vitest run harness/metrics/tests/`) — green.
2. `git status --porcelain -- docs/metrics` immediately after step 1 — empty (the regression this story fixes).
3. Run step 1 **twice in a row** — both runs green (guards the "second run fails because the corpus is dirtied" failure mode #150 describes).
4. `npm run lint && npm run build && npm test` — full suite green.
5. `npx tsx harness/drift-scan/drift-scan.ts --all` — exit 0.

## Suggestion log

Phase 2 — `plan-reviewer` + `sibling-overlap` in parallel, 2026-07-03.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | Scenario B's shared `initTempRepo` `origin/main` branch is inert scaffolding — `usage-reader.ts`'s `getStoryCommitWindow` resolves via `git log --all`, not `origin/main`-scoped, so the plan's risk-table note ("model `origin/main` per `getCommitLog`'s pattern") only covers Scenario A | ADOPT | Added an explicit note under Scenario B clarifying the fixture commit only needs to exist on some ref, matched by `--all`, independent of `origin/main` |
| 2 | Scenario A's real-repo "byte-identical before/after" regression guard doesn't state snapshot timing, leaving a theoretical race if vitest's file-level parallelism interleaves reads of the real `docs/metrics/loop.csv` | ADOPT | Clarified the snapshot is captured once via `beforeEach` in the one spec file that touches that real path; vitest runs `it()` blocks within a file sequentially, and no other spec file reads/writes it |
| 3 | Duplicated `initTempRepo`/`git` helper logic between `dod-check.integration.test.ts` and the new `harness/metrics/tests/_helpers/temp-git-repo.ts`, rather than a single shared implementation | ACKNOWLEDGE | Plan's own "Why a local helper" section and risk table already name this and defer cross-module extraction to #119 (per #150's own suggestion) — correctly scoped out of this story |
| 4 | Scenario B rewrite using synthetic `story-zz` instead of the real `h4` id is a PII/coherence improvement over the current test | ACKNOWLEDGE | Positive observation, no change needed |
| 5 | Loop-metrics fixture set (skip-case story + retro-with-`## Loop metrics`-heading story) is a reasonable mock-diversity analog (R8) for CSV-row-shape output | ACKNOWLEDGE | Positive observation, no change needed |
| 6 | Remaining ~20 P1/P2/P3 findings and the full R1–R25 rule-tag coverage check are confirmations that the plan already satisfies each applicable rule (R1, R2, R6, R7, R12, R13, R19, R23, R24) or that the rule doesn't apply (R3–R5, R9–R11, R14–R18, R20–R22, R25) | ACKNOWLEDGE | No plan changes needed — reviewed and confirmed accurate against the plan text |
| 7 | Sibling-overlap audit: 0 open PRs, no overlapping open issue; #119 adjacency already correctly deferred by the plan | ACKNOWLEDGE | Clean — nothing to resolve |

**Tally:** 2 adopted / 5 acknowledged / 0 deferred / 0 rejected. DoR gate met — no un-tagged suggestions.

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): complete 2026-07-03; findings triaged above.
- [x] Draft PR with template sections 1–6 filled — [#158](https://github.com/xavierbriand/accounting/pull/158).
