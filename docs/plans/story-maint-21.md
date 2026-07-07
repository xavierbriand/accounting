# Story maint-21 — Migrate `csv-parse` 6.2.1 → 7.0.1

## Context

`csv-parse` is a runtime dep pinned at `^6.1.0` ([package.json:41](package.json)) — the BPCE bank-statement CSV parser used by ingest. [Dependabot PR #192](https://github.com/xavierbriand/accounting/pull/192) proposed `6.2.1 → 7.0.1`, a semver-major jump. Per [CLAUDE.md § 6.7](CLAUDE.md) maintenance sub-loop policy, major bumps of runtime deps route to a full story rather than a routine merge — filed as [#195](https://github.com/xavierbriand/accounting/issues/195) during the 2026-07-07 dependabot maintenance sub-loop run.

**No model impact** — pure dependency-version bump, no Core domain concept touched (R24 default for maint/process stories). `csv-parse` is consumed entirely inside `src/infra/csv/node-csv-parser.ts`, behind the `CsvParser` port; `src/core/` never references it.

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, folded into the same sub-loop that filed #195/#196.**
- **Sibling work:** only open non-dependabot PR is #194 (user's own draft retro for story-4.2b) — no overlap.
- **Open issues:** reviewed; #195 (this story) and #196 (dev-dependencies group CI failure, out of scope here) are the only dependency-tracker items; nothing else stale.
- **Open Dependabot PRs:** #191 (ora) and #190 (yaml) merged routinely earlier in this session; #189 (`@inquirer/core`) merging routinely in parallel with this story (branch-update + CI wait, same as #191/#190). #188 (dev-dependencies group) fails CI on an unrelated `quickpickle`/`pixelmatch` peer conflict — tracked in #196, not touched by this story.
- **`npm audit --audit-level=high`:** 0 findings, pre- and post-bump (checked in § "Pre-planning probe findings" below).
- **Proceed-to-planning.**

## Motivation

1. **Clears the routing block on PR #192.** `csv-parse` is otherwise unmaintained at `^6.1.0`; the current major line is `7.x`.
2. **Changelog signal is unusually strong for a major bump.** Upstream's own `7.0.0` release notes carry a maintainer disclaimer: *"This version was published by mistake, there is no breaking changes. Also, ... the associated version's changelog included many commit messages from version 6.0.0."* `7.0.1` is a same-day follow-up bug fix (`ship stream cjs export`). This is about as strong a zero-breaking-change signal as a major bump can carry — worth confirming against our actual usage rather than taking on faith.
3. **Small, well-isolated surface.** `csv-parse` ships zero dependencies of its own (confirmed by the lockfile diff in § 4) and has exactly one call site in this repo.

## Surface area (pre-planning probe)

One file imports `csv-parse` directly: [src/infra/csv/node-csv-parser.ts:1](src/infra/csv/node-csv-parser.ts).

```ts
import { parse as csvParse } from 'csv-parse/sync';
```

Called once, at [node-csv-parser.ts:158-165](src/infra/csv/node-csv-parser.ts):

```ts
rawRows = csvParse(cleaned, {
  delimiter: ';',
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_column_count: false,
  bom: false,
}) as Record<string, string>[];
```

All callers of `NodeCsvParser` (`src/cli/program.ts`, `categorize-command.ts`, `ingest-command.ts`) go through the `CsvParser` port — the `csv-parse` dependency boundary is exactly this one file.

**Breaking-change audit against v7 changelog:**

| Change (6.2.1 → 7.0.1) | Our usage | Impact |
| --- | --- | --- |
| `7.0.0` — new `delimiter_auto`/delimiter-discovery feature | We always pass an explicit `delimiter: ';'` | None — auto-discovery only activates when `delimiter` is omitted or an array |
| `7.0.0` — "dont modify prototype in sync" internal fix | Implementation detail of the sync parser; no option/return-shape change | None |
| `7.0.0` — "align trim with ECMAScript whitespace" | We pass `trim: true`; BPCE export is plain ASCII/Latin-1 French banking text, no exotic Unicode whitespace | None expected; covered by existing fixture-driven integration tests regardless |
| `7.0.0` — export `CsvError` and `normalize_options` | Net-new exports; we don't import them | None |
| `7.0.0` — "desactivate delimiter splitting when empty array" | We pass a plain string (`';'`), never an empty array | None |
| `7.0.0` — "remove comment about sync parse old usage" | Doc-comment-only change inside the library's own source | None |
| `7.0.0` maintainer disclaimer — "no breaking changes... published by mistake" | — | Upstream's own assessment; corroborates the above line-by-line audit |
| `7.0.1` — "ship stream cjs export" bug fix | We only use the `csv-parse/sync` subpath, not the stream API | None |

Cross-checked against the full upstream `7.0.0` CHANGELOG.md entry (6 Features + 1 Bug Fix) — every bullet is accounted for above, either individually or as a group (the two rows added in Phase-4 review close out the two bullets the first pass had left implicit).

**Conclusion:** zero code change in `node-csv-parser.ts` expected. The migration is `package.json` + `package-lock.json` only.

## Pre-planning probe findings

Ran `npm install csv-parse@7.0.1` + `npm run lint && npm run build && npm test` + `npm audit --audit-level=high` in this worktree on 2026-07-07, following the story-maint-05/06 pre-planning-probe precedent.

| Gate | Pre-bump | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm run lint` | green | green | 0 |
| `npm run build` (`tsc` ×2 + `tsc-alias` ×2) | green | green | 0 |
| `npm test` | 781 tests / 71 files | 781 tests / 71 files, all pass | 0 |
| `npm audit --audit-level=high` | 0 findings | 0 findings | 0 |
| `src/infra/csv/node-csv-parser.ts` diff | — | byte-identical | 0 LOC changed |
| `package-lock.json` diff | — | 6 lines (version bump + `resolved`/`integrity` for the new tarball; `csv-parse` carries zero transitive deps, so no other package moved) | minimal |

Also spot-checked the sync API directly against the exact option object used in production (`node -e "require('csv-parse/sync').parse(...)"` with `delimiter`, `columns`, `skip_empty_lines`, `trim`, `relax_column_count`, `bom` all set as in [node-csv-parser.ts](src/infra/csv/node-csv-parser.ts)) — same shape returned as pre-bump.

The probe confirms the § 5 scenarios pass verbatim. No manual smoke-test AC applies here (unlike story-maint-05's interactive-prompt case) — `csv-parse` has no TTY/interactive surface, and the existing integration suite (`tests/integration/infra/csv/node-csv-parser.test.ts`, `tests/integration/cli/ingest-commit.test.ts`, `tests/features/steps/ingest.steps.ts`) already drives the parser against real BPCE fixtures end-to-end.

## Selected solution

**Option A — straight `npm install csv-parse@7.0.1 --save`, zero code change.** Chosen, for the same reasons as story-maint-05/06: the breaking-change audit is airtight (every v7 change is either N/A to our option set or an additive export we don't use), corroborated by upstream's own "no breaking changes" disclaimer and a clean probe. No alternative option was considered — there is no design question here, just a version-pin change.

## Gherkin / AC scenarios

No `.feature` files — dep bumps have no CLI surface change. Scenarios map 1:1 to post-bump verification, per the story-maint-05 Gherkin-to-test-mapping precedent. **Pseudo-Gherkin, not automatable:** fenced as ` ```text ` rather than ` ```gherkin ` deliberately — these narrate verification invariants for a human reader, not scenarios meant to gain `.feature`/step-definition coverage (`harness/dod-check`'s Gherkin↔step hard gate treats any ` ```gherkin ` fenced block in a story's plan as scenarios that must resolve against real feature files; see retro § Change for the process-gap note).

```text
Feature: csv-parse 6.2.1 → 7.0.1 migration

  Scenario: dependency pin shifts to v7
    Given package.json dependencies["csv-parse"] == "^6.1.0"
    When `npm install csv-parse@7.0.1 --save` is applied
    Then package.json dependencies["csv-parse"] == "^7.0.1"
    And package-lock.json reflects the new resolution

  Scenario: no source code change required
    Given src/infra/csv/node-csv-parser.ts calls csvParse(cleaned, { delimiter: ';', columns: true, skip_empty_lines: true, trim: true, relax_column_count: false, bom: false })
    When the dep is bumped to 7.0.1
    Then src/infra/csv/node-csv-parser.ts is byte-identical to its pre-bump state

  Scenario: full test suite green, unmodified
    Given the existing test suite passes pre-bump (781 tests / 71 files)
    When the dep is bumped to 7.0.1
    Then `npm run lint && npm run build && npm test` completes green
    And no test file is modified

  Scenario: npm audit stays clean
    Given npm audit --audit-level=high reports 0 findings pre-bump
    When the dep is bumped to 7.0.1
    Then npm audit --audit-level=high still reports 0 findings
```

**Gherkin-to-test-mapping audit (Story 2.5 retro action C).** As with story-maint-05, each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — pin shifts to v7 | `git diff` on [package.json](package.json) |
| 2 — no source code change | `git diff` on [src/infra/csv/node-csv-parser.ts](src/infra/csv/node-csv-parser.ts) (expected: empty) |
| 3 — test suite green unmodified | the 781-test suite (unchanged) + CI |
| 4 — audit stays clean | `npm audit --audit-level=high` output in § 4 |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R15 major-bump-zero-code collapse

Per [CLAUDE.md § 6.7](CLAUDE.md) / [§ 8 R15](CLAUDE.md), a major bump whose breaking-change audit produces a zero-code-change verdict collapses the standard `test:`/`feat:` rhythm to 4 commits:

1. `chore(docs): story-maint-21 plan + Phase 2 review (story-maint-21)` — this plan doc.
2. `chore(deps): bump csv-parse from 6.2.1 to 7.0.1 (story-maint-21)` — `package.json` + `package-lock.json` only. Body notes the breaking-change audit conclusion and closes #195 and #192.
3. `refactor(infra): empty slot — node-csv-parser.ts unchanged (story-maint-21)` — no-op, following the story-maint-05 "empty refactor slot with justification" pattern. Body: all v7 changes are N/A to our option set per § 4; nothing to refactor.
4. `chore(retro): story-maint-21 retrospective (story-maint-21)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06: the fix is fully pre-specified (a version-pin change with a completed breaking-change audit), touches no Core or business logic, and the probe already ran end-to-end. No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (infra-only dep bump, no Core/domain concept touched — [CLAUDE.md § 6](CLAUDE.md) lane table): `sibling-overlap` only, `plan-reviewer` dropped. Findings below.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | PR #192 (Dependabot csv-parse bump) and issue #195 are the direct predecessors this story supersedes/closes. | adopted | Already accounted for — commit 2's body closes both; #192 will be closed manually once this story merges (Dependabot won't auto-detect a manually-authored bump). |
| P2 (sibling-overlap) | PRs #189/#190 (`@inquirer/core`, `yaml`) both touch `package.json`/`package-lock.json` — mechanical rebase risk if merge order interleaves with this story's `chore(deps)` commit. | adopted | Resolved procedurally: #190 and #191 merged to `main` before this story's dep-bump commit; #189 merging in parallel. This branch rebases onto `main` immediately before the `chore(deps)` commit so `package-lock.json` reflects all four bumps cleanly — no manual conflict resolution needed. |
| P2 (sibling-overlap) | Plan's maintenance-sub-loop note claimed #189/#190 were already merged when they were still `OPEN`. | adopted | Corrected in the "Maintenance sub-loop" bullet above. |

**Phase 4 (code-reviewer + sibling-overlap, Reduced lane) — run 2026-07-07 against PR #197.**

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 (code-reviewer) | Plan had no Phase-0 `No model impact` declaration (R24 exit criterion — maint/process stories qualify by default but must say so), unlike sibling maint plans (e.g. story-maint-19). | fix-now | Added to § Context: "No model impact — pure dependency-version bump, no Core domain concept touched (R24 default for maint/process stories)." First R15-pattern story reviewed against R24, which postdates story-maint-05/06. |
| P1 (code-reviewer) | Breaking-change audit table named 4 of the upstream `7.0.0` changelog's 6 Feature bullets individually; 2 (`desactivate delimiter splitting when empty array`, `remove comment about sync parse old usage`) were implicitly-but-not-explicitly covered. | fix-now | Added both as explicit rows to § "Breaking-change audit against v7 changelog"; both confirmed N/A (plain-string delimiter, doc-comment-only library change). |
| P1 (code-reviewer) | At review time, PR #197's `build` CI check was still `IN_PROGRESS`, so Gherkin scenario 3 / DoD item 1 weren't yet independently CI-confirmed. | acknowledge | Moot — CI has since gone green (see § Retrospective: this review ran concurrently with the Gherkin-fence hard-gate discovery/fix; `gh pr checks 197` now shows `build pass`). |
| P2 (code-reviewer) | `npm audit` isn't run in CI (`.github/workflows/ci.yml` has no audit step), so Gherkin scenario 4 / the security checklist's "npm audit clean" item are only evidenced by this story's local probe, not a repeatable CI gate. | acknowledge | Pre-existing gap, not introduced by this story; out of scope here. Worth a future harness story if it recurs as a review finding. |
| P3 (code-reviewer, soft) | R15's commit envelope and the § 6 lane-selection table (R13/R14/R16) aren't formally reconciled — this plan invokes "Reduced lane" for review-agent selection while using the R15 4-commit envelope, and the § 6 table doesn't list R15 as a selectable Envelope value. | acknowledge | Folded into retro § Change as a process-gap observation; not a defect in this story's execution. |
| P3 (code-reviewer, soft) | Plan's "Maintenance sub-loop" section doesn't explicitly narrate the R23 story-id-uniqueness check, unlike its explicit R19 sibling-PR/issue walk. | acknowledge | No actual collision existed; folded into retro § Change as a narration-completeness observation. |
| P4 (sibling-overlap) | Re-check for new overlap since Phase 2: none found. #192/#195 reconfirmed as the correct predecessors (still open, not touched by anyone else). | acknowledge | No action — confirms Phase 2's findings still hold. |

## Merge checklist

- [ ] `lint` / `build` / `test` green on CI
- [ ] PR out of draft
- [ ] Retrospective file committed at `docs/retrospectives/story-maint-21.md`
- [ ] All suggestion-log items resolved (no blank `Resolution` cells)
- [ ] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
