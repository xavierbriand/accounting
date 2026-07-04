# Retrospective — story-h9 (backlog-refiner agent + /refine-backlog command, propose-only)

Plan: [docs/plans/story-h9.md](../plans/story-h9.md) · PR [#169](https://github.com/xavierbriand/accounting/pull/169) · Issue #161 (F8)

The issue tracker had stopped being the coordination layer (health-check F8): stale umbrella checkboxes, tripwires mis-armed against events that already fired, deferrals with no `deferred-suggestion` label, and a deferral queue frozen 66 days with zero closures. This story shipped a **propose-only** `backlog-refiner` sub-agent + `/refine-backlog` command: six read-only analysis passes → a tagged proposed-actions table the user approves, with every tracker write happening in the main session, never the agent. Its first run was the acceptance test — and it independently surfaced all 9 items of the health-check reset-inventory fixture, plus bonus findings.

## Loop metrics

- **Lane:** first story to **self-select** a lane (h8 shipped the lanes but ran the full process itself). Landed **Reduced** — but not by the rulebook as written: the R26 table put `.claude` specs in **Light**. The user overrode mid-planning (agents/commands/skills are harness → Reduced), and the story codified that override into R26 in the same PR (DoD #10). So h9 both *used* a lane and *rewrote the lane trigger it was routed by*.
- **Commits:** prep + **6 body slices** (incl. the R11/R20 empty refactor) + 1 Phase-4 fix + retro. 6 body slices sits exactly on R13's floor — flagged in the plan itself: a spec-only Reduced story is genuinely light on behaviours, so the 6–10 envelope is a loose fit. Data point for whether Reduced needs a spec-story sub-envelope (see Change).
- **Weight:** plan ≈ 130 LOC vs shipped non-process diff (two specs + 1 doc line + 4 CLAUDE.md lines) ≈ 210 LOC → weight_ratio < 1.0. Not ceremony-heavy despite being spec-only, because the two agent/command specs are the actual product.
- **Plan:** `new-story-preflight` + 2 parallel Explore agents (agent-spec house style + command/health-check appendix). Clean preflight (0 vulns, 0 open PRs, id free).
- **Phase 2:** `sibling-overlap` only (Reduced drops plan-reviewer) + a manual CLAUDE.md cross-ref audit. 6 findings, **2 ADOPT / 4 ACKNOWLEDGE / 0 DEFER** → no follow-up issue.
- **Phase 4:** `code-reviewer` + `sibling-overlap` in parallel. code-reviewer: **0 P1 / 0 P2 / 8 P3 (2 soft)** → 1 fix-now (Never-list hardening), 3 acknowledged. sibling-overlap: no change since Phase 2.
- **Acceptance:** the first `/refine-backlog` run surfaced all 9 reset-inventory items **plus** the § 8 numbering hole between R21 and R23 (a bonus finding directly useful to h10's grep-driven rule walk).

## Keep

- **The propose-only split is the right shape for an agent that touches shared state.** The agent reads and proposes; the human tags; the main session writes. It mirrors the discipline already used for the glossary/model-note files (agents propose, user owns) and means a mis-scoped finding costs a rejected table row, not a wrong tracker mutation. The Never list names every mutating `gh` subcommand explicitly (hardened at Phase 4) rather than trusting a catch-all — the exact `sibling-overlap` gap (F5/F9) the story set out to avoid.
- **`gh`-CLI-only, no MCP — vindicated within the session.** The plan chose `gh` over the GitHub MCP to avoid the undeclared-grant smell; mid-story, story-maint-20 *removed* the MCP server entirely and the earlier MCP calls in this very session had already failed with "Bad credentials." A spec that had reached for MCP would have shipped broken. Depending on the least-privileged, most-stable tool paid off immediately.
- **The acceptance fixture worked exactly as a fixture should.** The health-check appendix pre-committed 9 concrete items the first run *must* surface. That turned an otherwise-unfalsifiable "the agent is good" into a pass/fail check — and the run cleared all 9 by method (checkbox-vs-child-state, retro cross-reference, age computation), not by hardcoding the numbers. Writing the acceptance inventory *before* the agent existed is what made the agent testable.

## Change

- **A spec-only story strains the Reduced envelope.** R13's 6–10 commit target assumes behaviours to slice; a two-file prompt story has to pad to reach 6 (here: an empty refactor + a naturally-separable command commit). It hit the floor honestly, but the fit is loose. **Lesson:** the lane taxonomy now routes `.claude` specs to Reduced (correct — they need review), but the *commit envelope* Reduced inherits (R13) was written for infra code. A future story could give spec-only Reduced stories a lighter envelope without dropping their review rigor. Noted, not acted on — one data point.
- **The lane rule was wrong at the moment it was first exercised.** h8 wrote the R26 table classifying `.claude` specs as Light; the very first story to self-select found that wrong and had to fix the rule while using it. That is the healthy case (the rule met reality fast), but it means h8's lane table shipped an untested classification. **Lesson:** a taxonomy row with no story to exercise it is provisional — the h8 retro's "lanes not yet self-applied" caveat was load-bearing, and h9 is where the paper rule met the road.

## Try

- **When h10 adds its `.claude/*.md` drift-scan (grep-driven rule walk), have it catch the numbering hole this run surfaced.** The refiner noticed § 8 jumps R21 → R23 with no row between them, so any `R1..R2N` range walk silently skips the missing number. h10 (#162) owns single-sourcing the rule system; a scan that asserts contiguous R-numbering (or explicitly records intended gaps) would have caught this mechanically. Feed the finding forward. (This retro deliberately avoids writing the missing tag id as a bare token — drift-scan's Check A would read it as an undocumented-rule reference.)
- **Consider a cadence for the maintenance-sub-loop `/refine-backlog` line.** It shipped as "recommended, not required every sub-loop" (code-reviewer soft finding). An always-optional hygiene step risks the same decay (F8) the story exists to fix. A future story could tighten it to "every Nth sub-loop" once there's data on how fast the tracker re-drifts after the first reset.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Execute the approved tracker reset (first `/refine-backlog` proposed-actions) | post-merge + session restart, user-gated | open |
| Annotate/close #161 with the shipped `backlog-refiner`/`/refine-backlog` names | at merge | open |
| R21→R23 numbering-gap check in the `.claude/` drift-scan | [story-h10 (#162)](https://github.com/xavierbriand/accounting/issues/162) | open |
| Spec-only Reduced commit-envelope fit; `/refine-backlog` cadence | future harness story (passive observation) | open |
