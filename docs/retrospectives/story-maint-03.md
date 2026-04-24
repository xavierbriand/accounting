# Story maint-03 retrospective

**PR:** [#45](https://github.com/xavierbriand/accounting/pull/45)  **Closed:** pending merge  **Closes issue:** [#35](https://github.com/xavierbriand/accounting/issues/35)

Third story on the pre-Epic-3 maintenance track. Tenth end-to-end run of the loop overall. A proper bug fix this time (not hardening): ingest against an uninitialised or non-existent DB used to print a raw Node stack trace; now exits 2 with a friendly hint. ~30 LOC of production code + two new test files (9 LOC helper + 4 LOC wire-up + 78 LOC helper test + 74 LOC subprocess test). Test count 213 → 217 (+4). **First subprocess integration test in the repo** — the new pattern is worth documenting separately.

## Keep

- **Sonnet's deviation handling was textbook.** The plan specified `node dist/cli/program.js` for the subprocess test; Sonnet tried it, hit `ERR_MODULE_NOT_FOUND` on the `@core/*` path alias, investigated the root cause (`tsc` doesn't rewrite path aliases in emitted output), chose the working alternative (`tsx src/cli/program.ts` — which is already how `npm run ingest`/`npm run migrate` invoke the CLI), documented the deviation with full root-cause analysis, and proposed a follow-up ([#46](https://github.com/xavierbriand/accounting/issues/46)). **This is exactly the "safeguard-removal rule" pattern from maint-01 retro generalized to tooling substitutions: when the plan's named tool doesn't work, the Deviation names (a) what happened, (b) why, (c) what the alternative would have been, (d) follow-up scope.** Zero round-trips needed; I approved the deviation at review time.
- **Pre-flight check at the composition root is the right architecture.** The P3 plan-review finding (helper stays in `src/infra/`, not a Core port) held: `PRAGMA user_version` is inherently coupled to `better-sqlite3.Database`; abstracting it via a port would have been ceremony for no benefit. Composition root (`program.ts`) runs the check; repository constructors stay unchanged. Future commands (reconcile, transfer, etc.) just call `assertMigrated` the same way.
- **Subprocess test earned its complexity.** 450 ms per run (vs ~90 ms in-process) because `tsx` transpiles each invocation. Acceptable cost — it's the only way to prove the user-visible stderr/exit contract end-to-end. The helper-level integration tests prove the logic; the subprocess test proves the wire-up. Both layers pull their weight.
- **Four rules from maint-01/02 retros continued to function without conflict:**
  1. `subagent_type: "sonnet-implementer"` direct invocation (maint-01 E) — worked first try.
  2. Inline-refactor < 5 LOC exception (maint-01 B) — didn't trigger (no refactor needed).
  3. Safeguard-removal rule (maint-01 A) — generalized here to tooling substitution; Sonnet's deviation write-up implicitly followed the pattern even though the rule's trigger text focuses on defensive constructs.
  4. Env-var fixture red-proof (maint-02 A) — N/A this story (no env stubbing).
- **Plan-to-retro scope drift was zero.** Plan said 5 slices + optional refactor; Sonnet delivered exactly that. Plan estimated 216 tests post-change (213 + 3 helper); actual is 217 (213 + 3 helper + 1 subprocess = 217). One off-by-one in my plan's count — trivial.

## Change

- **A. Plan-phase tooling-invocation verification.** My plan specified `node dist/cli/program.js` for the subprocess test without checking whether `dist/` is actually runnable. A 10-second `grep npm package.json` for `ingest`/`migrate` scripts would have surfaced that the repo invokes via `tsx src/cli/program.ts`, not via `node dist/`. Sonnet caught it; next time I should pre-check. **This mirrors maint-02 Change A (env-var fixture red-proof).** Both findings are "plan made an assumption about runtime/tooling behaviour without verifying" — pattern worth naming. **Not a docs rule yet** — reviewer habit. If this pattern recurs in maint-04 or a later story, codify in the planning cheat sheet (§ 6.1 phase 1?) as "Plans that name a specific runtime invocation, env-var value, or build artifact must verify it against repo reality before committing the plan."
- **B. `dist/` is not a runnable artifact.** Pre-existing condition the story surfaced but didn't introduce. Not a bug in this PR; filed [#46](https://github.com/xavierbriand/accounting/issues/46). Worth noting as retro context because it changes a mental-model assumption about the repo: **`npm run build` type-checks and emits; it does not produce a runnable CLI**. Anyone picking up a subprocess-test story in future should expect `tsx`-based spawning until #46 resolves.
- **C. Commit `ace92ee` bundled 3 test cases into one TDD red commit.** The plan listed three separate test cases (a/b/c) for `assertMigrated`. Sonnet's return report listed them as three separate lines under the same commit SHA. Looking at the git log: it's genuinely one commit with all three tests added simultaneously. This is acceptable per § 6.4 ("Target 6–10 commits per story; only split further when a slice's failing test genuinely cannot turn green without an intermediate `feat:` step") — all three tests fail for the same reason (helper doesn't exist) and turn green together (once the helper lands). But the return report's presentation was confusing (same SHA ×3). **Not a rule change; just a noticed presentation quirk.** Sonnet could have grouped the three bullets under a single sequence line for clarity: "`chore(tooling): add 3 integration tests for assertMigrated` · ace92ee · proved helper must exist + returns right shape + is stable". No action required — mental note for future report-reading.

## Try

- **Plan-phase "runtime invocation / env / build-artifact" verification step.** When a plan specifies ANY of: a subprocess command, a specific env-var value in a test, a build-artifact path, a tooling binary (`tsx`, `tsc`, `eslint`, etc.) — do a 10-second grep of `package.json` / existing tests to confirm the invocation matches repo reality. If maint-04 or similar surfaces another "plan-assumed-the-wrong-thing" finding, promote to a formal Plan-agent stress-test item or a § 6.1 phase 1 checklist line. Two data points (maint-02 B + maint-03 A) are enough to see a pattern but not enough to codify; want a third.
- **Subprocess tests as a recognized category.** Now that the pattern exists ([uninit-db-hint.test.ts](../blob/main/tests/integration/cli/uninit-db-hint.test.ts)), future stories that need user-visible stderr/exit-code proof can copy it. Worth noting in [docs/engineering-standards.md](../blob/main/docs/engineering-standards.md) or the testing cheat sheet at some point — but only if a second subprocess test lands and the pattern is clearly durable.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Personal plan-writing checklist — verify runtime-invocation/env-var/build-artifact assumptions against `package.json` + existing tests before committing a plan. | Reviewer habit; not docs. | informal, tracked by reference to this retro + maint-02 retro |
| B. Follow-up [#46](https://github.com/xavierbriand/accounting/issues/46) — make `dist/` runnable (tsc-alias / `#imports` / bundler). | Filed. | open |
| C. Observe whether subprocess tests recur; if a second lands cleanly, codify the pattern in engineering-standards. | Passive observation. | open |

## Loop metrics (tenth run; third maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs, audit unchanged) + Opus P1/P2/P3 plan review (4 findings: 2 adopted / 2 rejected).
- **Implementation:** 1 Sonnet task (5 commits of 5 planned; empty refactor per § 6.4 sanction). **1 deviation** — subprocess runner swapped from `node dist/` to `tsx src/` — documented with root cause and follow-up.
- **Phase-4 retro-check:** 3 passes (P1 / P2 / P3). Zero blockers. Gherkin coverage verified: 3 scenarios, 2 directly covered, 1 (migrate-still-works) covered by existing migrator tests per rejected P1 suggestion.
- **Retro fixes:** 0 (no refactor needed, no blockers).
- **Issues closed by this story:** [#35](https://github.com/xavierbriand/accounting/issues/35).
- **Issues opened:** 1 ([#46](https://github.com/xavierbriand/accounting/issues/46)) — dist-not-runnable follow-up.
- **Total commits on branch:** 7 (1 plan + 5 implementation + this retro).
- **Test count:** 213 → 217 (+4: 3 helper unit/integration + 1 subprocess integration).
- **Diff stats:** 13 LOC helper + 8 LOC program.ts + 78 LOC helper test + 74 LOC subprocess test + 173 LOC plan + ~95 LOC retro.
- **Bugs squashed:** 1 (#35 — the raw-SqliteError stack trace is gone; users get a clean hint).
- **New runtime deps:** 0. **New dev deps:** 0.
- **New test pattern introduced:** subprocess integration test via `tsx src/cli/program.ts`.
- **Time-to-DoD:** one session, ~45 min total.

## Carryovers resolved

- Story 2.5 retro pre-merge smoke-test finding → **CLOSED by this story**. #35 was the first-contact-with-real-data bug reported at that time.
- story-maint-01 retro action A (safeguard-removal rule) → engaged; pattern generalized implicitly to "tooling substitution" in Sonnet's deviation. Consider renaming/broadening the rule in a future retro (not this one) if a third case shows the same shape.
- story-maint-01 retro action B (Opus inline-refactor < 5 LOC) → didn't trigger.
- story-maint-01 retro action E (harness invocation refresh) → engaged; third story in a row using `subagent_type: "sonnet-implementer"` direct invocation without issue.
- story-maint-02 retro Change A (env-var fixture red-proof) → extended here to "runtime-invocation fixture verification" (Change A of this retro). Same underlying pattern.
- Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config consolidation): still open.
- Issue [#43](https://github.com/xavierbriand/accounting/issues/43) (helper extraction): still open.
