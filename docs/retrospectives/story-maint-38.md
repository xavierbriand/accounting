# Story maint-38 retrospective

**PR:** [#276](https://github.com/xavierbriand/accounting/pull/276)  **Closed:** pending merge

Ratcheted coverage thresholds for `src/infra` and the in-process-tested slice of `src/cli`
(`src/cli/commands/**`, `src/cli/utils/**`), each set ~5 points below a measured 2026-08-11
baseline, resolving #242. Reduced lane, R16 zero-behaviour-change collapse. Direct follow-through
of the same session's `/refine-backlog` run, which reprioritized #242 after confirming its
"a few weeks of CI history" tripwire had fired.

## Keep

- **Measuring the exact baseline before picking numbers, rather than eyeballing the directory
  rows in the standard coverage report.** #242's own proposal explicitly asked for this ("not an
  arbitrary number"). A one-off `vitest run --coverage` with placeholder `branches: 100`
  thresholds on the target globs forced vitest to report the exact miss percentage per glob
  (83.23% / 89.66% / 78.94%), which the directory-grouped report alone doesn't surface for a
  custom glob spanning multiple subdirectories (e.g. `src/infra/**` aggregates six subdirectory
  rows with no printed total).
- **Surfacing the composition-root dilution problem to the user before implementing, not after.**
  The 0%-under-v8-instrumentation composition-root files (`program.ts`, `migrate.ts`,
  `ledger-command.ts`) would have silently defeated a naive single `src/cli/**` glob. Catching this
  during Phase-1 planning (via `AskUserQuestion`) rather than discovering it at Phase-4 review kept
  the fix cheap — a glob-scoping decision, not a rework.
- **Demonstrating the gate actually fires, not just that it passes.** Temporarily raising a
  threshold above its real value and capturing the resulting `ERROR:` line (then reverting,
  uncommitted) gave the plan's Scenario 3 real evidence instead of an assumption that the
  mechanism works as documented.

## Change

- **The plan's own "fails if" claim about vitest's threshold-check behavior was wrong, and nothing
  in Phase 1 caught it.** The original draft claimed a misconfigured glob would fail with
  "threshold not found for any file" — a plausible-sounding but fabricated error string. vitest
  actually prints nothing on a passing threshold, and a glob matching zero files silently reports
  100% coverage (istanbul's `percent(0,0) === 100`), so a typo would pass forever, not fail loudly.
  Reduced lane drops `plan-reviewer` at Phase 2, so nothing checked this claim against the actual
  tool source until Phase 4's `code-reviewer` did. **This is exactly the R7/R6-shaped gap the lane
  table's Phase-4-only `code-reviewer` exists to catch for Reduced-lane stories** — worked as
  designed, but worth naming: a plausible but unverified claim about third-party tool behavior
  should be treated with the same suspicion as an unverified claim about this codebase's own code.
  Filed [#277](https://github.com/xavierbriand/accounting/issues/277) for the underlying mechanism
  gap (also present in the pre-existing `src/core/**` threshold, not new to this story).
- **A 4th documented instance of CLAUDE.md § 6's lane-trigger wording not literally covering the
  actual diff surface** (root-level `vitest.config.ts`, not `src/infra`/`src/cli` proper) — same
  category as maint-21/22/27, narrowly closed by #200. Filed
  [#278](https://github.com/xavierbriand/accounting/issues/278) to track the wording gap itself
  rather than let a 5th story rediscover it independently.

## Try

- Disposition [#277](https://github.com/xavierbriand/accounting/issues/277) (coverage-threshold
  glob silent-pass guard) in a future harness story — cheap, and closes a real blind spot in the
  gate this story and story-maint-29 both rely on.
- Disposition [#278](https://github.com/xavierbriand/accounting/issues/278) (lane-trigger wording)
  by actually rewording CLAUDE.md § 6 rather than deferring a 5th time — the pattern's now
  documented four times with the same root cause.
