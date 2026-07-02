# Story maint-18 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/142  **Closes:** [#139](https://github.com/xavierbriand/accounting/issues/139)

Adds a "Story-id uniqueness" bullet to [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md), the checklist run before opening every new story plan (CLAUDE.md § 6.7). This is the process fix for the `story-h2` id collision from earlier in the same session: PR #130 silently overwrote the already-merged PR #125's `docs/plans/story-h2.md` and `docs/retrospectives/story-h2.md`, and fixing it required renaming a branch, which closed an open PR as a side effect (GitHub can't reopen a PR whose head ref has disappeared) and needed a replacement PR (#138) to land the work.

## Keep

- **Filing the issue at the moment of discovery, then closing the loop in the same session, kept the fix cheap.** The root cause (no story-id uniqueness check) was identified immediately after the incident, while the exact failure mode was still fresh — the plan's Context section could describe the real chain of consequences (silent overwrite → branch rename → auto-closed PR → replacement PR) precisely, rather than reconstructing it later from a terse issue.
- **R16 collapse handled a genuinely tiny story correctly.** One checklist bullet, one file touched, 3 real commits (4 counting the empty refactor slot per R16's own convention) — no forced Gherkin scenarios, no fabricated production-code surface. The plan's explicit "None" sections (Production-code surface, Gherkin scenarios) were the right call, not a shortcut.
- **Parallel Phase 2 (plan-reviewer + sibling-overlap) surfaced a real, cheap-to-fix gap.** The reviewer caught that the new checklist bullet's scope covered `docs/plans/` and `docs/retrospectives/` but not `docs/status.d/`, even though status fragments are also keyed by story id and CLAUDE.md § 6.4.1 separately documents a `docs/status.d/<date>-story-<id>.md` collision case. A one-line extension to the `git ls-tree` path list closed the gap before it ever caused a second incident.

## Change

- **The R22 *(pending)* rule-tag slot is now contested by three separate pending candidates (story-h1, the real story-h2, and story-h3), none of which are ready for codification yet.** This story needed a fresh rule tag and deliberately skipped past R22 *(pending)* to **R23** to avoid adding a fourth claimant to an already-crowded slot. Worth a note for whoever eventually corroborates one of the R22 *(pending)* candidates: R23 is taken, so codification should start numbering the *other* candidates from R24 *(pending)*, not R23.
- **The new checklist bullet is enforcement-by-convention only** — nothing stops it from being silently weakened or deleted in a future doc edit, unlike code (which has tests) or CLAUDE.md § 8 rows (which drift-scan checks). This mirrors every other maintenance-sub-loop bullet today, so it's not a regression, but it's the second time this session a "docs-only, trust the agent to run the command" gap has come up (the first being the story-id collision itself). If a third instance of "manual checklist step gets skipped" surfaces, that's the trigger to consider a `new-story-preflight` skill assertion or a CI check instead of a checklist bullet.

## Try

- **If a second story-id collision occurs despite this bullet, escalate to automation** — e.g. a `new-story-preflight` skill assertion (the skill already runs the maintenance sub-loop per its own checklist item 1, so adding a mechanical id-uniqueness check there is a small extension) rather than adding a third checklist bullet asking the agent to be more careful. One incident doesn't yet justify the extra tooling surface; two would.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** CLAUDE.md § 8 gains the R23 row (this retro is its originating reference); the maintenance-sub-loop checklist file gains the corresponding bullet. Both edits are consistent with each other and with this retro.
- [x] If yes, reconciled in this PR? N/A — no contradictions.
- [x] `npx tsx harness/drift-scan/drift-scan.ts --all` — exit 0 after this retro lands (R23's `table-only` finding, present before this file existed, resolves once this retro is committed in the same PR).

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Story-id uniqueness checklist bullet | `docs/templates/maintenance-sub-loop.md` | done (commit `827cffe`) |
| CLAUDE.md § 8 R23 row | `CLAUDE.md` | done (commit `827cffe`) |
| Escalate to automation if a second collision occurs | future story, if triggered | open |
| R22 slot remains contested (3 pending candidates) — note for future codifier to start at R24, not R23 | future maintenance story | open |
