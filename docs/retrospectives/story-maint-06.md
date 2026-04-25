# Story maint-06 retrospective

**PR:** [pending — will be linked after open](#)  **Closed:** pending merge  **Closes issue:** [#12](https://github.com/xavierbriand/accounting/issues/12)

Eleventh end-to-end run of the loop; sixth story on the pre-Epic-3 maintenance track. Second pure-dependency story with a zero-code-change verdict against the stack — and the second occurrence of the [story-maint-05](docs/retrospectives/story-maint-05.md) "Phase 3 collapse + rhythm skip" pattern, which triggered codifying it as the new [CLAUDE.md § 6.7 sidebar](../../CLAUDE.md). Diff: 1 LOC in [package.json](../../package.json), ~150 LOC of regenerated lockfile, 214 LOC plan doc, 4 LOC of CLAUDE.md edits, 0 LOC in [src/](../../src/) or [tests/](../../tests/) or [eslint.config.js](../../eslint.config.js). Bumps ESLint 9.39.2 → 10.2.1 without changing any behaviour.

## Keep

- **Agent-delegated breaking-change audit was a clean win.** Used [`general-purpose` agent](../../CLAUDE.md) to fetch ESLint 10's CHANGELOG + migrate-to-10.0.0 guide and produce a verdict-style report scoped to *our exact 10-line config*. Returned in ~67s with: 3 new `recommended` rules (probe-required), Node ≥20.19 (CI floats to ≥20.19 since Apr 2025), every other migration item N/A. Compared to manually reading two release pages and cross-walking against our stack, this was easily 30+ minutes saved. **Lesson generalises:** when a major-bump issue body lacks a pre-built breaking-change audit (issue #12 didn't include one, unlike issue #38), delegate the audit to an agent before running the probe — the agent's report seeds the plan's § 4 table directly. Adding to personal plan-writing checklist; not codifying yet (one data point).
- **Pre-planning probe pattern, third application.** Same shape as [maint-01](../plans/story-maint-01.md) and [maint-05](../plans/story-maint-05.md): install + lint + build + test + audit *before* the plan is even committed. Probe verified the agent's verdict (3 new rules don't trigger; lockfile peer-warnings clean) before any plan-text claim was made. **Three data points; pattern is durable** — the [§ 6.7 sidebar](../../CLAUDE.md) explicitly bakes this in as part of the codified shape.
- **CLAUDE.md edit landed cleanly in the triggering PR.** Maint-05 retro action item B said "codify in § 6.7 only if it does [reproduce]". This story reproduced; the edit landed as commit 4 of this PR per [CLAUDE.md § 7 item #10](../../CLAUDE.md). Also patched DoD § 7 item #5 to reference the carve-out so a strict rhythm reader doesn't trip. **The "retro action items land in the next triggering PR" loop closed in real-time** — no orphaned action item left dangling across stories.
- **No mid-story disruption.** Unlike maint-05 (which had #45 + #47 + #49 land on main mid-flight, forcing two rebases + a rename), maint-06 ran on a quiet main. Counter-evidence to maint-05's claim that mid-story disruption is the new normal. **Sample size still small; can't generalise.**
- **Suggestion log right-sized at 9 entries.** No filler, no over-deferral. Two clean rejections (`@eslint/js` direct-pin, Node version pin) — both with structural reasons that don't beg "file a follow-up issue".

## Change

- **A. Initial draft of the suggestion log hedged on rejections.** First pass had `@eslint/js` direct-pin marked "rejected (this story)" with "**File as follow-up issue** if X recurs". That's not a rejection — it's a conditional defer pretending to be a rejection. Cleaned up in a single re-pass to drop the hedging. **Lesson:** if a suggestion is "we won't do it now but might later if X happens", that's still a rejection — the "X happens" trigger creates a fresh suggestion in the future, not a tracked-deferred one. Don't preemptively log future scope. Personal-checklist note, not a docs change.
- **B. The CLAUDE.md edit's "exemplars" line will go stale.** Currently lists maint-05 + maint-06. Each future story that hits the carve-out adds itself or doesn't — no rule for which. **Don't fix yet** — wait until 4+ stories hit the pattern, then drop the exemplar list and replace with a one-line "see retrospectives matching pattern" pointer or similar. Single data point of staleness risk; not worth a fix now.

## Try

- **Agent-delegated breaking-change audit as a default for major dep bumps.** Maint-06 saved ~30 min via agent delegation (vs maint-05's manual cross-walk). One data point. **If maint-07 or another major bump reuses the pattern with similar gains**, propose adding to the [CLAUDE.md § 6.7](../../CLAUDE.md) sidebar: "When the issue body lacks a pre-built breaking-change audit, delegate to a `general-purpose` agent before running the probe." Not yet — wait for the second data point (per the maint-05 → maint-06 codification cadence).

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Observe whether the next major dep-bump story benefits from agent-delegated breaking-change audits at similar magnitude (~30 min saved). If yes, propose the § 6.7 addition. | Retro of next major-bump story (likely [#11](https://github.com/xavierbriand/accounting/issues/11) — TypeScript 6, more complex than ESLint or `@inquirer/prompts`). | open, passive |
| B. Watch the CLAUDE.md § 6.7 "exemplars" line for staleness — drop the explicit list and replace with a pattern pointer once 4+ stories cumulatively hit the carve-out. | Next pure-dependency major bump after this one. | open, passive |

## Loop metrics (eleventh run; sixth maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs; 1 newly-opened deferred-suggestion issue [#51](https://github.com/xavierbriand/accounting/issues/51), out of scope for this story; `npm audit` 0 findings) + 1 agent-delegated breaking-change audit + 1 pre-planning probe + Opus P1/P2/P3 plan review (9 findings: 7 adopted, 2 rejected with reasons, 0 deferred).
- **Implementation:** Phase 3 collapsed into the pre-planning probe per the now-codified [CLAUDE.md § 6.7 carve-out](../../CLAUDE.md). No Sonnet invocation. 5 commits pre-retro (plan / deps / empty-refactor / CLAUDE.md edit / [retro = this commit]).
- **Phase-4 retro-check:** _pending — runs after dep-bump commit lands._
- **Retro fixes:** _pending._
- **Issues closed by this story:** [#12](https://github.com/xavierbriand/accounting/issues/12).
- **Issues opened:** 0 (two suggestions cleanly rejected; neither warranted a follow-up issue).
- **Total commits on branch:** 5 (plan / deps / empty-refactor / CLAUDE.md / retro).
- **Test count:** 217 → 217 (unchanged; no new tests, no modified tests).
- **Diff stats:** 1 LOC prod (package.json) + ~150 LOC regenerated lockfile + 214 LOC plan + 4 LOC CLAUDE.md + ~80 LOC retro + 0 LOC src/ + 0 LOC tests/ + 0 LOC eslint.config.js.
- **Bugs squashed:** 0 (hygiene story).
- **`npm audit`:** 0 → 0 findings. Repo remains at the fully-clean state established by [PR #49](https://github.com/xavierbriand/accounting/pull/49) + [PR #48](https://github.com/xavierbriand/accounting/pull/48) (story-maint-05).
- **New runtime deps:** 0. **New dev deps:** 0 (upgrade, not addition).
- **Time-to-DoD:** ~10 min agent-audit + probe; ~5 min plan/review/commit; ~5 min CLAUDE.md edit + commit; ~5 min retro. Total ~25 min — slightly faster than maint-05's ~30 min, mostly from no mid-story disruption.

## Carryovers resolved

- **[#12](https://github.com/xavierbriand/accounting/issues/12) (`ESLint 9 → 10` migration)** → **CLOSED by this story.**
- **[Story-maint-05 retro action B](../retrospectives/story-maint-05.md) (codify the major-bump-with-zero-code-change subcase if it reproduces)** → **CLOSED by this story.** [CLAUDE.md § 6.7](../../CLAUDE.md) gained the sidebar; [DoD § 7 item #5](../../CLAUDE.md) patched to reference the carve-out.
- **[Story-maint-05 retro action A](../retrospectives/story-maint-05.md) (front-load breaking-change audits in dep-issue bodies)** → **partially carried.** Issue [#12](https://github.com/xavierbriand/accounting/issues/12) did NOT include a breaking-change audit (predates the maint-05 retro). Compensated for via agent-delegated audit (this retro § Keep). Future major-bump issues should include the audit to skip the agent step.
- **[Story-maint-01 retro action A](../retrospectives/story-maint-01.md) (sonnet-implementer custom-agent direct invocation)** → didn't trigger (Phase 3 collapsed; no Sonnet task). Rule remains dormant-and-valid.
- **[Story-maint-01 retro action B](../retrospectives/story-maint-01.md) (Opus inline-refactor < 5 LOC exception)** → didn't trigger (no refactor needed). Rule remains valid.
- **[Story-maint-02 retro Change B](../retrospectives/story-maint-02.md) (safeguard-removal rule borderline)** → didn't trigger (no code change, nothing to safeguard-remove). Rule remains in observation.
- **Pre-Epic-3 sequence position** → advanced one step. Current state: #18 ✓ (maint-01) → #22 ✓ (maint-02) → #35 ✓ (maint-03) → #21 (maint-04, in flight as [PR #50](https://github.com/xavierbriand/accounting/pull/50)) → #38 ✓ (maint-05) → **#12 ✓ (maint-06, this PR)** → [#11](https://github.com/xavierbriand/accounting/issues/11) → Epic 3.
