# Story 1.3 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/16  **Closed:** _pending merge_

Story 1.3 — Ledger Schema & Repository — was the first end-to-end run through the Opus-plans / Sonnet-implements product development loop (CLAUDE.md § 6.1). The loop worked; this retro captures what to keep, what to change, and what to try next.

## Keep

- **Plan file → 3-pass critical review → Sonnet delegation → Phase-4 retro** produced a clean, auditable story with zero rework after user approval of the plan. The critical review caught one real functional gap (per-account currency consistency, deferred as #17) and one engineering mislabel (commit #7 tagged `refactor:` when it was an API-breaking signature change — re-tagged as `feat:`).
- **TDD commit rhythm** (red `test:` → green `feat:` → cleanup `refactor:`, story id in every subject) produced a git log that reads like the story itself. Fourteen planned commits, twelve delivered — Sonnet correctly collapsed two `feat:` steps when later tests passed against existing code, and documented each collapse in Deviations.
- **Suggestion log with `deferred` → GitHub issue** discipline prevented the per-account-currency concern from getting silently absorbed into 1.3's scope.
- **Sonnet's fixed-format return report** (six sections) made the Phase-4 review efficient — deviations and atomicity-test-being-vacuous were both flagged *by Sonnet* before Opus's code reading, and the "what was built" summary anchored the review.
- **Post-change sanity check** in the Sonnet brief (`npm run migrate` + pragma assertions) caught an interesting connection-level subtlety: `sqlite3` CLI reports `foreign_keys = 0` because pragmas are per-connection, not file state. Sonnet noted this unprompted.

## Change

- **Custom subagent IDs in `.claude/agents/*.md` are NOT picked up by this Claude Code harness.** Only built-in subagent types (`claude-code-guide`, `Explore`, `general-purpose`, `Plan`, `statusline-setup`) are available to the `Agent` / Task tool. The first delegation attempt with `subagent_type: "sonnet-implementer"` failed with *"Agent type 'sonnet-implementer' not found"*. The working pattern is `subagent_type: "general-purpose"` + `model: "sonnet"` override + inline all operating rules from `.claude/agents/sonnet-implementer.md` in the prompt. Workflow doc (CLAUDE.md § 6.3) needs to reflect this. Action item A below.
- **Tests can pass `lint + build + test` and still not prove the AC they claim to test.** Two test-quality issues only surfaced in Phase 4 review: the WAL test bypassed `getDb()` by setting the pragma manually, and one of the "atomic save" tests was a happy-path round-trip in disguise. Neither failed CI. Next time, each test name should be paired with a "what would prove this wrong?" line at plan time — asserts the *production* path, not just *any* path.
- **Strict "red first" TDD broke down when subsequent validation tests landed on implementation that already satisfied them.** Commits `e706ec9` and `076e823` are `test:` commits that went green-on-landing because `ba5c0b8` (the first `feat:` commit) implemented more than the minimum for the first test. Acceptable given TDD-by-intent (the test *would* have failed had the code not existed), but worth noting in the convention that green-on-landing is OK if the earlier `feat:` commit's diff covers the tested branches.

## Try

- **Pair each Gherkin scenario with a "this test fails if …" note** during plan review, so Phase 4 can check the test actually exercises the claimed condition. Adds a line to the plan template for the next story.
- **After approving the plan but before delegating to Sonnet**, re-grep the plan for references to files / functions that don't exist yet, and confirm the proposed alias (`@core/*`) is actually wired in both `tsconfig.json` and `vitest.config.js`. Would have caught the import-style inconsistency upfront.
- **Empty `refactor:` commit with a justification message** (commit `09f97d0`) feels clean: the commit sequence stays intact, the message documents "no refactor needed". Keep this as the pattern when the refactor slot has nothing to do. Action item B below.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Update CLAUDE.md § 6.3 to note that the "sonnet-implementer" label is a role description and the invocation pattern is `subagent_type: general-purpose` + `model: "sonnet"` override + inline brief from `.claude/agents/sonnet-implementer.md` | CLAUDE.md in this PR | in same commit as this retro |
| B. Document the empty-refactor-commit pattern in CLAUDE.md § 6.4 as an acceptable green-on-landing variant | CLAUDE.md in this PR | in same commit as this retro |
| C. Per-account currency consistency (P2 deferral) | issue #17 | open |
| D. `tsconfig.test.json` so `tsc` type-checks test files (surfaced in Sonnet's Proposed follow-ups) | new GH issue | will file before merge |
| E. Add a "this test fails if …" line per Gherkin scenario in the PR template | `.github/pull_request_template.md` in a follow-up PR | open — not in this PR (too late-cycle, small separate PR for Epic 2 planning) |

## Loop metrics (first run)

- Plan phase: 1 Explore agent + 1 Plan agent + 3-pass critical review (Opus self-review).
- Implementation: 1 Sonnet Task (12 commits) + 1 Sonnet Task (3 refactor commits).
- Phase-4 retro: caught 2 blocker-level test issues and 1 minor style issue; all fixed in the same branch before marking ready.
- Deferred: 1 issue (#17).
- Follow-ups created from the retrospective itself: 1 (#D above, issue filed before merge).
- Time-to-DoD from branch creation to ready-for-review: within a single working session.
