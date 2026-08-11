# Story maint-39 retrospective

**PR:** [#279](https://github.com/xavierbriand/accounting/pull/279)  **Closed:** pending merge

Added `tests/integration/coverage-thresholds-glob.test.ts`, an integration test that guards every
`coverage.thresholds` glob key against silently matching zero files — the exact failure mode
`istanbul-lib-coverage`'s `percent(0,0) === 100` produces, which story-maint-38's Phase-4 review
surfaced as #277. Extracted the thresholds object into `vitest.coverage-thresholds.ts` so the test
validates the live config, not a hand-copied list. Reduced lane, real red→green TDD (not R16
collapse — this story adds genuine new guard behavior).

## Keep

- **Reading the live config object instead of hand-copying the glob keys into the test.** This is
  the actual mechanism that closes #277's gap: a future threshold-key rename or typo is caught
  automatically, with zero extra wiring, because the test iterates `Object.keys(coverageThresholds)`
  rather than a duplicated literal list.
- **Getting a genuine TDD red for the right reason.** The failing-test commit is red because the
  imported module doesn't exist yet (a real `TS2307` compile error via `npm run build`), not a
  contrived assertion failure — the same "collapsed test through a real build/compile step" pattern
  is available whenever a slice's first commit imports something the next slice creates.
- **Demonstrating the guard fires, not just that it passes.** Same discipline as story-maint-38's
  manual override demo — temporarily pointing a key at a nonexistent directory, confirming the
  test fails with a message naming the bad key, then reverting before the real commits land.

## Change

- **A PR that references an issue number in its title doesn't close it.** story-maint-38's PR
  title was `"story-maint-38: … (#242)"` — a plain reference, not `Fixes #242`/`Closes
  #242`/`Resolves #242`. GitHub only auto-closes on the latter. #242 sat open for a full day after
  its fix merged, and the very next story's plan (this one) inherited the false claim "#242
  confirmed already closed" without re-verifying live tracker state — caught only by Phase 4's
  `code-reviewer`, which does check live state rather than trusting the plan's own prose. **A
  written claim about external repo state (issue open/closed, PR merged, etc.) should be
  re-verified against the live tracker at the point it's asserted, not carried forward from an
  earlier session's summary** — the earlier summary was accurate about *substance* (the fix
  shipped) but wrong about *tracker state* (nobody actually closed the issue).
- Corroborates [#278](https://github.com/xavierbriand/accounting/issues/278) again: this story's
  own surface (root `vitest.coverage-thresholds.ts`, `tests/integration/`) doesn't literally fit
  CLAUDE.md § 6's Reduced-lane wording either — 5th documented instance now (maint-21/22/27/38/39).

## Try

- When closing out a story whose PR title references an issue number, explicitly verify the issue
  actually closed (`gh issue view <n> --json state`) as part of the merge-checklist tick, not just
  trust the PR-title convention to have done it.
- Disposition [#278](https://github.com/xavierbriand/accounting/issues/278) — now corroborated a
  5th time.
