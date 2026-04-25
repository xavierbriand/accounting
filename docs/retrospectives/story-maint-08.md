# Story maint-08 retrospective

**PR:** [#55](https://github.com/xavierbriand/accounting/pull/55)  **Closed:** pending merge  **Closes issue:** [#10](https://github.com/xavierbriand/accounting/issues/10)

Thirteenth end-to-end run of the loop; eighth story on the pre-Epic-3 maintenance track. **First maintenance story since maint-04 with real source-code changes** — the [§ 6.7 carve-out](../../CLAUDE.md) explicitly does not apply (this is the contrasting case its "zero-code-change verdict" trigger excludes). Critical-path major bump (dinero.js v1 → v2): complete API rewrite, ~30 LOC of `Money` rewritten, new currency-validation behaviour, public API preserved. Source-code delta limited to `src/core/shared/money.ts` (the only direct dinero consumer); 27 indirect consumers required zero edits — the abstraction held perfectly.

## Keep

- **Pre-planning probe + agent-delegated audit caught a factual error before code shipped.** Both the issue body (and Dependabot's deprecation notice) and my agent's first draft suggested adding `@dinero.js/currencies` as a separate package. The probe disproved this: there's no such package on npm; current v2.0.2 ships currencies as a `./currencies` subpath of the main `dinero.js` package. **The probe is the disambiguator when a documented claim conflicts with reality.** Logged as P3.1 in the suggestion log + slice-2 commit body to prevent re-derivation by future readers. **Third data point** for [maint-06 retro action A](../retrospectives/story-maint-06.md) (agent-delegated audit pattern); useful as a structured input but explicitly fallible — agents have stale-context drift just like humans.
- **Abstraction held perfectly across the v2 rewrite.** Phase-4 retro-check verified: `git diff main..HEAD -- src/ ':!src/core/shared/money.ts'` returns 0 lines. All 27 indirect consumers of `Money` (across `src/core/ledger/`, `src/core/ingest/`, `src/infra/db/repositories/`, `src/cli/commands/`, etc.) needed zero edits. **The wrapper-pattern decision from Story 1.3 paid off** — Story 1.3's choice to wrap `Dinero<number>` rather than expose it directly is what made this story a single-file rewrite instead of a 27-file migration.
- **Phase-4 retro-check found two real issues that Sonnet's self-review missed.** P3 walk caught: (a) `Money.zero` throwing in Core (CLAUDE.md § 2 violation: "Result<T, E> in Core — never throw"); (b) default currency changed `'USD'` → `'EUR'` (scope creep — unrelated to v2 migration; no caller uses the default). Sonnet's Deviations report flagged the throw as a "shim-for-tests compromise" — the surfacing was correct, but the *choice* was wrong. The shim-for-tests rule (Story 2.5 retro) requires visibility, not absolution. **Phase 4 caught the wrong-choice in one pass; one fixup commit resolved both findings.**
- **Sonnet handoff for the Phase-4 fix worked cleanly.** Three files, ~10 LOC total — borderline for the inline-Opus exception (single-file ≤ 5 LOC), but the cross-file reach (money.ts + 2 test call sites) tipped it to Sonnet delegation per CLAUDE.md § 6.1 phase 4. Sonnet's fixup landed in commit `26ec42c` with the exact diff requested; one return commit, no follow-up needed. **The "single file" criterion is doing real work** — distinguishes truly trivial fixes from cross-file refactors.
- **Existing property tests served as the v2 correctness regression net.** The `allocate`-sum-preservation fast-check property (`money.test.ts:84-99`) and the `[34, 33, 33]` Largest Remainder ordering test (`money.test.ts:54-65`) both passed unmodified post-rewrite. v2's default `allocate` strategy matches v1's. **No bug surfaced** — the existing test coverage was sufficient to catch any subtle v2-correctness regression.

## Change

- **A. Architectural violations should escalate to stop-and-ask, not flag-and-ship.** Sonnet's slice 4 added `throw new Error(...)` inside `Money.zero` to validate currency. CLAUDE.md § 2 is explicit: "Result<T, E> in Core — never throw." The operating brief § 1 says: "Structural deviations (new modules, new dependencies, different public API) require stopping and asking." A throw vs Result is a different public API; Sonnet's choice to ship-with-flag rather than stop-and-ask was a misread of the boundary between "small judgment-call" and "structural deviation". **The shim-for-tests rule in [.claude/agents/sonnet-implementer.md § 4](../../.claude/agents/sonnet-implementer.md) (Story 2.5 retro) governs visibility; it doesn't address the case where the shim itself violates a Core invariant.** Action item A below extends the rule to make the architectural-violation escalation explicit. Lands in this PR per § 7 #10.
- **B. Unnecessary scope expansions should not be made at all.** Sonnet's slice 4 also changed `Money.zero`'s default currency from `'USD'` → `'EUR'`, justifying it as "the project's primary currency". The change had zero functional necessity (v1 default was `'USD'`; both call sites pass `'EUR'` explicitly). **Pattern**: when a deviation has zero functional necessity AND zero code-quality benefit, don't make it. Reviewer habit, not a docs rule. If maint-09+ exhibits a third "unnecessary scope expansion" pattern, codify in the operating brief.
- **C. Agent-delegated audits have stale-context drift.** Maint-06 was a clean win (~30 min saved); maint-07 was modest (~7-12 min saved); maint-08 was useful but with a factual error (the `@dinero.js/currencies` mistake). Across three data points, the value-curve is consistent: structured outputs save reading time but require independent verification on every load-bearing claim. **The pattern works best when paired with a probe**: the probe is the disambiguator for any agent claim that bites at execution time. **Don't codify yet** — three data points isn't enough to set a hard "always probe agent claims" rule, and agents are still useful even with the verification overhead.

## Try

- **Codify the architectural-violation escalation rule** (Action item A). Lands this PR.
- **Watch for "unnecessary scope expansion" pattern** (Change B). Reviewer habit; codify only if a third instance emerges.
- **Track the agent-delegated-audit ROI curve.** Three data points so far: maint-06 (high), maint-07 (low), maint-08 (medium). Worth tracking in the next 1-2 dep stories to see if the curve has a floor or trends to "always useful as a starting point". If no further dep-bump stories before Epic 3, fold the observation into the next major-bump retro whenever it lands.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Extend `.claude/agents/sonnet-implementer.md` § 4 shim-for-tests rule with architectural-violation escalation: shims that violate a Core invariant (§ 2 never-throw, § 4 no-`any`) must trigger § 1's stop-and-ask, not just flag-in-Deviations. | This PR, same commit as this retro. | in same commit as this retro |
| B. Reviewer habit: catch "unnecessary scope expansion" deviations during Phase-4 review. Codify only if pattern recurs. | informal | open, passive |
| C. Track agent-delegated-audit ROI on next dep stories (currently 3 data points; trend visible but n=3). | Future maint retros. | open, passive |

## Loop metrics (thirteenth run; eighth maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs, audit clean) + 1 agent-delegated breaking-change audit (~62 s, **third data point** — useful but with one factual error caught by probe) + 1 pre-planning probe (`npm install dinero.js@^2 && npm uninstall @types/dinero.js && npm run build`) + Opus P1/P2/P3 plan review (9 findings: 6 adopted, 3 rejected, 0 deferred).
- **Implementation:** Full Sonnet flow (carve-out doesn't apply). 1 Sonnet task for slices 3–6 (4 commits: test-red + feat-green + chore(docs) + refactor-empty).
- **Phase-4 retro-check:** 3 passes (P1 / P2 / P3). **2 real findings:** P3 #1 (BLOCKER — `Money.zero` throws in Core), P3 #2 (minor — USD→EUR scope creep). Both fixed in 1 Sonnet fixup commit (`26ec42c`).
- **Issues closed by this story:** [#10](https://github.com/xavierbriand/accounting/issues/10).
- **Issues opened:** 0.
- **Total commits on branch:** 8 (plan + deps + test + feat + chore-docs + refactor-empty + Phase-4-fix + this retro).
- **Test count:** 224 → 225 (+1: new `Money.fromCents('XXX')` rejection test).
- **Diff stats:** ~30 LOC `money.ts` rewrite + 1 new test + 2 LOC across 2 test files (`.value` unwrap after fixup) + 178 LOC plan + ~95 LOC retro + small doc updates.
- **Bugs squashed:** 1 architectural violation (Phase-4 catch); 1 silent v1 behaviour gap fixed (currency validation).
- **`npm audit`:** 0 → 0 findings.
- **New runtime deps:** 0 (upgrade, not addition). **New dev deps:** 0. **Removed dev deps:** 1 (`@types/dinero.js` — v2 ships its own types).
- **Time-to-DoD:** ~10 min plan + probe + audit; ~5 min Sonnet hand-off; ~5 min Phase-4 review + fixup hand-off; ~5 min Sonnet fixup + verification; ~10 min retro. Total ~35 min.

## Carryovers resolved

- **[#10](https://github.com/xavierbriand/accounting/issues/10) (dinero.js v2 migration)** → **CLOSED by this story.**
- **[story-maint-06 retro action A](../retrospectives/story-maint-06.md) (observe agent-delegated audit on next major bump)** → **third data point landed.** Trend: high (maint-06) → low (maint-07) → medium-with-error (maint-08). Codification deferred — pattern is real but the value-floor is not yet established.
- **[Story 2.5 retro shim-for-tests rule](../../.claude/agents/sonnet-implementer.md)** → **engaged + extended.** Sonnet correctly surfaced the `Money.zero` throw as a shim. The rule's gap (silent on architectural-violation escalation) was discovered during Phase-4. Action item A extends it.
- **[Story-maint-01 retro action A](../retrospectives/story-maint-01.md) (sonnet-implementer custom-agent direct invocation)** → engaged twice (initial slices + Phase-4 fixup). Reliable.
- **[Story-maint-01 retro action B](../retrospectives/story-maint-01.md) (Opus inline-refactor < 5 LOC exception)** → considered for the Phase-4 fix; rejected because the fix touched 3 files (cross-file reach beyond the "single file" criterion). Sonnet delegation chosen instead. **The criterion did real disambiguation work.**
- **[Story-maint-04 retro action A](../retrospectives/story-maint-04.md) (commit-bundle separation rule)** → engaged. Slice 4 (feat: rewrite) and slice 5 (chore(docs)) stayed separate; no bundling.
- **[Story-maint-07 retro Change A](../retrospectives/story-maint-07.md) (carve-out spirit-vs-letter)** → didn't trigger this story (no carve-out claim made; full Sonnet flow as expected).
- **Pre-Epic-3 sequence position** → **complete.** Current state: #18 ✓ → #22 ✓ → #35 ✓ → #21 ✓ → #38 ✓ → #12 ✓ → #11 ✓ → **#10 ✓ (this PR)** → **Epic 3 (next).**
- Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config consolidation): still open.
- Issue [#43](https://github.com/xavierbriand/accounting/issues/43) (helper extraction): still open.
- Issue [#46](https://github.com/xavierbriand/accounting/issues/46) (dist-not-runnable): still open.
- Issue [#51](https://github.com/xavierbriand/accounting/issues/51) (`.claude/` to `.gitignore`): still open.
