# Story maint-33 — dev-dependencies group bump (7 of 8), typescript 7 excluded

## Context

[Dependabot PR #260](https://github.com/xavierbriand/accounting/pull/260) ("chore(deps-dev): bump the dev-dependencies group across 1 directory with 8 updates") bundles one major that fails an empirical probe (see § "Surface area" below). Per [CLAUDE.md § 6.7](../../CLAUDE.md), this routes the group to a full story rather than a routine merge. This is the third occurrence of this exact shape — [story-maint-22](story-maint-22.md) and [story-maint-28](story-maint-28.md) both excluded a `typescript` major from the same grouped bump for the identical reason (`typescript-eslint`'s declared peer range). `pixelmatch`, the other package story-maint-28 had to exclude, is no longer a dependency at all — dropped entirely in `10edd6b` ("quickpickle ≥1.11.2 declares it an optional peer with lazy import", closes #57) — so this bump only has one exclusion, not two.

**No model impact** — pure devDependency-version bump, no Core domain concept touched (R24 default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, part of a combined "fix open Dependabot PRs" session.**
- **Sibling work:** `gh pr list --state open` at session start showed 4 open Dependabot PRs (#251, #257, #259, #260) plus one unrelated story PR (#255, story-maint-31, already has its own issue). #251 (`actions/setup-node` 6→7) was routine and merged directly in this same session, no story needed. #257 (chalk) and #259 (better-sqlite3) are siblings of this story, planned as separate stories in the same session — see the id-collision note directly below for why their ids are not fixed here.
- **Live story-id collision, caught mid-flight by Phase 4 review, not by the Phase 2/R23 pre-check.** This plan originally pre-assigned `story-maint-34` to the better-sqlite3 sibling story. While this story's Phase 4 review agents were running (~11:46–12:04), a fully unrelated, already-open PR ([#263](https://github.com/xavierbriand/accounting/pull/263), "Move the CLAUDE.md conflict-resolution protocol into an on-demand command") merged to `main` under the id `story-maint-34` (merge commit `25ba6d4`, `mergedAt: 2026-08-10T12:00:49Z`) — a concurrent session outside this one. Re-verified live post-discovery: `git ls-tree -r origin/main -- docs/plans/ docs/retrospectives/` now shows `story-maint-34.md` committed; `story-maint-35` and above remain free. The better-sqlite3 sibling story is renumbered to **story-maint-35** as a result (see its own plan file once opened); chalk shifts to **story-maint-36**. This is the same class of gap story-maint-28's retro named ("extend R23 to check in-flight PRs' added plan-file paths, not just branch names") reproducing a second time, now against a story that hadn't even been drafted yet at pre-check time — no mechanical fix available at plan time for an id that gets claimed *after* the check runs; noted here for the retro's own Try section rather than re-litigated in this bullet.
- **Open issues touching this surface:** none open — [#225](https://github.com/xavierbriand/accounting/issues/225) (the maint-28 tracking issue for this exact recurring shape) is closed; not reopened since this story closes the loop again directly. [#57](https://github.com/xavierbriand/accounting/issues/57) (pixelmatch) is now moot — closed by `10edd6b`, unrelated to this diff regardless.
- **No separate tracking issue filed.** Unlike maint-28 (issue filed by a prior sub-loop session, executed by a later one), this story is planned and executed in the same sitting that discovered the routing block — no handoff gap to bridge with an issue.
- **Story-id uniqueness (R23):** `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i maint-33` → empty. `gh pr list --state open --json headRefName` → no branch references `maint-33`. Clean.
- **Coordination with PR #260 (Dependabot's own PR, superseded by this story).** Per the story-maint-21/#192, story-maint-22/#188, and story-maint-28/#218 precedent — all three needed an explicit manual close after merge, and story-maint-28 documented this race actually happening twice (#220, #222 merged directly mid-story by the user, outside the agent session) — PR #260 must be closed manually immediately after this story's PR merges. Until then, #260 stays open and mergeable (`gh pr checks 260` currently shows `build: fail`, but nothing at the platform level prevents a direct merge that would reintroduce the excluded `typescript` 7 bump); this plan explicitly does not rely on Dependabot auto-detecting supersession.
- **`npm audit --audit-level=high`:** 4 pre-existing high findings (brace-expansion, js-yaml, nanoid, postcss), unchanged pre- and post-bump — already tracked by [#261](https://github.com/xavierbriand/accounting/issues/261) and [#262](https://github.com/xavierbriand/accounting/issues/262), out of scope for this diff.
- **Proceed-to-planning.**

## Motivation

1. **Clears the routing block on PR #260.** The group can't be merged as-is — Dependabot's own PR bundles all 8 into one diff, and one of them breaks CI outright.
2. **`typescript` 6→7 is a major that fails an empirical probe** (see below) — routes to a full story regardless of changelog reading, per this repo's own "probe, don't just read the changelog" lesson (story-maint-21/22/28).
3. **The other 7 updates are confirmed zero-code-change** via a full local probe (lint/build/test/test:harness/audit), matching baseline.

## Surface area (pre-planning probe)

**Package inventory (8 changes proposed by Dependabot; 7 taken, 1 excluded):**

| Package | From | To | Kind | Disposition |
| --- | --- | --- | --- | --- |
| `@cucumber/cucumber-expressions` | `20.0.0` | `20.1.0` | minor | taken |
| `@cucumber/gherkin` | `41.0.0` | `42.0.1` | major (semver) | taken — see below |
| `@types/node` | `26.1.1` | `26.1.2` | patch | taken |
| `eslint` | `10.7.0` | `10.8.0` | minor | taken |
| `prettier` | `3.9.5` | `3.9.6` | patch | taken |
| `tsx` | `4.23.1` | `4.23.10` | patch | taken |
| `typescript-eslint` | `8.64.0` | `8.66.0` | minor | taken |
| `typescript` | `6.0.3` | `7.0.2` | **major** | **excluded** — see below |

**"To" column is Dependabot's proposed target, not necessarily the exact version `npm install` resolves.** `package.json` pins the 7 taken packages to the caret ranges above (e.g. `^10.8.0`); `npm install` resolves each to the *latest* range-matching version published at lockfile-generation time, which for 3 packages was already newer by the time this probe ran: `@types/node` resolved to `26.2.0` (not `26.1.2`), `eslint` to `10.8.1` (not `10.8.0`), `tsx` to `4.23.12` (not `4.23.10`) — confirmed via `node -e "require('./package-lock.json').packages['node_modules/<pkg>'].version"` for each. The other 4 taken packages resolved to exactly the table's "To" value. `package.json`'s declared ranges are correct either way (caret ranges are satisfied by the newer resolutions); this is normal `npm install` behaviour, not a plan error, flagged here because Phase 4 review correctly caught the plan's first draft stating the resolved versions as exact rather than as Dependabot's proposal.

**Why `typescript` is excluded — confirmed by empirical probe, not changelog reading.** CI on PR #260 already fails at `npm ci`:

```
npm error While resolving: typescript-eslint@8.66.0
npm error Found: typescript@7.0.2
npm error Could not resolve dependency:
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.66.0
```

`npm view typescript-eslint@8.66.0 peerDependencies` confirms the same range upstream today. This is the third consecutive occurrence of this exact incompatibility (story-maint-22, story-maint-28, now this story) — `typescript-eslint` has not shipped TS7 support across any of the three sightings. Excluded until it does.

**Why `@cucumber/gherkin` 41→42 is taken despite being a semver-major.** Read the real changelog rather than assuming "major = risky": v42.0.0's changes are i18n additions (Persian translation), a revived Dart implementation, "allow steps to have both a DocString and a Datatable argument" (a parser *relaxation* — previously-invalid combinations become valid, not a breaking narrowing), a `cucumber/messages` schema-floor bump (this repo doesn't depend on `@cucumber/messages` directly), and non-JS toolchain changes (C++, Ruby). No JS-facing breaking change identified. Confirmed empirically: the full acceptance-test tier (`tests/features/*.feature`, parsed via `quickpickle` → `@cucumber/gherkin`) passes unchanged post-bump.

**Conclusion:** the 7 taken packages produce zero *production*-code change and zero *test*-code change. `fast-check` remains at its current pin (not part of this group). The full, corrected import-site inventory (Phase 4 review found the first draft's version incomplete): `eslint` is imported directly in both [tests/_helpers/eslint-rule-tester.ts](../../tests/_helpers/eslint-rule-tester.ts) and [tests/unit/eslint-rules/boundary/layer-boundary.test.ts](../../tests/unit/eslint-rules/boundary/layer-boundary.test.ts) (`{ Linter }`), plus type-only imports in [eslint-rules/boundary/index.d.ts](../../eslint-rules/boundary/index.d.ts) and [eslint-rules/test-smells/index.d.ts](../../eslint-rules/test-smells/index.d.ts); `typescript-eslint` only in `eslint-rule-tester.ts`. `@cucumber/gherkin` and `@cucumber/cucumber-expressions` **are** imported directly — not merely "transitively via quickpickle" as the first draft claimed — in [harness/dod-check/lib/gherkin-map.ts](../../harness/dod-check/lib/gherkin-map.ts) (`Parser`, `AstBuilder`, `GherkinClassicTokenMatcher` from the former; `CucumberExpression`, `RegularExpression`, `ParameterTypeRegistry` from the latter), which also imports `IdGenerator` from `@cucumber/messages` directly (a transitive dependency of `@cucumber/gherkin`, not a direct `package.json` entry — the earlier "doesn't depend on `@cucumber/messages` directly" line was true only at the manifest-declaration level, not the source-import level). All of these are pre-existing, expected roles for lint/BDD tooling — none are new call sites introduced by this bump — confirmed by `npm run test:harness` (which exercises `gherkin-map.ts` via `harness/dod-check/tests/gherkin-map.test.ts`) and the full lint-rule test suite passing unchanged.

## Pre-planning probe findings

Ran `npm install` with `package.json` pinned to the 7 taken versions (typescript left at `^6.0.3`) + `npm run lint && npm run build && npm test && npm run test:harness` + `npm audit --audit-level=high` in this worktree on 2026-08-10.

One transient note: the very first pre-bump baseline run of `npm test` showed 2 failures in `tests/integration/cli/symlink-dbpath-refuse.test.ts` (both `exits 2, stderr contains "refusing to open dbPath"...`). Re-running that file in isolation 3× and the full suite 2× more (all still pre-bump — no `package.json`/lockfile change had been made yet at that point) came back green every time, and stayed green through every post-bump run below — a one-off scheduling flake in this sandboxed environment, not a real regression and not caused by this bump (confirmed by reproducing green both before and after the dependency change).

| Gate | Pre-bump (stable state) | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm install` | — | clean, no `ERESOLVE` | — |
| `npm run lint` | 124 warnings, 0 errors | 124 warnings, 0 errors (identical) | 0 |
| `npm run build` | green | green | 0 |
| `npm test` | 1263 passed / 1 skipped, 119 files | 1263 passed / 1 skipped, 119 files | 0 |
| `npm run test:harness` | 379 passed, 23 files | 379 passed, 23 files | 0 |
| `npm audit --audit-level=high` | 4 findings (pre-existing, tracked by #261/#262) | 4 findings (identical) | 0 |
| `git diff --stat -- src/ tests/ harness/` | — | empty | 0 LOC changed |
| `package.json` diff | — | 7 line-pairs (the 7 taken bumps only) | as planned |
| `package-lock.json` diff | — | 190 changed lines (95 insertions / 95 deletions) | benign |

## Production-code surface (R2)

None. This diff touches only `docs/plans/story-maint-33.md`, `package.json`, and `package-lock.json` — no file under `src/` changes type, signature, or format.

## Selected solution

**Option A — take the 7 unambiguously-safe updates, exclude `typescript`, zero code change.** Chosen: the exclusion is backed by a concrete, reproduced CI failure and a confirmed-live upstream peer-range constraint, not speculation; the semver-major `@cucumber/gherkin` bump is backed by an actual changelog read plus a green acceptance-test run, not just its version number. The 7 taken packages probe clean end-to-end.

**Option B — take all 8 as Dependabot proposed, fix the incompatibility forward (e.g. suppress the `typescript-eslint` peer conflict with `--legacy-peer-deps` or an `overrides` entry).** **Rejected:** there is no available fix short of dropping type-aware lint rules or switching linters — out of scope for a routine dependency bump, and the same workaround-vs-root-cause tradeoff story-maint-28 already rejected once for this identical situation.

**Option C — defer the entire group until `typescript-eslint` ships TS7 support.** **Rejected:** would leave 7 genuinely-safe, already-probed-green updates sitting idle for no reason; better to take what's safe now and re-attempt `typescript` in a future maintenance sub-loop once the toolchain catches up.

## Gherkin / AC scenarios

No `.feature` files — dep bumps have no CLI surface change. Scenarios map 1:1 to post-bump verification, per the story-maint-05/06/21/22/28 Gherkin-to-test-mapping precedent. **Pseudo-Gherkin, not automatable:** fenced as ` ```text ` rather than ` ```gherkin ` deliberately — `harness/dod-check`'s Gherkin↔step hard gate treats any ` ```gherkin ` fenced block as scenarios that must resolve against real `.feature` files ([issue #198](https://github.com/xavierbriand/accounting/issues/198)).

```text
Feature: dev-dependencies group bump (7 of 8), typescript 7 excluded

  Scenario: the 7 safe pins shift to their target versions
    Given package.json devDependencies pin the 7 "From" versions listed in § "Surface area"
    When the partial group bump is applied
    Then package.json devDependencies pin the 7 "To" versions
    And package-lock.json reflects the new resolutions
    And typescript stays at ^6.0.3

  Scenario: typescript 7 is confirmed incompatible with the current lint toolchain
    Given typescript-eslint@8.66.0 declares peerDependencies typescript ">=4.8.4 <6.1.0"
    When PR #260's own CI runs npm ci with typescript bumped to 7.0.2
    Then the install fails with an ERESOLVE peer-dependency conflict
    And the bump is excluded from this story

  Scenario: no source code change required
    Given none of the 7 taken packages are imported directly by src/ code
    When the partial group bump is applied
    Then every file under src/, tests/, and harness/ is byte-identical to its pre-bump state

  Scenario: full test suite green, unmodified
    Given the existing test suite passes pre-bump (1263 product tests / 119 files; 379 harness tests / 23 files)
    When the bump is applied
    Then `npm run lint && npm run build && npm test && npm run test:harness` completes green
    And no test file is modified
```

**Gherkin-to-test-mapping audit.** Each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — 7 pins shift, 1 stays pinned | `git diff` on [package.json](../../package.json) |
| 2 — typescript 7 incompatibility confirmed | PR #260's own CI failure log (this plan, § "Surface area") |
| 3 — no source code change | `git diff --stat -- src/ tests/ harness/` (expected: empty) |
| 4 — test suites green unmodified | the 1263-test product suite + 379-test harness suite (both unchanged) + CI |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R16 zero-behaviour-change collapse

Per [CLAUDE.md § 6.7](../../CLAUDE.md) / [§ 8 R16](../../CLAUDE.md), a bump whose breaking-change audit produces a zero-code-change verdict for the taken subset collapses the standard `test:`/`feat:` rhythm to 4 commits (prep commit exempted from the count).

1. `chore(docs): story-maint-33 plan + P1/P2/P3 review (story-maint-33)` — this plan doc (prep, R30-exempt).
2. `chore(deps): bump dev-dependencies group (7 of 8) — exclude typescript 7 (story-maint-33)` — `package.json` + `package-lock.json` only. Body notes the exclusion's concrete evidence.
3. `refactor: empty slot — no source change required (story-maint-33)` — no-op, following the story-maint-05/21/22/28 "empty refactor slot with justification" pattern.
4. `chore(retro): story-maint-33 retrospective (story-maint-33)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06/21/22/28: the fix is fully pre-specified and probed end-to-end already. No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (devDependency-only bump, no Core/domain concept touched — [CLAUDE.md § 6](../../CLAUDE.md) lane table): `sibling-overlap` only, `plan-reviewer` dropped. Findings filled in below after the agent runs.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | **Blocking:** plan discussed PR #260 extensively but had no explicit "close #260 manually post-merge" step or merge-race warning, despite all three direct precedents (story-maint-21/#192, story-maint-22/#188, story-maint-28/#218) carrying exactly this coordination step — and story-maint-28 documenting the race happening twice already (#220/#222 merged directly mid-story). | adopted (blocking, fixed) | Added the coordination bullet to § "Maintenance sub-loop" above; will `gh pr close 260` manually immediately after this story's PR merges. |
| P2 (sibling-overlap) | #259 (better-sqlite3) and #257 (chalk) touch `package.json`/`package-lock.json` but are fully disjoint packages, already correctly deferred to sibling story-maint-34/35 in this plan's Context. | acknowledge | No plan change needed. |
| P2 (sibling-overlap) | Issue #239 (dod-check R16 envelope-heading regex gap) doesn't fire against this plan — its "Commit sequence — R16..." heading doesn't match the `parseEnvelopeRule` trigger pattern (`^## (?:Slice plan\|Sizing...)`), same accidentally-safe wording used by story-maint-21/22/27/28. | acknowledge | No plan change needed; noted for awareness only. |
| P2 (sibling-overlap) | Story-id uniqueness (R23) and prior-narration checks (typescript-7/typescript-eslint incompatibility not mentioned in any other open PR/issue) both came back clean. | acknowledge | No plan change needed. |

**Phase 4 (code-reviewer + sibling-overlap, Reduced lane) — run 2026-08-10 against PR #264.**

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 (code-reviewer) | Plan/PR-body/commit-body stated the "To" versions for `@types/node`/`eslint`/`tsx` as exact resolved versions, but caret-range `npm install` actually resolved 3 of the 7 to slightly newer patch versions (`26.2.0`/`10.8.1`/`4.23.12`) than Dependabot originally proposed. | fix-now | Added the "'To' column is Dependabot's proposed target, not necessarily the exact resolved version" note to § "Surface area" with the real resolved figures; corrected the `chore(deps)` commit body in the history rewrite below. |
| P1 (code-reviewer) | **R23, real and live:** plan pre-assigned `story-maint-34` to the better-sqlite3 sibling story, but that id was claimed and merged by an unrelated concurrent PR (#263) while this story's Phase 4 review was in flight. | fix-now | Renumbered the sibling stories to story-maint-35 (better-sqlite3) and story-maint-36 (chalk); documented the live collision in § "Maintenance sub-loop" above. |
| P3 (code-reviewer, R11) | Empty-refactor commit's import-site justification was incomplete/inaccurate: missed a second `eslint` import site (`tests/unit/eslint-rules/boundary/layer-boundary.test.ts`) and wrongly claimed `@cucumber/gherkin`/`@cucumber/cucumber-expressions` are only consumed transitively, when `harness/dod-check/lib/gherkin-map.ts` imports both directly (plus `@cucumber/messages`, transitively resolved). | fix-now | Rewrote § "Surface area" Conclusion with the full corrected inventory; corrected the `refactor:` commit body in the history rewrite below. Functionally inconsequential — `test:harness` exercises `gherkin-map.ts` and passed unchanged both times — but the stated premise needed to be accurate. |
| P3 (code-reviewer, R26) | 3rd consecutive occurrence (after story-maint-27, story-maint-28) of a Reduced-lane story using the R16 envelope, a pairing CLAUDE.md § 6's lane table doesn't literally list (only Light→R16 is listed, from #200's partial fix). | defer-issue | Filed [#268](https://github.com/xavierbriand/accounting/issues/268), citing all 3 occurrences and proposing the table fix. Out of scope to fix CLAUDE.md § 6 inline in a dependency-bump PR. |
| P3 (code-reviewer, soft) | Type-only `eslint` imports in `eslint-rules/boundary/index.d.ts` and `eslint-rules/test-smells/index.d.ts` are a further, lower-materiality gap in the same import-site audit. | fix-now | Folded into the same Conclusion-paragraph rewrite above (cheap to include while already correcting the list). |
| P2 (code-reviewer) | None — no monetary/domain code touched; `npm audit` findings confirmed pre-existing and unchanged, independently re-checked against live CI. | acknowledge | No action needed. |
| P4 (sibling-overlap re-check) | No new findings since Phase 2; PR #260 still open/unmerged/unmodified; PR #264's actual diff matches the plan's declared scope exactly (same lockfile-caret-resolution observation as the code-reviewer's P1 finding above, independently corroborated). | acknowledge | No plan change beyond the P1 fix already applied. |

## Merge checklist

- [x] `lint` / `build` / `test` / `test:harness` green on CI
- [ ] PR out of draft
- [x] Retrospective file committed at `docs/retrospectives/story-maint-33.md`
- [x] All suggestion-log items resolved (no blank `Resolution` cells)
- [x] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
