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

No FR coverage (parallel-safety / workflow improvement). This is a process-rules + docs-fragmentation story. **Zero production code change.** R15-extension via newly-codified R16 (this PR codifies it for the first time and is itself a data point).

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

`docs/status.d/README.md` documents the fragment format + filename convention. **Required content** (so sonnet-implementer has an unambiguous spec):

1. One-line purpose statement linking back to CLAUDE.md § 8 R17.
2. **Fragment format** code block showing the YAML frontmatter (`date`, `story`, optional `pr`, optional `epic`) + body paragraph.
3. **Filename convention** section: `<YYYY-MM-DD>-story-<id>.md`; sentinel `0000-00-00-pre-history.md` for pre-status.d entries.
4. **Why fragments instead of one log** section: one short paragraph linking to story-maint-16 retro for context.

**Migration**: convert each existing entry in `docs/status.md` (lines 27–54, 28 bullet rows: 27 single-story rows + 1 "(earlier)" pre-history row) into one fragment per row under `docs/status.d/`. Result: **27 dated fragment files + 1 pre-history sentinel + 1 `README.md` = 29 `.md` files total**. Pre-history entry (Story 1.1, 1.2 — line 54 "(earlier)") becomes `0000-00-00-pre-history.md` so it sorts to the bottom under `ls -r`. History prose is preserved verbatim — only frontmatter is added.

**Exact final shape of `docs/status.md`** (after the migration removes lines 23–54):

```markdown
# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

(unchanged — preserved verbatim from current lines 5–11)

## Refresh trigger

(unchanged — preserved verbatim from current lines 13–21, except the trailing line "Routine maint-story merges only need a status-log entry (newest first)." is replaced by "Routine maint-story merges drop a fragment under [`docs/status.d/`](status.d/) — never edit the log block in this file.")

## Status log

Per-story log entries live in [`docs/status.d/`](status.d/) — newest first by filename (`ls -r docs/status.d/`).
```

The `## Status log` heading is retained (cross-references in older retros may link to it); the body is replaced by the one-line pointer. The "Append-only one-line summary per merged story. Newest first." sub-line is removed.

### 2. CLAUDE.md § 6.4 — add push protocol (worktree-aware) + conflict-resolution protocol

Append a new sub-section after the existing commit-convention bullets:

```
### 6.4.1 Push protocol (parallel-safe)

- **One agent per branch.** Don't open a second session against a branch with an active session.
- **All work on a branch — never on `main`.** Story worktrees never push `main`. Main advances only via `gh pr merge`, gated by the user.
- **Before every push:**
  1. `git fetch origin`
  2. `git rebase origin/main` (or `git pull --rebase` if upstream is the story branch)
  3. If rebase reports **conflicts** → enter the Conflict-resolution protocol below. Do not auto-resolve.
  4. If rebase fails for **non-conflict reasons** (lockfile, detached HEAD, corruption, network failure mid-fetch, etc.) → stop, report the error verbatim to the user, ask before any recovery action (`git rebase --abort`, removing `.git/index.lock`, etc.). Never silently retry.
- **Push only the current branch:** `git push origin HEAD`. Don't use bare `git push` if local `push.default` is unset/`matching` — it can advance `main` unintentionally.
```

Followed by a **Conflict-resolution protocol** sub-block with three required sections in the agent's reply when a rebase conflict appears:

1. **Diagnosis** — for each conflicted file: which hunks conflict, who introduced the competing change (`git log --oneline origin/main -- <file>` and the local commit), classification *mechanical* (independent edits to a shared structure) vs *semantic* (same lines edited for different reasons).
2. **Suggested resolutions** — at least two named options each with the concrete edit. For status-log style: "(a) keep both, stack chronologically newest-first" / "(b) drop ours and re-author after rebase if upstream supersedes." For semantic: name the trade-off. `--ours`/`--theirs` only when one side is unambiguously stale.
3. **Recommendation + question** — one-sentence pick with reason; explicit ask before applying.

If the conflict is on `docs/status.d/<file>` (rare — only if two retros pick the same `<date>-story-<id>` filename), the diagnosis must name that specifically and the Suggested-resolutions section must offer at least: **(a) rename the local fragment by appending `-b` to the story id** (e.g. `2026-04-28-story-B.md` → `2026-04-28-story-B-b.md`) so both fragments coexist verbatim; or **(b) merge the two fragment bodies into a single file** (rarely correct — only when the retros documented the same outcome).

### 3. CLAUDE.md § 1 + § 6.7 + maintenance-sub-loop checklist — parallel-aware

Update **CLAUDE.md § 1** sentence "Refreshed by the retro of any story that ships an epic milestone or changes the 'Next' line." → "Refreshed by the retro of any story that ships an epic milestone or changes the 'Next' line; routine merges drop a fragment under [`docs/status.d/`](docs/status.d/)." (Per P2 finding — keeps the cheat-sheet consistent with the new fragment convention.)

Update **CLAUDE.md § 6.7** wording from "runs **before every story plan**" to "runs **at the start of each new planning session**, treating the check as a read-only snapshot — no blocking on sibling stories in flight."

Update [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md) checklist:
- Insert a new bullet: "**Sibling work check.** `gh pr list --state open --draft --base main` + `gh issue list --state open` — for each open/draft PR or issue, confirm it isn't already addressing the same goal you're about to plan against. If overlap, defer or coordinate."
- Reword "Working tree clean" bullet: replace "`main` synced (`git fetch && git pull`)" with "story branch rebased on `origin/main`." (Note: the `git fetch` step intentionally moves to the push protocol § 6.4.1 step 1 — pre-planning is a *read-only snapshot*, fetch happens at push time.)

### 4. CLAUDE.md § 8 — register the new rules + codify R16

Add **four** rows to the provenance table:

| Tag | Rule (one-line) | Originating retro |
| --- | --- | --- |
| R16 | R15 collapse extends to any zero-behaviour-change story (process refresh, agent spec, doc refresh, parallel-safety): **4 change-body commits** — `chore(docs)`/`feat(agent)` change + `refactor:` empty slot + `chore(retro)` + (optional 4th body slice when the change spans process **and** docs); the preparatory `chore(docs): plan + P1/P2/P3 review` commit is authored before phase 3 and is **not** counted in the 4 | [story-maint-15](docs/retrospectives/story-maint-15.md) (Try, codified here) |
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

R16 envelope (4 change-body commits + the preparatory plan commit). Total: **5 commits on the branch**, of which slice 1 is the (already-authored) plan and slices 2–5 are the four R16 body commits:

1. **`chore(docs): plan + P1/P2/P3 review (story-maint-16)`** — *preparatory, not counted in R16's 4-commit body*. Already authored; updated post-plan-reviewer (this revision).
2. **`chore(docs): migrate status log to docs/status.d/ fragments (story-maint-16)`** *(R16 body 1/4)*
   - Create `docs/status.d/` with `README.md` (per § 1 spec above) + 28 fragment files (27 dated history + 1 pre-history sentinel `0000-00-00-pre-history.md`).
   - Slim `docs/status.md` to Current position + Refresh trigger + `## Status log` 1-line pointer (exact final shape in § 1).
   - Commit body documents the migration-ordering-loss caveat (intra-day order not preserved under `ls -r`; prose preserved verbatim).
3. **`chore(process): worktree push protocol § 6.4.1 + sub-loop sibling check + R16/R17/R18/R19 (story-maint-16)`** *(R16 body 2/4)*
   - CLAUDE.md § 1 wording update (per § 3 above)
   - CLAUDE.md § 6.4.1 (push + conflict-resolution protocols, including non-conflict failure branch)
   - CLAUDE.md § 6.7 wording change
   - CLAUDE.md § 8 four new rows (R16/R17/R18/R19)
   - `docs/templates/maintenance-sub-loop.md` (sibling-work bullet + branch-rebase wording)
   - `README.md` (refresh-trigger one-liner)
4. **`refactor: empty slot — process-only PR (story-maint-16)`** *(R16 body 3/4)* — per R11.
5. **`chore(retro): retrospective + status.d fragment (story-maint-16)`** *(R16 body 4/4)* — own dogfood: write the retro file at `docs/retrospectives/story-maint-16.md`, then drop `docs/status.d/2026-04-28-story-maint-16.md` as the *first* fragment authored under the new convention.

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
   - `ls docs/status.d/*.md | wc -l` **= 30** by Phase 5 (27 dated history + 1 pre-history sentinel + 1 README + 1 maint-16 fragment dropped in slice 5). At Phase 3 (slice 2 only): **= 29** (27 + 1 + 1 README, no maint-16 fragment yet).
   - `ls -r docs/status.d/*.md | head -3` should list newest first (`2026-04-28-story-maint-16.md`, `2026-04-28-story-B.md`, `2026-04-28-story-A.md`). `README.md` does not match the date glob (`*.md` matches it, but with no leading digit it sorts to the end of `ls -r`).
   - `cat docs/status.md` — `## Status log` heading retained; body is the 1-line pointer; Current position + Refresh trigger preserved verbatim except the trailing line of Refresh trigger updated per § 1.
   - **README.md fragment audit:** `cat docs/status.d/README.md` matches the 4-section spec in § 1 (purpose, fragment format, filename convention, why-fragments).
3. **Parallel-rebase simulation:** create two throwaway local branches off `origin/main`, each adds a different file under `docs/status.d/`, rebase one on the other — confirm zero conflicts (different filenames).
4. **Drift scan:** walk § 8 — confirm R16/R17/R18/R19 rows exist; confirm no stale `docs/status.md` references in CLAUDE.md prose (should still be fine — § 1 points to status.md as the entry point).
5. **Manual rehearsal of new push protocol:** dry-run on this branch — `git fetch origin && git rebase origin/main` succeeds without conflict; `git push origin HEAD` pushes only `claude/dreamy-elion-5c7be9`, not `main`.
6. **Maintenance sub-loop checklist re-read:** confirm the new sibling-work bullet + branch-rebase wording are present and runnable.

## Suggestion log

Phase 2 (P1 / P2 / P3) by `plan-reviewer` sub-agent on 2026-04-28 — 14 findings (8 P1, 2 P2, 4 P3). Findings that were N/A or factual confirmations are not listed.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Story narrative lacks an explicit FR-coverage-exempt label as seen in maint-14/15. | adopted (clarified) | Added "No FR coverage (parallel-safety / workflow improvement)." to the Story section. |
| P1 | Verification asserts `wc -l ≥ 28` but the listed counts (27 history + 1 README + 1 pre-history) sum to 29; the threshold is too lax. | adopted | Reworked counts: **30 by Phase 5** (27 dated + 1 pre-history + 1 README + 1 maint-16 own fragment); **29 at Phase 3** (no maint-16 fragment yet). Threshold is now an equality, not `≥`. |
| P1 | Push protocol stops at "if rebase reports conflicts"; no guidance for non-conflict rebase failures (lockfile, detached HEAD, network). | adopted (clarified) | Added explicit step 4 covering non-conflict failure modes: stop, report verbatim, ask before recovery. |
| P1 | `docs/status.d/README.md` content not specified; sonnet has no anchor. | adopted | § 1 now enumerates 4 required sections (purpose link, fragment format, filename convention, why-fragments). Verification adds an explicit README content audit. |
| P1 | "Status log section becomes a 2-line pointer" is ambiguous — heading retained? sub-line removed? | adopted | § 1 now contains the exact final shape of `docs/status.md` as a code block; `## Status log` heading retained, body becomes 1-line pointer, "Append-only…" sub-line removed. Refresh trigger trailing sentence updated. |
| P1 | `docs/status.d/<file>` collision case in conflict protocol mentions "call out" but provides no resolution options. | adopted (clarified) | Added two named options: (a) rename the local fragment by suffixing `-b`; (b) merge bodies if both retros documented the same outcome (rare). |
| P1 | Slice plan header says "R16 collapse (4 commits)" but lists 5; ambiguous whether plan-commit is in or out of the 4. | adopted (clarified) | Header now reads "R16 envelope (4 change-body commits + the preparatory plan commit)." Slices 2–5 explicitly tagged as R16 body 1/4–4/4; slice 1 tagged as preparatory, not counted. R16 row text in § 8 updated to make this rule explicit ("the preparatory `chore(docs): plan + P1/P2/P3 review` commit is **not** counted"). |
| P1 | FR/NFR exemption phrasing — already addressed by the new "No FR coverage" line. | (subsumed by row 1) | — |
| P2 | Privacy/PII review of migrated status-log entries. | rejected | Verbatim copy of existing public log; no IBANs, partner names, or merchant strings beyond what is already public in PR descriptions. No new PII surface. |
| P2 | CLAUDE.md § 1 sentence "Refreshed by the retro of any story…" will drift post-migration — it implies status.md is edited per retro, but retros now write fragments. | adopted | Added § 1 wording update to slice 3 ("…changes the 'Next' line; routine merges drop a fragment under `docs/status.d/`"). |
| P3 | R16 rule text doesn't clarify whether plan-commit is in or out of the 4-commit count. | adopted | (Subsumed by P1 row 7 — R16 row text rewritten to spell out the rule.) |
| P3 | Maintenance-sub-loop reword silently removes the only `git fetch` mention from the pre-planning gate. | acknowledged | Intentional — `git fetch` is now a push-time concern (§ 6.4.1 step 1). Added a parenthetical note in § 3 explaining the move; no separate fetch step is needed at planning because the pre-plan check is read-only. |
| P3 | Drift-scan verification step asserts "should still be fine" for CLAUDE.md but the § 1 sentence does drift. | adopted | (Subsumed by P2 row above — § 1 update now scheduled in slice 3.) |
| — | Other findings (epic alignment, R-tag numbering, R11/R12/R13 adherence, supply-chain absence) — factual confirmations, no action. | (no action) | Reviewer-confirmed correct. |

**Tally:** 9 adopted/clarified · 1 rejected · 1 acknowledged · 0 deferred. Every adopted item has been folded into the plan above. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 14 findings (8 P1, 2 P2, 4 P3); 9 adopted/clarified, 1 rejected, 1 acknowledged. No deferred items.
- [x] Draft PR with template sections 1–6 filled — [#85](https://github.com/xavierbriand/accounting/pull/85).
