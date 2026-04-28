# Story maint-16 — Parallel-safe product dev loop

## Context

Eighth story of the **Refactor epic** (Epic M-A). User-prompted after observing two concrete frictions when running stories on parallel worktrees:

1. A worktree's push attempted to advance `main` (non-fast-forward) because `main` had moved underneath; agent reported "push.default config tried to push both branches."
2. Two retros merged the same day both edited [`docs/status.md`](docs/status.md)'s status-log block — manual conflict resolution required even though the underlying *code* didn't overlap.

Investigation surfaced three shared artefacts and two assumptions in CLAUDE.md that cause the friction:

- **`docs/status.md` Status log** — append-only, monolithic; touched by every retro (~6× in the last 20 commits). Two stories merging same-day always race on it.
- **CLAUDE.md § 6.4** — has no push protocol for worktree environments. Worktrees can accidentally push `main`.
- **CLAUDE.md § 6.7** — says the maintenance sub-loop "runs before *every* story plan" without considering open/draft PRs from a sibling story.

§ 8 rule-provenance table conflicts are out of scope (rare; ~1 every 5–8 stories; the structured table earns its keep).

This story also bundles the open Try item from [story-maint-15 retro](../retrospectives/story-maint-15.md) — codifying R16 as the "R15-extension to any zero-behaviour-change story" rule (4 data points: maint-12, maint-13, maint-14, maint-15). My new rules therefore renumber to **R17/R18/R19**.

Loosely related to issue [#80](https://github.com/xavierbriand/accounting/issues/80) (umbrella for a meta-process improvement agent) — this story implements one concrete slice (parallel-safety rules) but does not close it.

**Maintenance sub-loop (§ 6.7) run 2026-04-28 pre-planning** — copy-pasted from [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md):

- [x] **Working tree clean.** `git status` clean; on `claude/dreamy-elion-5c7be9` worktree branch, up to date with `origin/main` (`bc8860a`).
- [x] **Open issues.** 9 open: 7 deferred-suggestions + 1 enhancement (#80, related context) + 1 enhancement (#75, story-C). None block this story.
- [x] **Open PRs.** 3 open: #84 (story-C draft, separate scope), #83 (story-3.4 draft, separate scope), #81 (Dependabot patch — `typescript-eslint` 8.59.0→8.59.1, routine). The Dependabot bump can land in parallel; this story is process-only and shares no code with it.
- [x] **`npm audit --audit-level=high`** — to be run during sonnet-implementer's verification (no production code touched here, but DoD requires the gate).
- [x] **Sibling work check** — issue #80 exists; this story explicitly addresses one slice and references it without closing. PRs #83 and #84 touch only Core/CLI; no overlap.
- [x] **Proceed-to-planning.**

## Story

> As a developer running two stories on parallel worktrees, I want the dev loop to avoid mechanical conflicts on shared artefacts (status log, `main`-branch pushes) and to be honest about parallel-PR work, so that the only conflicts I have to resolve are real semantic ones — and when those do happen, the agent diagnoses and proposes resolutions rather than asking blindly.

This is a process-rules + docs-fragmentation story. **Zero production code change.** R15-extension via newly-codified R16 (this PR codifies it for the first time and is itself a data point).

## Selected solution

### 1. Fragment `docs/status.md` Status log → `docs/status.d/`

**New convention.** Each retrospective writes a per-story fragment at `docs/status.d/<YYYY-MM-DD>-story-<id>.md` instead of editing `docs/status.md`. Date-prefixed filenames sort newest-first via plain `ls -r`.

Fragment frontmatter + body:

```markdown
---
date: 2026-04-28
story: B
pr: 82
epic: 2-followups
---

YAML becomes the only source of `autoTagRules`: grouped-by-category schema, regex pre-compiled in superRefine…
```

`docs/status.md` keeps:
- **Current position** (epic-level, edited only on epic milestones — already low contention)
- **Refresh trigger** rules (updated to mention fragments)
- **Status log** section becomes a 2-line pointer: "Per-story log entries live in [`docs/status.d/`](status.d/) — newest first by filename."

`docs/status.d/README.md` documents the fragment format + filename convention.

**Migration**: convert each existing entry in `docs/status.md` (lines 27–54, 28 entries) into a fragment under `docs/status.d/` so history is preserved verbatim. Pre-history entries (Story 1.1, 1.2 — line 54 "(earlier)") use sentinel filename `0000-00-00-pre-history.md` so they sort to the bottom under `ls -r`.

### 2. CLAUDE.md § 6.4 — add push protocol (worktree-aware) + conflict-resolution protocol

Append a new sub-section after the existing commit-convention bullets:

```
### 6.4.1 Push protocol (parallel-safe)

- **One agent per branch.** Don't open a second session against a branch with an active session.
- **All work on a branch — never on `main`.** Story worktrees never push `main`. Main advances only via `gh pr merge`, gated by the user.
- **Before every push:**
  1. `git fetch origin`
  2. `git rebase origin/main` (or `git pull --rebase` if upstream is the story branch)
  3. If rebase reports conflicts → **stop, analyse, propose resolutions, ask the user to pick.** Do not auto-resolve.
- **Push only the current branch:** `git push origin HEAD`. Don't use bare `git push` if local `push.default` is unset/`matching` — it can advance `main` unintentionally.
```

Followed by a **Conflict-resolution protocol** sub-block with three required sections in the agent's reply when a rebase conflict appears:

1. **Diagnosis** — for each conflicted file: which hunks conflict, who introduced the competing change (`git log --oneline origin/main -- <file>` and the local commit), classification *mechanical* (independent edits to a shared structure) vs *semantic* (same lines edited for different reasons).
2. **Suggested resolutions** — at least two named options each with the concrete edit. For status-log style: "(a) keep both, stack chronologically newest-first" / "(b) drop ours and re-author after rebase if upstream supersedes." For semantic: name the trade-off. `--ours`/`--theirs` only when one side is unambiguously stale.
3. **Recommendation + question** — one-sentence pick with reason; explicit ask before applying.

If the conflict is on `docs/status.d/<file>` (rare — only if two retros pick same `<date>-story-<id>` filename), the diagnosis must call that out specifically.

### 3. CLAUDE.md § 6.7 + maintenance-sub-loop checklist — parallel-aware

Update CLAUDE.md § 6.7 wording from "runs **before every story plan**" to "runs **at the start of each new planning session**, treating the check as a read-only snapshot — no blocking on sibling stories in flight."

Update [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md) checklist:
- Insert a new bullet: "**Sibling work check.** `gh pr list --state open --draft --base main` + `gh issue list --state open` — for each open/draft PR or issue, confirm it isn't already addressing the same goal you're about to plan against. If overlap, defer or coordinate."
- Reword "Working tree clean" bullet: replace "`main` synced (`git fetch && git pull`)" with "story branch rebased on `origin/main`" (status quo doesn't apply — we don't work on main).

### 4. CLAUDE.md § 8 — register the new rules + codify R16

Add **four** rows to the provenance table:

| Tag | Rule (one-line) | Originating retro |
| --- | --- | --- |
| R16 | R15 collapse extends to any zero-behaviour-change story (process refresh, agent spec, doc refresh, parallel-safety): 4 commits — `chore(docs)` plan + `chore(docs)`/`feat(agent)` change + `refactor:` empty slot + `chore(retro)` | [story-maint-15](docs/retrospectives/story-maint-15.md) (Try, codified here) |
| R17 | Status log fragmented into `docs/status.d/` per-story files; `docs/status.md` keeps only Current position + Refresh trigger + pointer | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R18 | Worktree push protocol: one agent per branch, never push `main`, fetch+rebase+propose-resolutions-on-conflict before push | [story-maint-16](docs/retrospectives/story-maint-16.md) |
| R19 | Maintenance sub-loop checks open/draft PRs **and** issues for sibling-work overlap before opening a new plan | [story-maint-16](docs/retrospectives/story-maint-16.md) |

### 5. README.md update for the retro action item

Per maint-15 retro Try: document a README refresh trigger. One-line addition near the Status section: "Refresh when the 'Next' line in [`docs/status.md`](docs/status.md) changes, or when adding a new top-level npm script." (small carve-out matching R9 — fixes a specifically-pre-specified open Try item; ≤2 LOC).

## Production-code surface

**None.** Story is process + docs only. Zero TypeScript/SQL changes. R15-extension via R16 (this is itself the codifying data point).

## Gherkin acceptance scenarios

**None.** This is a doc/process change with no executable surface. Verification is by reading + a parallel-rebase simulation (see § Verification).

## Slice plan

R16 collapse (4 commits) — same shape as maint-12/13/14/15, plus this PR's own retro:

1. **`chore(docs): plan + P1/P2/P3 review (story-maint-16)`** — already authored; updated post-plan-reviewer.
2. **`chore(docs): migrate status log to docs/status.d/ fragments (story-maint-16)`**
   - Create `docs/status.d/` with `README.md` + 28 fragment files (27 history + 1 pre-history sentinel).
   - Slim `docs/status.md`: keep Current position + Refresh trigger; replace Status log with pointer.
3. **`chore(process): worktree push protocol § 6.4.1 + sub-loop sibling check + R16/R17/R18/R19 (story-maint-16)`**
   - CLAUDE.md § 6.4.1 (push + conflict protocols)
   - CLAUDE.md § 6.7 wording change
   - CLAUDE.md § 8 four new rows
   - `docs/templates/maintenance-sub-loop.md` (sibling-work bullet + branch-rebase wording)
   - `README.md` (refresh-trigger one-liner)
4. **`refactor: empty slot — process-only PR (story-maint-16)`** — per R11.
5. **`chore(retro): retrospective + status.d fragment (story-maint-16)`** — own dogfood: drop the maint-16 fragment as the *first* file authored under the new convention; write the retro file.

Five commits — plan slice 1 already exists (this file); slices 2 + 3 are the meat; 4 is the empty refactor; 5 is the retro. Within R16 envelope (the codified rule says 4 commits *for the change body*, plan slice is preparatory and authored before phase 3 begins).

## Risks & deferred items

- **Migration ordering loss.** Same-day status-log entries don't preserve their original intra-day order under `ls -r` (e.g. on 2026-04-26 the original order was 3.2 first, then maint-15→maint-10; alphabetical sort gives maint-15→maint-10→3.2). **Accept** — the prose in each fragment is preserved verbatim; intra-day ordering is not load-bearing for any reader. Document this in the migration commit body.
- **No git pre-push hook to enforce R18.** Defer per plan; document-only first, escalate if R18 is violated in practice.
- **§ 8 fragmentation deferred.** Rare contention (~1 every 5–8 stories); the table's scanability outweighs the conflict cost.
- **No tooling for "one agent per branch".** Convention only.
- **Issue #80 not closed.** Out of scope: this story is one slice; #80 covers a broader meta-process agent.
- **Maint sub-loop "before every story plan" wording vs "start of each new planning session"**: parallel planning sessions could now both proceed without coordination. Risk: two stories independently plan against overlapping concerns. **Mitigated** by the new sibling-work check (R19); residual risk is acceptable given parallelism is the explicit goal.

## Verification plan

1. `npm run lint && npm run build && npm test` — green (no production code touched; existing test count preserved). DoD § 1.
2. **Migration sanity:**
   - `ls docs/status.d/*.md | wc -l` ≥ 28 (27 history + 1 README + 1 pre-history sentinel).
   - `ls -r docs/status.d/*.md | head -3` — should list newest first (`2026-04-28-story-B.md` etc., excluding `README.md` which lacks a date prefix).
   - `cat docs/status.md` — Status log section is the 2-line pointer; Current position + Refresh trigger preserved.
3. **Parallel-rebase simulation:** create two throwaway local branches off `origin/main`, each adds a different file under `docs/status.d/`, rebase one on the other — confirm zero conflicts (different filenames).
4. **Drift scan:** walk § 8 — confirm R16/R17/R18/R19 rows exist; confirm no stale `docs/status.md` references in CLAUDE.md prose (should still be fine — § 1 points to status.md as the entry point).
5. **Manual rehearsal of new push protocol:** dry-run on this branch — `git fetch origin && git rebase origin/main` succeeds without conflict; `git push origin HEAD` pushes only `claude/dreamy-elion-5c7be9`, not `main`.
6. **Maintenance sub-loop checklist re-read:** confirm the new sibling-work bullet + branch-rebase wording are present and runnable.

## Suggestion log

To be filled by `plan-reviewer` (Phase 2). Placeholder:

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
|       |            |            |               |

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [ ] Phase 2 (Critical review): pending plan-reviewer pass. **Next action.**
- [ ] Draft PR with template sections 1–6 filled.
