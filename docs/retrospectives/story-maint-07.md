# Story maint-07 retrospective

**PR:** [pending — will be linked after open](#)  **Closed:** pending merge  **Closes issue:** [#11](https://github.com/xavierbriand/accounting/issues/11)

Twelfth end-to-end run of the loop; seventh story on the pre-Epic-3 maintenance track. Critical-path major bump (TypeScript 5.9.3 → 6.0.3). First story to apply the [§ 6.7 carve-out](../../CLAUDE.md) **by analogy** rather than literally — the verdict was "near-zero-code-change" (4 LOC tsconfig + 5 LOC test-extensions), not the strict zero-code-change shape that maint-05 and maint-06 hit. Source-code delta: **0 lines** (`git diff main..HEAD -- src/` empty). 224-test suite passes unmodified.

## Keep

- **Agent-delegated breaking-change audit produced its second useful report.** Spent ~3 min in the background while my probe ran; came back with a structured table of v6 breaking changes mapped to file:line evidence. Estimated time saved vs manual cross-walk of TS 6 release notes: **~7-12 min** (smaller than maint-06's ~30 min because TS 6's release notes are denser and more obvious — the deprecations are a short list, not a 50-PR migration guide). **Net positive ROI but smaller than expected.** Worth keeping the pattern; not yet worth codifying — see Try item below.
- **Pre-planning probe + agent verdict converged on the same answer with one informative disagreement.** Probe found the same 2 deprecation errors the agent predicted (baseUrl, moduleResolution=node10). Agent additionally recommended `"types": ["node"]` for forward-safety; probe proved unnecessary at TS 6.0.3 (skipLibCheck + auto-discovery of `@types/node` cover Node globals). **Lesson:** agent verdicts are useful inputs but probe wins on disagreements. The plan's suggestion log P3.3 documented the rejection with the probe evidence — clean record.
- **§ 6.7 carve-out applies cleanly by analogy to "near-zero-code-change" stories.** The carve-out's literal trigger is "zero-code-change verdict against a pre-planning probe". This story is "5-LOC mechanical-only changes verified by probe". The carve-out's *spirit* (Phase 3 collapse, no Sonnet ceremony for a tiny diff with no TDD red→green available) applies cleanly. Slice sequence used: `chore(docs)` plan + `chore(deps)` bump + `chore(tsconfig)` + `test(core)` extensions + `refactor: empty slot` + `chore(retro)`. **Six commits, all single-concern, all pre-verified by the probe.** No round-trips, no follow-up issues.
- **Pre-existing test-import inconsistency caught by the bump.** Two test files had extension-less `@core/*` imports that loose `node` resolution tolerated. Loose resolution masked the inconsistency for ~25 stories of accumulated test-writing. The TS 6 bump's stricter `nodenext` resolution surfaced it as a hard error. **Net hygiene improvement** that wouldn't have surfaced without the bump.
- **Three rules from prior maint retros co-existed without conflict.** (i) Pre-planning probe pattern (maint-01, -05, -06) — third application, durable. (ii) §6.7 carve-out (codified in maint-06) — applied by analogy. (iii) Inline-refactor < 5 LOC exception (maint-01 action B) — didn't trigger (no Phase 4 refactor needed).

## Change

- **A. The carve-out's spirit-vs-letter ambiguity is now visible.** The §6.7 sidebar text says *"breaking-change audit produces a zero-code-change verdict"* — strictly, this story doesn't qualify (it produced a 9-LOC delta). I applied it by analogy, which works for this case but creates a precedent: how much code change is "near-zero-enough" to skip Sonnet? **No fix this PR** — one data point doesn't establish a threshold. **Try-item to watch:** if a future major bump produces a 20-LOC, 50-LOC, or 100-LOC delta and we're tempted to apply the carve-out by analogy again, that's the moment to codify a numeric threshold (e.g., "≤ 10 LOC of mechanical changes outside `src/`") or split the carve-out into "zero-code" and "near-zero-code" variants.
- **B. Agent-delegated audit's value scaled inversely with release-note density.** Maint-06's ESLint 10 had a long, mixed-bag changelog (rule changes interleaved with internal refactors); the agent's structured filter saved real time. This story's TS 6 had a short, well-organized deprecation list; manual reading would have been close in time. **Lesson:** delegate when the issue body has no audit AND the changelog is long/dense; otherwise, do it inline. Not codifying — reviewer judgment.

## Try

- **Codify agent-delegated audit pattern in §6.7 only after a third successful application** with clear ROI. Current evidence: maint-06 (~30 min saved) + maint-07 (~7-12 min saved). One more data point with similar-or-better savings → codify. The next critical-path major bump is [#10 dinero.js v2](https://github.com/xavierbriand/accounting/issues/10), which has a "complete rewrite, new API" warning — agent delegation should pay off there, but that's contingent on the issue actually triggering the carve-out (it likely won't — dinero v2 is a real code-change story, not a near-zero-code-change one).
- **Lint rule for extensionless relative imports** (Suggestion log P3.7). Two test files had `.js`-less `@core/*` imports for ~25 stories. A typescript-eslint or eslint-plugin-import rule (`import/extensions` or similar) would catch this class of inconsistency in CI. Out of scope for this story; if maint-08 or beyond reproduces extension inconsistency, file as a follow-up.
- **Watch the carve-out's threshold question** (Change A). If 2-3 future stories apply the carve-out by analogy, propose a threshold numeric in §6.7.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Observe whether [#10 dinero v2](https://github.com/xavierbriand/accounting/issues/10) benefits from agent-delegated audit; if yes, propose §6.7 codification (third data point). | Retro of #10 (or whichever next major bump). | open, passive |
| B. Watch the §6.7 carve-out's spirit-vs-letter ambiguity. If 2-3 stories apply by analogy with progressively larger LOC deltas, codify a threshold. | Future maint retros. | open, passive |
| C. Consider eslint rule for extensionless `@core/*` relative imports. | Reviewer habit; file as deferred-suggestion if pattern recurs. | informal |

## Loop metrics (twelfth run; seventh maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs, audit clean) + 1 agent-delegated breaking-change audit (~3 min, parallel with probe) + 1 pre-planning probe + Opus P1/P2/P3 plan review (7 findings: 5 adopted, 2 rejected with reasons, 0 deferred).
- **Implementation:** Phase 3 collapsed into the pre-planning probe per [§ 6.7 carve-out](../../CLAUDE.md), applied by analogy. No Sonnet invocation. 5 commits pre-retro: plan + deps + tsconfig + test-extensions + empty-refactor.
- **Phase-4 retro-check:** 3 passes (P1 / P2 / P3). Zero findings. `git diff main..HEAD -- src/` returns 0 lines (scenario 4 verified). Build + lint + 224 tests green.
- **Retro fixes:** 0 (no blockers).
- **Issues closed by this story:** [#11](https://github.com/xavierbriand/accounting/issues/11).
- **Issues opened:** 0.
- **Total commits on branch:** 6 (plan + deps + tsconfig + test-extensions + empty-refactor + this retro).
- **Test count:** 224 → 224 (unchanged; no new tests, no modified tests beyond the 5 import-extension lines).
- **Diff stats:** 4 LOC tsconfig (3 add, 4 del net 7 churn) + 5 LOC test-extensions (3 add, 3 del across 2 files) + 1 LOC package.json + ~5 LOC regenerated lockfile + 164 LOC plan + ~110 LOC retro + 0 LOC src/.
- **Bugs squashed:** 1 latent test-import inconsistency caught by NodeNext.
- **`npm audit`:** 0 → 0 findings.
- **New runtime deps:** 0. **New dev deps:** 0 (upgrade, not addition).
- **Time-to-DoD:** ~3 min agent-audit + probe; ~5 min plan; ~5 min slice commits; ~5 min retro. Total ~20 min — fastest maintenance story to date (ties or beats maint-06).

## Carryovers resolved

- **[#11](https://github.com/xavierbriand/accounting/issues/11) (TypeScript 6 migration)** → **CLOSED by this story.**
- **[story-maint-06 retro action A](../retrospectives/story-maint-06.md) (observe agent-delegated audit on next major bump)** → **engaged.** Second data point. Useful but smaller savings than maint-06; codification deferred to a third confirmation (see Try item).
- **[story-maint-06 retro action B](../retrospectives/story-maint-06.md) (CLAUDE.md exemplars line staleness)** → **didn't trigger yet** — exemplars list still has 2 entries (maint-05, maint-06). This story is a third *adjacent* example (carve-out by analogy, not literally). Could add to exemplars or wait for a third literal-zero-code-change example.
- **[story-maint-06 retro action C](../retrospectives/story-maint-06.md) (worktree-parent-aware probe checklist)** → **didn't trigger.** This story's probe ran in the primary clone, not under `.claude/worktrees/`. Rule remains in observation.
- **[story-maint-05 retro action B](../retrospectives/story-maint-05.md) (front-load breaking-change audits in dep-issue bodies)** → **partially carried.** Issue [#11](https://github.com/xavierbriand/accounting/issues/11) did NOT include a breaking-change audit in its body — predates the maint-05 retro. Compensated for via agent-delegated audit (this retro § Keep). Future major-bump issues should include the audit upfront.
- **Pre-Epic-3 sequence position** → advanced one step. Current state: #18 ✓ → #22 ✓ → #35 ✓ → #21 ✓ → #38 ✓ → #12 ✓ → **#11 ✓ (this PR)** → [#10](https://github.com/xavierbriand/accounting/issues/10) (dinero v2) → Epic 3.
- Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config consolidation): still open. This story didn't touch vitest.
- Issue [#43](https://github.com/xavierbriand/accounting/issues/43) (helper extraction): still open.
- Issue [#46](https://github.com/xavierbriand/accounting/issues/46) (dist-not-runnable): still open. Not exacerbated by this story (we didn't touch the `dist/` invocation surface).
- Issue [#51](https://github.com/xavierbriand/accounting/issues/51) (`.claude/` to `.gitignore`): still open. Not bothered by this story — the eslint config already excludes `.claude`.
