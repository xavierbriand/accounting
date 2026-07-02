# Story maint-18 — Story-id uniqueness check in the maintenance sub-loop

## Context

Story `story-h2` collided with an already-merged story of the same id (the drift-scan hard-exit cleanup, [PR #125](https://github.com/xavierbriand/accounting/pull/125), closes [#120](https://github.com/xavierbriand/accounting/issues/120)). A second PR ([#130](https://github.com/xavierbriand/accounting/pull/130), branch `story-h2`) reused the id for unrelated work (Harness Module 2), silently overwriting `docs/plans/story-h2.md` and `docs/retrospectives/story-h2.md` in place — erasing the merged story's open action items from the current docs tree (recoverable via git history, but no longer discoverable by reading current docs).

Fixing it required renaming the branch (`story-h2` → `story-h3`), which had an unwanted side effect: GitHub auto-closed the open PR because its head ref disappeared, and it could not be reopened — a new PR ([#138](https://github.com/xavierbriand/accounting/pull/138), merged) had to be opened in its place.

**Root cause.** [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md) — the checklist run before opening every new story plan (CLAUDE.md § 6.7) — has no step that checks whether the chosen story id is already taken. The existing "Sibling work check" bullet looks at open PRs/issues for *scope* overlap, not at whether `docs/plans/story-<id>.md` or `docs/retrospectives/story-<id>.md` already exists on `main`. This is especially easy to trip on the harness-engineering track, where story ids (`h1`, `h2`, ...) are assigned informally and a curriculum module number doesn't necessarily match the next free sequential story id (as happened here — `story-h2` was consumed by an off-curriculum cleanup, not "Module 2").

Tracked by: [#139](https://github.com/xavierbriand/accounting/issues/139). This story closes it.

Pure process/docs change — no production code, no behaviour change. R16 collapse applies.

**Maintenance sub-loop (§ 6.7) run 2026-07-02 pre-planning** — copy-pasted from [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md):

- [x] **Sibling work check.** `gh issue list --state open --limit 50` — 31 open issues, all either `deferred-suggestion` items scoped to their originating stories, harness-curriculum modules (#94–#100, #111), or unrelated product bugs/enhancements (#93, #103, #105, #106). None overlaps this story's scope (maintenance-sub-loop checklist). `gh pr list --state open` — at the time of this check, the only open PRs are Dependabot bumps (routine, being merged directly per the checklist's own "Open PRs" bullet — no scope overlap) and #141 (this session's `npm audit fix`, also process/tooling-only, no file overlap with `docs/templates/maintenance-sub-loop.md`).
- [x] **Working tree clean.** `git status` clean; `main` up to date with `origin/main` (`d9a54cb` at last fetch, advancing further as sibling Dependabot merges land — none touch `docs/`).
- [x] **Open issues.** Reviewed above; #140 (npm audit) is being fixed in parallel by PR #141, unrelated file surface.
- [x] **Open PRs.** Dependabot patch/minor bumps — merging directly per policy (in progress this session). #141 — lockfile-only `npm audit fix`, no overlap.
- [x] **`npm audit --audit-level=high`** — found 3 vulnerabilities (1 high: vite; 2 moderate: js-yaml, brace-expansion), all devDependency-transitive. Filed [#140](https://github.com/xavierbriand/accounting/issues/140) and fixed via [#141](https://github.com/xavierbriand/accounting/pull/141) (lockfile-only, `npm audit fix` with no `--force`, 689/689 tests green) ahead of this story per policy.
- [x] **Proceed-to-planning.**

## Story

> As the agent running Phase 1 (Plan) for a new story, I want the maintenance sub-loop to mechanically check whether my chosen story id already has a plan/retro file on `main`, so that I never silently overwrite a merged story's docs by reusing its id — the exact failure that shipped as `story-h2` twice and cost a closed-and-reopened PR to fix.

No FR coverage (process/workflow fix). Targets [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md) (the runnable checklist) — CLAUDE.md § 6.7 states the *concept* ("run the maintenance sub-loop checklist") and does not need to change, since the concept is unchanged; only the checklist's *steps* gain one new bullet, which is explicitly the template's own division of responsibility ("If the *steps* change... update this file").

## Selected solution

Add a new checklist bullet to [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md), placed immediately after "Sibling work check" (both bullets are, at heart, "does this collide with something that already exists" — grouping them keeps the checklist's collision-avoidance checks together):

```markdown
- [ ] **Story-id uniqueness.** Before picking a story id (e.g. `h3`), confirm no `docs/plans/`, `docs/retrospectives/`, or `docs/status.d/` file for that id already exists on `origin/main`:
      `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i "story-h3"`
      Also check open PR branch names (`gh pr list --state open --json headRefName`) for the same id in flight. If taken, pick the next free id before branching. Curriculum-numbered tracks (e.g. `story-h<N>`) are especially exposed — a module number does not guarantee its id is unused; off-curriculum cleanups can consume ids out of sequence.
```

`git ls-tree -r origin/main` (rather than a local `ls docs/plans/`) is deliberate: it checks the authoritative remote state directly, so it works correctly even from a fresh worktree that hasn't fetched yet, and it won't be fooled by a stale local checkout.

### Why not a script/lint instead of a manual checklist step

`harness/drift-scan/drift-scan.ts` already runs mechanically at write-time and in CI for CLAUDE.md § 8 ↔ retro drift and plan ↔ source drift. Story-id collision is a different class of problem: it must be caught **before a branch is created**, not after a plan file is committed — by the time a drift-scan-style check could run in CI, the branch (and its confusing history) already exists. A pre-planning checklist step is the correct enforcement point given the current tooling; automating it further (e.g. a `new-story-preflight` skill step, since [.claude/commands/new-story-preflight.md](../../.claude/commands/new-story-preflight.md) already runs the maintenance sub-loop per its own checklist item 1) is a natural follow-up but out of scope for this story — noted under Risks & deferred items.

## Production-code surface (R2)

None. Single file changed: `docs/templates/maintenance-sub-loop.md` (docs/process only, no `src/`, no `harness/`, no schema/migration).

## Gherkin acceptance scenarios

None — this is a checklist/process document, not executable code. Verification is by inspection (see § Verification plan).

## Slice plan (R16: target 4 commits)

Preparatory (before Phase 3; not counted per R16):
- **P0:** `chore(docs): story-maint-18 plan + P1/P2/P3 review`

Change-body commits:
1. **C1:** `chore(docs): add story-id uniqueness check to maintenance sub-loop [story-maint-18]`
   Files: `docs/templates/maintenance-sub-loop.md`
2. **C2:** `refactor: empty slot — process-only checklist addition [story-maint-18]`
   Per R11 — no code refactor surface in a single-bullet doc change.
3. **C3:** `chore(retro): story-maint-18 retrospective + status fragment [story-maint-18]`
   Files: `docs/retrospectives/story-maint-18.md`, `docs/status.d/2026-07-02-story-maint-18.md`

**Total: 3 listed commits (C1 change + C2 empty refactor slot + C3 retro) = 4 change-body commits under R16's own count** (R16 counts the empty refactor slot as one of the 4). Within R16 (4 commits for zero-behaviour-change stories).

## Risks & deferred items

| Risk | Mitigation |
|------|-----------|
| Checklist step is manual — relies on the planning agent actually running the `git ls-tree` command | Same enforcement model as every other maintenance sub-loop bullet today (all manual, pre-planning). Acceptable; if repeated misses occur, escalate to automation (see below). |
| `git ls-tree -r origin/main` requires a fetched `origin/main` ref | Already a precondition of the "Working tree clean" bullet, which runs first in the checklist. |
| True automation (CI or a `new-story-preflight` skill assertion) would catch this even if the manual step is skipped | Deferred — out of scope for this story. File a follow-up issue if a second story-id collision occurs (this story is the first data point; per this repo's pattern of requiring 2-3 occurrences before codifying further tooling, one incident does not yet justify a script). |

## Verification plan

1. `docs/templates/maintenance-sub-loop.md` contains the new "Story-id uniqueness" bullet, positioned after "Sibling work check".
2. Manual dry-run: `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ | grep -i "story-h2\.md"` returns the real (merged) `story-h2` plan/retro paths — demonstrating the check would have caught the original collision had it existed at the time.
3. `npx tsx harness/drift-scan/drift-scan.ts --all` — exit 0 (no CLAUDE.md § 8 ↔ retro drift introduced; CLAUDE.md itself is untouched).
4. `npm run lint && npm run build && npm test` — green (no production surface touched; sanity check only).

## Suggestion log

Phase 2 — `plan-reviewer` + `sibling-overlap` in parallel, 2026-07-02.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | New checklist bullet's grep scope covered `docs/plans/` + `docs/retrospectives/` but not `docs/status.d/`, even though status fragments are also keyed by story id | ADOPT | Extended the bullet's `git ls-tree` command to include `docs/status.d/` |
| 2 | Slice-plan "Total" line's arithmetic ("2 change-body + 1 retro = 3 commits + empty refactor slot = 4") reads as self-inconsistent against R16's own phrasing, which counts the empty refactor slot as one of the 4 | ADOPT | Reworded to match R16's counting convention |
| 3 | Example command uses a literal `<id>` placeholder, not directly copy-pasteable unlike some other checklist bullets | ADOPT | Reworded to show `h3` as a concrete example id inline, with the demonstrated grep pattern |
| 4 | Verification plan step 2 is a one-time manual demonstration against a past incident, not a repeatable automated regression check — nothing stops the new bullet from being silently weakened or deleted later | ACKNOWLEDGE | Plan's own "Why not a script/lint" section already discusses and declines automation for this story, deferring to a follow-up if a second collision occurs; consistent with this repo's "wait for 2-3 data points" pattern for codifying tooling |
| 5 | Deviation from issue #139's literally-proposed `ls docs/plans/` command in favor of `git ls-tree -r origin/main` | ACKNOWLEDGE | Plan already justifies the deviation (works from a fresh/unfetched worktree, checks authoritative remote state) — no change needed |
| 6 | DoR checklist line said "Phase 2 ... pending" at review time | ACKNOWLEDGE | Non-issue — both plan-reviewer and sibling-overlap ran in parallel as CLAUDE.md § 6.1 phase 2 requires; checklist updated below |
| 7 | Sibling-overlap audit: no overlapping open PR/issue found | ACKNOWLEDGE | Clean — nothing to resolve |

**Tally:** 3 adopted / 4 acknowledged / 0 deferred / 0 rejected. DoR gate met — no un-tagged suggestions.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): complete 2026-07-02; findings triaged above.
- [x] Draft PR with template sections 1–6 filled — [#142](https://github.com/xavierbriand/accounting/pull/142).
