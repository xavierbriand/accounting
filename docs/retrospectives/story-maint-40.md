# Story maint-40 retrospective

**PR:** [#280](https://github.com/xavierbriand/accounting/pull/280)  **Closed:** pending merge

Closed [#278](https://github.com/xavierbriand/accounting/issues/278) by editing CLAUDE.md
directly (Light lane, docs-only). Two new rules: **R34** extends the Reduced-lane trigger to
explicitly cover root-level build/test/lint config files (`vitest.config.ts`, `eslint.config.js`,
`tsconfig*.json`), not just `src/infra`/`src/cli`; **R35** broadens R16's "optional 4th body
slice" carve-out beyond the literal "process and docs" span to also cover a single file's change
split into multiple commits by distinct concern. This is the 5th documented instance of the
lane-trigger wording gap (maint-21/22/27/38/39) and #200 (2026-07, "list R15 as an Envelope
value") only partially addressed it — this story finally reworks the trigger text itself.

## Keep

- **Applying the newly-minted rule to itself.** R35 exists specifically to justify splitting a
  single file's change into multiple commits by distinct concern. This story's own commit
  sequence (R34's lane-trigger edit as one commit, R35's carve-out edit as a separate commit) uses
  exactly that shape — the rule is demonstrated by the PR that mints it, not just asserted in
  prose.
- **Waiting for five independent occurrences before generalizing the fix.** #200 tried a narrow
  fix after three sightings and it didn't stick (the same category resurfaced twice more within a
  week, in maint-38 and maint-39). This time the fix directly rewords the trigger text in the lane
  table itself rather than adding an adjacent Envelope-value option — addressing the actual
  wording gap the retros kept describing, not a nearby but distinct gap.

## Change

- **A docs-only story tripped an unrelated CI failure via pure repo growth.** `harness/drift-scan`'s
  Check G "fresh marker" test used a fixture hardcoded to `2026-07-19` — safe when written, but
  the repo has since accumulated 10 real `docs/status.d/` fragments postdating it
  (`POSTDATING_FRAGMENT_EXPIRY_THRESHOLD = 10`), and this story's own status.d fragment was the
  10th, flipping the fixture from "fresh" to "expired" out from under the test. Nothing in this
  story's actual diff (CLAUDE.md wording) caused the failure — the repo simply grew past a
  hardcoded date's safe margin, and this PR's CI run happened to be the one that observed it.
  Fixed by stamping the fixture with today's date instead of a fixed past one (permanently
  un-postdatable). **Any test fixture whose correctness depends on "not enough time/stories have
  passed since a hardcoded date" will eventually break as the repo grows — prefer relative/dynamic
  dates over hardcoded ones in fixtures that interact with real growing repo state** (here,
  `docs/status.d/`'s fragment count).

## Try

- Watch whether R34's wording ("root-level build/test/lint config") is itself precise enough, or
  whether a 6th occurrence surfaces for a category it still doesn't name (e.g. `package.json`
  script changes, `.github/workflows/` CI config). If so, don't repeat the #200 pattern of a
  narrow patch — generalize the trigger wording once more instead.
- Grep `harness/` test fixtures for other hardcoded past-date stamps that could similarly trip as
  `docs/status.d/` keeps growing (the Check G fresh-marker fixture is fixed now, but siblings may
  share the same fragility pattern).
