# Story story-maint-13 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/69  **Closed:** 2026-04-26

## Keep

- **Dogfood-against-recent-plan as the verification mechanism for an agent-spec story.** The plan-reviewer agent ran against `docs/plans/story-maint-12.md` and surfaced 26 findings; 3 were genuinely new (vs the inline-Opus's 9). The dogfood test caught a real drift (`docs/architecture.md` still had `valid_from, valid_to` after maint-12 reconciled CLAUDE.md). Worth replicating: any future agent-spec story should dogfood against a recently-shipped plan/code/PR of the same kind.
- **R15 collapse extends to agent-spec stories.** Same shape as maint-12 (plan + feat + refactor + retro = 4-5 commits). The "extension by analogy" was justified per-story without codifying a new rule — appropriate restraint on rule-corpus growth.
- **Tier separation in the new agent.** plan-reviewer scans, Opus tags. Mirrors sonnet-implementer's split between mechanical implementation (Sonnet) and judgment (Opus). Keeps both agents lean.

## Change

- **Custom agent registration requires session restart.** When the dogfood test ran in the same session that committed the agent file, the harness returned `Agent type 'plan-reviewer' not found. Available agents: …`. The fallback (invoke general-purpose with the spec inline as prompt) works for verification but is not the production invocation path. **Document this in CLAUDE.md** so future stories adding new agents budget for: (a) session restart between commit and dogfood, OR (b) general-purpose-with-inline-spec as the verification path. Decision below.
- **The plan-reviewer agent over-counts findings on small/process-refresh plans.** Dogfood produced 26 findings vs inline-Opus's 9. Most agent findings were N/A flagged correctly per the spec's rule-tag coverage requirement, but the verbosity dilutes signal. Two options for the next dogfood (when a real story uses the agent in Phase 2): (a) skim findings counters to see if total > 15 → likely high-N/A noise; (b) extend the agent spec's § 5 to suppress N/A-only findings unless explicitly relevant. Defer the decision to first real-story use.
- **The `valid_from, valid_to` drift in `docs/architecture.md` slipped past three rounds of review:** Story 3.1's planning, story-maint-12's drift-scan retro item itself, and the inline-Opus Phase 2 pass on this story-maint-13 plan. Only the new agent caught it. Lesson: drift-scan-as-checklist works when run; the human/Opus reviewer is unreliable at "scan all docs/" without the explicit prompt.

## Try

- **Document the session-restart requirement** for new custom agents in CLAUDE.md § 6.3 (the section that already documents the `subagent_type` invocation). One sentence: "New `.claude/agents/*.md` files require a session restart to be registered with the Agent tool. For mid-session verification, invoke `general-purpose` with the spec file inline." Land in this PR per § 7 #10 (rule-from-retro-lands-in-same-PR).
- **First-real-story dogfood of plan-reviewer.** Story 3.2 (Predictive Transfer Engine) is the next opportunity. Track the agent's findings against the inline-Opus baseline; if ≥ 50% noise (high-N/A), refine the spec to suppress trivially-N/A rule-tag rows.
- **Codify the R15-process-refresh extension** if a third process-refresh story (e.g., a future template revamp) ships with the same 5-commit shape. Currently 2 stories (maint-12, maint-13) — not enough data to add R16 without premature codification.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No new ones** — and we *fixed* one inherited from story-maint-12 (`docs/architecture.md` validity-window drift, slice 3 commit `811977c`). The new sentence about session-restart for custom agents will land in CLAUDE.md as a Try-action follow-up before merge.
- [x] If yes, reconciled in this PR? Yes — see slice 3 (architecture.md fix) + the planned CLAUDE.md § 6.3 sentence.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `plan-reviewer` agent introduced | `.claude/agents/plan-reviewer.md` | done (slice 2, commit `ab27322`) |
| CLAUDE.md § 6.1 phase 2 invocation reference | `CLAUDE.md` | done (slice 2, commit `ab27322`) |
| Dogfood against story-maint-12 plan | manual via general-purpose with inline spec | done (this retro documents the result) |
| Reconcile `valid_from, valid_to` in `docs/architecture.md` | `docs/architecture.md` | done (slice 3, commit `811977c`) |
| Document session-restart requirement for new custom agents | `CLAUDE.md` § 6.3 | open (this PR, before merge) |
| First-real-story dogfood (Story 3.2 Phase 2) | Story 3.2 plan + retro | open (deferred to next feature story) |
| `code-reviewer` Phase 4 sub-agent | future story | open (no urgency yet) |
| Codify R15-process-refresh extension | future CLAUDE.md edit | open (third data point needed) |
