# Story maint-22 — dev-dependencies group bump (9 packages) + pixelmatch peer-range fix

## Context

[Dependabot PR #188](https://github.com/xavierbriand/accounting/pull/188) ("chore(deps-dev): bump the dev-dependencies group with 9 updates") fails CI with an `npm ci` `ERESOLVE` error: `quickpickle@1.11.2` declares an `optional: true` peer on `pixelmatch@^6.0.0`, which conflicts with our pinned `pixelmatch@^7.1.0`. Per [CLAUDE.md § 6.7](CLAUDE.md), two of the 9 bumped packages (`@cucumber/cucumber-expressions`, `@cucumber/gherkin`) are also **major** version jumps flagged with breaking-change notes upstream, which independently routes this PR to a full story rather than a routine merge. Filed as [#196](https://github.com/xavierbriand/accounting/issues/196) during the 2026-07-07 dependabot maintenance sub-loop run (same sub-loop that produced [story-maint-21](story-maint-21.md)).

**No model impact** — pure devDependency-version bump, no Core domain concept touched (R24 default for maint/process stories). None of the 9 packages are imported by `src/core/`; the only in-repo code that imports two of them directly is `harness/dod-check/lib/gherkin-map.ts` (audited below), which is harness tooling, not product Core.

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run.**
- **Sibling work:** `gh pr list --state open --draft --base main` returns empty (story-maint-21/#197 merged; #194 merged earlier). No overlap.
- **Open issues touching this surface:** [#196](https://github.com/xavierbriand/accounting/issues/196) (this story's own tracking issue) and [#57](https://github.com/xavierbriand/accounting/issues/57) ("Track quickpickle's undeclared pixelmatch dependency upstream" — stays open, see § "Selected solution"). Nothing else stale.
- **Open Dependabot PRs:** only #188, handled by this story.
- **Story-id uniqueness (R23):** `docs/plans/`, `docs/retrospectives/`, `docs/status.d/` on `origin/main`, and open PR branch names all clean for `story-maint-22` — no collision.
- **`npm audit --audit-level=high`:** 0 findings, pre- and post-bump (checked in § "Pre-planning probe findings" below, including on the downgraded `pixelmatch@6.0.0`).
- **Proceed-to-planning.**

## Motivation

1. **Clears the CI-failing routing block on PR #188.** The group can't merge as-is; Dependabot won't self-resolve an `ERESOLVE` failure.
2. **Two of the nine bumps are major-with-breaking-change-flagged, per CLAUDE.md § 6.7 policy** — routes to a full story regardless of the CI failure.
3. **A deep breaking-change audit (delegated to a research agent, `general-purpose`, this session) found the whole group — majors included — lands as a zero-code-change bump**, once the pixelmatch peer range is separately fixed. Worth confirming end-to-end with a probe rather than trusting the audit alone.

## Surface area (pre-planning probe)

**Package inventory (10 changes: the 9-package Dependabot group + 1 extra fix):**

| Package | From | To | Kind |
| --- | --- | --- | --- |
| `@cucumber/cucumber-expressions` | `18.1.0` | `20.0.0` | major, breaking-change flagged |
| `@cucumber/gherkin` | `32.2.0` | `41.0.0` | major, breaking-change flagged |
| `@types/node` | `26.0.1` | `26.1.0` | patch |
| `prettier` | `3.9.3` | `3.9.4` | patch |
| `quickpickle` | `1.11.1` | `1.11.2` | patch (declares the `pixelmatch` peer that trips CI) |
| `tsc-alias` | `1.8.17` | `1.9.0` | minor |
| `tsx` | `4.22.4` | `4.23.0` | minor |
| `typescript-eslint` | `8.62.1` | `8.63.0` | minor |
| `vitest` | `4.1.9` | `4.1.10` | patch |
| `pixelmatch` | `^7.1.0` | `^6.0.0` | **not in the Dependabot diff** — downgrade required to unblock `npm ci` (see below); no direct usage in this repo (`grep -rl pixelmatch src/ tests/ harness/` → empty) |

**Two files in this repo import the majors directly** (not just transitively via `quickpickle`): [harness/dod-check/lib/gherkin-map.ts:1-3](harness/dod-check/lib/gherkin-map.ts).

```ts
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { CucumberExpression, RegularExpression, ParameterTypeRegistry } from '@cucumber/cucumber-expressions';
```

Called at [gherkin-map.ts:37-40](harness/dod-check/lib/gherkin-map.ts) (`new AstBuilder(IdGenerator.uuid())`, `new GherkinClassicTokenMatcher()`, `new Parser(builder, matcher)`, `parser.parse(content)`, then walks `document.feature?.children[].scenario.{name,steps[].text}`) and [gherkin-map.ts:78-89,154](harness/dod-check/lib/gherkin-map.ts) (`new ParameterTypeRegistry()`, `new CucumberExpression(pattern, registry)`, `new RegularExpression(new RegExp(pattern), registry)`, `.match(text)`).

**Breaking-change audit against both majors** (delegated to a `general-purpose` research agent this session — full findings retained in this session's transcript, summarised here):

| Package / change | Our usage | Impact |
| --- | --- | --- |
| `@cucumber/gherkin` 33→40 — "BREAKING CHANGE: Switch to ESM" | This repo is already `"type": "module"`; `gherkin-map.ts` already uses ESM `import` syntax | None |
| `@cucumber/gherkin` 41 — "Remove namespace imports from messages" | A fix, not a break; verified `Parser`/`AstBuilder`/`GherkinClassicTokenMatcher` are still named exports at the same subpath in `41.0.0`'s `dist/index.js` | None |
| `@cucumber/cucumber-expressions` 20.0.0 — "BREAKING CHANGE: Switch to ESM" | Same as above — repo already ESM; `20.0.0`'s `package.json` drops the CJS `exports` map, which only removes `require()` support we never used | None |
| `@cucumber/gherkin` 37.0.0 — "BREAKING CHANGE: Require messages v31 or greater" (**unscoped** — applies to all language ports, not PHP/.NET-only; found in Phase 4 review, see § "Suggestion log") | `@cucumber/gherkin`'s own `@cucumber/messages` dependency range moved `>=19.1.4 <28` → `>=31.0.0 <34`. Since it's a regular (non-peer) dep, npm nests a separate copy at `node_modules/@cucumber/gherkin/node_modules/@cucumber/messages@33.0.4`, distinct from the top-level `@cucumber/messages@27.2.0` that `gherkin-map.ts:2` imports `IdGenerator` from directly. Compared both copies' `IdGenerator.d.ts`: byte-identical (`export type NewId = () => string; export declare function uuid(): NewId; export declare function incrementing(): NewId;`) | None — the two `@cucumber/messages` copies never need to interoperate structurally beyond this identical type shape; `AstBuilder`'s constructor accepts whichever `IdGenerator.uuid()` value our top-level import produces regardless of which copy `@cucumber/gherkin` itself resolves internally. Confirmed empirically: `npm run test:harness` 252/252 green (Phase 1 probe and independently re-run in Phase 4 review). |
| All other `@cucumber/*` changelog entries in the 18→20 / 32→41 ranges (re-verified in Phase 4 against the full upstream `CHANGELOG.md`, not just the Dependabot PR body excerpt) | Scoped to PHP/.NET/C++/Java, or a non-breaking "update dependency messages to vNN" bump | N/A |
| `quickpickle`'s own internal `@cucumber/*` deps | `quickpickle@1.11.2`'s `package.json` `dependencies` still pin `@cucumber/cucumber-expressions ^18.0.1` / `@cucumber/gherkin ^32.1.0` (regular deps, not peers — unchanged from `1.11.1`) | Our top-level bump doesn't move quickpickle's own runtime; npm nests a separate satisfying copy under `node_modules/quickpickle/node_modules/`. `harness/dod-check/lib/gherkin-map.ts` is the *only* in-repo code whose runtime is actually affected by the top-level bump — audited above. |

**pixelmatch peer-range fix — separate from the Dependabot diff:**

`quickpickle@1.11.2` newly declares `peerDependencies: { pixelmatch: "^6.0.0" }` with `peerDependenciesMeta: { pixelmatch: { optional: true } }`. `optional: true` only suppresses npm's "missing peer" warning when the peer isn't installed at all — it does **not** suppress the version-mismatch error when a peer *is* present outside the declared range, which is exactly our situation (`pixelmatch@^7.1.0` installed, quickpickle wants `^6.0.0`). Checked pixelmatch's own release notes: the real breaking API change was 5→6 (not 6→7); the `pixelmatch(img1, img2, output, width, height, opts)` call shape quickpickle actually uses is unchanged 6→7. So quickpickle's `^6.0.0` range is stale/conservative, not a real incompatibility signal. `npm audit` on `pixelmatch@6.0.0` is clean (0 findings), matching `7.x`. Since this repo has zero direct `pixelmatch` usage (it exists purely because [issue #57](https://github.com/xavierbriand/accounting/issues/57) — `quickpickle` unconditionally imports `pixelmatch` in its bundled ESM output for an unused visual-diff feature it never declares as a real dependency), downgrading to `^6.0.0` is a pure unblock with no functional risk. **Issue #57 stays open** — it tracks the real upstream fix (quickpickle declaring `pixelmatch` as a real dependency, or dropping the unconditional import); this story's downgrade is a second, independent workaround layered on top of story 3.1's original one, not a resolution of #57.

**Conclusion:** zero code change in `harness/dod-check/lib/gherkin-map.ts` (or anywhere else in `src/`/`tests/`) expected. The migration is `package.json` + `package-lock.json` only.

## Pre-planning probe findings

Ran `npm install --save-dev @cucumber/cucumber-expressions@20.0.0 @cucumber/gherkin@41.0.0 @types/node@26.1.0 prettier@3.9.4 quickpickle@1.11.2 tsc-alias@1.9.0 tsx@4.23.0 typescript-eslint@8.63.0 vitest@4.1.10 pixelmatch@6.0.0` (all 10 changes in one shot) + `npm run lint && npm run build && npm test && npm run test:harness` + `npm audit --audit-level=high` in this worktree on 2026-07-07.

| Gate | Pre-bump | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm install` | — | clean, **no `ERESOLVE`** (pixelmatch fix confirmed working) | — |
| `npm run lint` | green | green | 0 |
| `npm run build` (`tsc` ×2 + `tsc-alias` ×2, now `tsc-alias@1.9.0`) | green | green | 0 |
| `npm test` (`vitest@4.1.10`, exercises the `quickpickle`-driven `tests/features/*.feature` suite) | 781 tests / 71 files | 781 tests / 71 files, all pass | 0 |
| `npm run test:harness` (exercises `gherkin-map.ts` directly against the two majors) | 252 tests / 18 files | 252 tests / 18 files, all pass | 0 |
| `npm audit --audit-level=high` | 0 findings | 0 findings (confirmed clean on `pixelmatch@6.0.0` too) | 0 |
| `git diff --stat -- src/ tests/ harness/` | — | empty | 0 LOC changed |
| `package.json` diff | — | 10 line-pairs (9 group bumps + `pixelmatch` downgrade) | as planned |
| `package-lock.json` diff | — | 459 changed lines: the 10 top-level pins plus ordinary transitive re-resolution riding along (`@typescript-eslint/*` × 9 sub-packages, `@vitest/*` × 7 sub-packages, `vite`'s bundled rolldown/oxc toolchain — `@oxc-project/types`, `rolldown`, 14 `@rolldown/binding-*` platform packages, `picomatch`) plus the nested `@cucumber/gherkin/node_modules/@cucumber/messages@33.0.4` copy (see § "Breaking-change audit" table) | benign; not itself a signal of risk beyond what the audit table above already covers |

The probe confirms the § "Gherkin / AC scenarios" scenarios pass verbatim, including the harness-specific one the research audit flagged as the real risk (`gherkin-map.ts`'s direct usage of both majors).

## Selected solution

**Option A — bump the full 9-package Dependabot group as-is, plus downgrade `pixelmatch` to `^6.0.0` to unblock `npm ci`, zero code change.** Chosen: the breaking-change audit for both majors is airtight (ESM-switch is moot on an already-ESM repo; every export this repo actually imports is unchanged), the pixelmatch fix is a one-line, audit-clean, functionally-inert pin change, and the probe confirms all of it end-to-end including the harness's own direct-usage test suite.

**Option B — ask Dependabot to re-split the group** (`@dependabot recreate` after excluding the majors, or adjust `.github/dependabot.yml` grouping) so majors and routine bumps land on separate cadences. **Rejected for this run:** the audit found zero risk in bundling them, so splitting would add process overhead (two stories/PRs instead of one) without a corresponding safety benefit. Worth reconsidering only if a future group bump reproduces a similar CI-blocking surprise.

**Option C — fix only the `pixelmatch` conflict, defer the two majors to a separate story.** **Rejected:** would require Dependabot to regenerate the group PR without the majors (not a clean local action) or manually splitting the diff by hand, and the majors already have a completed zero-impact audit — no reason to defer work that's already been shown to be safe.

## Gherkin / AC scenarios

No `.feature` files — dep bumps have no CLI surface change. Scenarios map 1:1 to post-bump verification, per the story-maint-05/06/21 Gherkin-to-test-mapping precedent. **Pseudo-Gherkin, not automatable:** fenced as ` ```text ` rather than ` ```gherkin ` deliberately — `harness/dod-check`'s Gherkin↔step hard gate treats any ` ```gherkin ` fenced block in a story's plan as scenarios that must resolve against real `.feature` files (discovered the hard way in [story-maint-21](story-maint-21.md); tracked for a proper fix in [issue #198](https://github.com/xavierbriand/accounting/issues/198)).

```text
Feature: dev-dependencies group bump (9 packages) + pixelmatch peer-range fix

  Scenario: all 9 Dependabot-proposed pins shift to their target versions
    Given package.json devDependencies pin the 9 "From" versions listed in § "Surface area"
    When the group bump is applied
    Then package.json devDependencies pin the 9 "To" versions
    And package-lock.json reflects the new resolutions

  Scenario: pixelmatch downgrades to unblock the quickpickle peer range
    Given package.json devDependencies["pixelmatch"] == "^7.1.0"
    And quickpickle@1.11.2 declares an optional peer on pixelmatch@^6.0.0
    When pixelmatch is downgraded to ^6.0.0
    Then `npm ci` resolves without an ERESOLVE error
    And npm audit --audit-level=high stays at 0 findings

  Scenario: no source code change required, including in harness/dod-check
    Given harness/dod-check/lib/gherkin-map.ts imports Parser, AstBuilder, GherkinClassicTokenMatcher from @cucumber/gherkin and CucumberExpression, RegularExpression, ParameterTypeRegistry from @cucumber/cucumber-expressions
    When both packages are bumped to their major "To" versions
    Then harness/dod-check/lib/gherkin-map.ts is byte-identical to its pre-bump state
    And every file under src/, tests/, and harness/ is byte-identical to its pre-bump state

  Scenario: full test suite green, unmodified, including the harness suite
    Given the existing test suite passes pre-bump (781 product tests / 71 files; 252 harness tests / 18 files)
    When the bump is applied
    Then `npm run lint && npm run build && npm test && npm run test:harness` completes green
    And no test file is modified
```

**Gherkin-to-test-mapping audit (Story 2.5 retro action C).** As with story-maint-05/06/21, each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — 9 pins shift | `git diff` on [package.json](package.json) |
| 2 — pixelmatch unblocks CI | `npm install` exit code + `npm audit --audit-level=high` output in § "Pre-planning probe findings" |
| 3 — no source code change | `git diff --stat -- src/ tests/ harness/` (expected: empty) |
| 4 — test suites green unmodified | the 781-test product suite + 252-test harness suite (both unchanged) + CI |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R15 major-bump-zero-code collapse

Per [CLAUDE.md § 6.7](CLAUDE.md) / [§ 8 R15](CLAUDE.md), a major bump whose breaking-change audit produces a zero-code-change verdict collapses the standard `test:`/`feat:` rhythm to 4 commits. The pixelmatch fix is bundled into the same `chore(deps)` commit as the group bump rather than split into its own commit — the group bump cannot install cleanly without it, so splitting them would leave an intermediate commit in a broken (`npm ci`-failing) state.

1. `chore(docs): story-maint-22 plan + Phase 2 review (story-maint-22)` — this plan doc.
2. `chore(deps): bump dev-dependencies group (9 packages) + downgrade pixelmatch to unblock quickpickle's peer range (story-maint-22)` — `package.json` + `package-lock.json` only. Body notes the breaking-change audit conclusion, the pixelmatch fix rationale, and closes #196.
3. `refactor(harness): empty slot — gherkin-map.ts unchanged (story-maint-22)` — no-op, following the story-maint-05/21 "empty refactor slot with justification" pattern. Body: both majors' breaking changes are N/A to our usage per § "Surface area"; nothing to refactor.
4. `chore(retro): story-maint-22 retrospective (story-maint-22)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06/21: the fix is fully pre-specified (a version-pin change plus one extra pre-researched pin fix, both audited end-to-end), touches no Core or business logic, and the probe already ran successfully including the harness-specific test suite. No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (devDependency-only bump, no Core/domain concept touched — [CLAUDE.md § 6](CLAUDE.md) lane table): `sibling-overlap` only, `plan-reviewer` dropped. Findings below.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | PR #188 (Dependabot group bump) and issue #196 are the direct predecessors this story supersedes/closes; both need an explicit close post-merge since Dependabot won't auto-detect a manually-authored equivalent bump. | adopted | Will `gh pr close 188` and confirm `Closes #196` fires, same pattern as story-maint-21's #192/#195. |
| P2 (sibling-overlap) | Issues #57 and #198 are correctly referenced (not duplicated) — #57 stays open (real upstream fix still pending), #198 is unrelated harness tooling already anticipated by this plan's `text`-fenced pseudo-Gherkin block. | adopted | No plan change needed — confirms § "Selected solution" and § "Gherkin / AC scenarios" framing already had this right. |
| P2 (sibling-overlap) | No other open PR (28 checked) or issue (44 checked) touches `harness/dod-check/lib/gherkin-map.ts`, `package.json`/`package-lock.json`, any of the 9 bumped packages, or `pixelmatch`; none of the last 10 merged PRs touched this same surface. | adopted | Confirms no coordination risk beyond the two items above. |

**Phase 4 (code-reviewer + sibling-overlap, Reduced lane) — run 2026-07-08 against PR #199.**

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 (code-reviewer) | Audit table's "All other `@cucumber/*` changelog entries... scoped to PHP/.NET/C++/Java" claim was factually wrong for one entry: `@cucumber/gherkin` 37.0.0 has an **unscoped** breaking change ("Require messages v31 or greater") that moves `@cucumber/gherkin`'s own internal `@cucumber/messages` range, nesting a separate `@cucumber/messages@33.0.4` copy distinct from our top-level `27.2.0`. Empirically harmless (both copies' `IdGenerator.d.ts` are byte-identical; `test:harness` 252/252 green) but the audit's completeness claim was inaccurate. | fix-now | Added the missed entry to § "Breaking-change audit" with the full mechanism and empirical confirmation; corrected the "scoped to non-JS" framing on the remaining catch-all row. Second consecutive R15 story to hit this exact gap category (story-maint-21 retro item C) — see retro § Change. |
| P3 (code-reviewer, soft) | Plan's "Maintenance sub-loop" section didn't explicitly narrate the R23 story-id-uniqueness check, unlike its explicit R19 sibling-PR/issue walk. Second consecutive occurrence of this exact gap (story-maint-21 plan had the same soft finding). | fix-now | Added an explicit R23 narration line to § "Maintenance sub-loop" (no actual collision existed either time, but the check should be visibly walked, not just implicitly true). |
| P3 (code-reviewer, soft) | R15's commit envelope and the § 6 lane-selection table (R13/R14/R16) still aren't formally reconciled — identical finding to story-maint-21's Phase 4 review, now a second data point. | fix-now (process, not plan text) | Filed [issue #200](https://github.com/xavierbriand/accounting/issues/200) — two consecutive identical findings crosses this repo's own retro-codification threshold (maint-05→maint-06 precedent: "codify once it reproduces"). |
| P3 (code-reviewer, soft) | `package-lock.json` diff (459 lines) is much larger than the 10 top-level `package.json` pins, from ordinary transitive re-resolution (typescript-eslint/vitest/rolldown sub-packages) plus the nested `@cucumber/messages` copy above — the probe table didn't call this out the way it did for `package.json`. | fix-now | Added an explicit `package-lock.json` diff row to § "Pre-planning probe findings" explaining the benign churn. |
| P4 (sibling-overlap) | Re-check for new overlap since Phase 2: none found. #188/#196 reconfirmed as the correct predecessors (still open, unchanged, no new commits on #188). | acknowledge | No action — confirms Phase 2's findings still hold. |

## Merge checklist

- [x] `lint` / `build` / `test` / `test:harness` green on CI
- [ ] PR out of draft
- [x] Retrospective file committed at `docs/retrospectives/story-maint-22.md`
- [x] All suggestion-log items resolved (no blank `Resolution` cells)
- [x] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
