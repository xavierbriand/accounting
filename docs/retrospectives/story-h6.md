# Retrospective — story-h6 (Deterministic DoD checks: commit-subject, TODO/TBD, Gherkin↔step mapping)

Plan: [docs/plans/story-h6.md](../plans/story-h6.md) · PR [#149](https://github.com/xavierbriand/accounting/pull/149) · Closes #144

Third and final story of the 2026-07-02 token-reduction arc (after story-h4's telemetry baseline and
story-h5's context diet). Ships `harness/dod-check/` + the shared `harness/lib/story-id-matcher.ts`.

## Cost

- `metrics:story h6`: 1 attributed session — opus-4-8: input 3,528 · output 166,599 ·
  cache-creation 244,633 · **cache-read 28,412,507** tokens (cost n/a — no price entry matched this
  session's model). Cache reads are **~98.5% of all tokens** — the same context-reload dominance
  story-h4 (~97%) and story-h5 (~98%) measured, now on a far larger absolute base: this story ran
  **eight sub-agents** (3 Explore + plan-reviewer + sibling-overlap + 2 sonnet-implementer +
  code-reviewer), each reloading canon context. That number *is* the arc's thesis, dogfooded: the
  checks this story automates are a slice of reviewer prose that no longer needs to be reloaded per
  story.
- Attribution caveat (as h4/h5): the coordinator Opus session runs in the main-checkout cwd, not the
  story worktree, so it is unattributed by design; the attributed session is the worktree work.

## Loop metrics

- **Plan:** `new-story-preflight` skill; **3 Explore agents** (harness structure · drift-scan/metrics
  precedents · existing DoD/Gherkin surfaces) fed the scope; maintenance sub-loop clean (0 open PRs,
  0 high vulns, story-h6 id free). Two user decisions shaped the design: all-three-checks scope, and
  **draft-aware enforcement** (advisory while draft, strict once ready-for-review).
- **Phase 2:** plan-reviewer (**24 findings**, 15/21 rule-tags apply) + sibling-overlap (no overlap;
  surfaced **#147** as a future scanner-family sibling) launched in parallel. Notable adoptions:
  multi-shape envelope-heading parsing, `execFileSync` array-args injection guard, `story-id-unresolved`
  advisory, `gh`-failure advisory collapse, per-check TDD re-slicing.
- **Phase 3:** 1 sonnet-implementer, TDD C1–C9 (shared matcher first, metrics consumers refactored
  onto it and kept green). **Blocked at C9 on 1Password SSH signing** — environmental, not code.
- **Phase 4:** code-reviewer — **10 findings** → 6 fix-now (one `fix(harness)` commit), 1 deferred
  ([#150](https://github.com/xavierbriand/accounting/issues/150), metrics test-tree pollution), 3
  acknowledged. The tool's **own reflexive run caught two self-inflicted bugs** (pr-tbd prose
  false-positive; envelope counting the prep commit) which the review then confirmed. F3 orphan-step
  surfaced a **real pre-existing dead step def** (`categorize.steps.ts`, from story-D), removed in-story.
- **Commits:** P0 (prep) + C1–C9 + fix + retro. Behaviour-slice count (excludes the preparatory plan
  commit and this retro) = **10** — top of the R13 6–10 envelope, confirmed by the tool itself
  (`dod-check` reports empty findings on the branch).
- **Weight (reflexive):** plan_loc 361 vs ~2,424 insertions / 26 files → weight_ratio ≈ **0.15**, well
  under 1 (diff-heavy — the healthy Module-5 direction; predicted and satisfied). `metrics:loop` can't
  compute h6's ratio pre-merge (no diff_loc without a merge commit); loop.csv regen deferred to post-merge.
- **Drift scan:** `drift-scan` exit 0 on this plan; no new CLAUDE.md § 8 R-tag introduced, no
  contradictions — the story automates existing rules (DoD 4/5/6, R5), it does not add one.

## Keep

- **Dogfooding caught the tool's own bugs before merge.** Running `dod-check` reflexively on its own
  branch surfaced the pr-tbd prose false-positive and the envelope-counts-the-prep-commit bug — the
  story's PR *failing its own check* was the signal. A tool that gates the workflow must be run
  against the very PR that adds it; the reflexive verification step earned its place.
- **Draft-aware enforcement dissolved the "can't pass mid-flight" tension.** Advisory-while-draft /
  hard-when-ready let envelope + pr-tbd be strict at the merge gate without blocking in-progress
  pushes. The user's design call, validated by the story needing it on day one (an 11-commit branch
  that legitimately sits at 10 behaviour slices).
- **The new check paid for itself immediately.** F3 orphan-step found genuine dead code predating the
  story. Existence-mapping checks justify themselves by surfacing real debt, not hypothetical drift.

## Change

- **Envelope counting semantics should have been pinned in the plan, not discovered at Phase 4.** The
  plan said "count commits carrying the story id" without specifying the prep/retro exclusion; the
  reflexive run then flagged the story's own count. A *rule-enforcing* tool's own counting rules need
  to be exact up front — the ambiguity cost a Phase-4 correction.
- **A post-green behaviour fix was bundled under a `chore:` subject (F8, `c0c9198`).** The
  `TODO_MARKER → TODO_COMMENT_MARKER` precision fix — a real false-positive correction to an
  already-"green" C6 — landed silently inside the C9 wiring commit instead of its own visible
  red→green slice (R10/R12). When a green commit's behaviour is later corrected, surface it as its own
  slice with an honest subject.
- **1Password SSH signing stalled three separate commits** (P0-era, C9, and the Phase-4 fix), each
  needing a user unlock + retry. Environmental, not code — but a recurring mid-session agent lock is
  worth pre-flighting (confirm the signing agent is live before a long implementation handoff).

## Try

- **Reference `harness/dod-check` from CLAUDE.md § 7 (DoD) and § 6.1 (Phase 4)** so future stories
  know DoD-4/5/6 and R5 are now machine-checked — held out of this PR to keep scope; small follow-up.
- **Route `dod-check --json degraded[]` into the metrics loop** so a degraded `gh`/`git` state during
  a CI or agent run is visible in telemetry, not just stderr.
- **Re-measure per-story cache-read on the next story** that runs its review agents against the
  now-automated checks (continues h5's open Try). This story's 28.4M cache-read is a fresh high-water
  baseline; the arc's success criterion is fewer reviewer tokens at an unchanged Phase-4 findings rate.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Metrics integration tests pollute real `docs/metrics/` tree | [#150](https://github.com/xavierbriand/accounting/issues/150) | open |
| `test:quiet` regression guard — candidate `dod-check` scanner-family member | [#147](https://github.com/xavierbriand/accounting/issues/147) | open |
| Reference `dod-check` from CLAUDE.md § 6/§ 7 | future story | open |
