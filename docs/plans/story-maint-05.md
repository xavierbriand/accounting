# Story maint-05 — Migrate `@inquirer/prompts` 5.5.0 → 8.4.2

## Context

`@inquirer/prompts` is a runtime dep currently pinned at `^5.5.0` ([package.json:28](package.json)). Latest is `8.4.2` — a 3-major-version jump. Filed as [#38](https://github.com/xavierbriand/accounting/issues/38) by the 2026-04-24 maintenance sub-loop and explicitly flagged in [CLAUDE.md § 6.7](CLAUDE.md) as a major runtime bump that must go through the main story loop (DoR/DoD/retro), not merged directly.

**Position in the pre-Epic-3 sequence** (from [story-maint-01 plan](docs/plans/story-maint-01.md) § Context): `#18 → #22 → #35 → #21 → #38 → #12 → #11 → Epic 3`. #18, #22, #35 shipped as stories maint-01/02/03. #21 (dbPath traversal) went in flight as PR #50 (= story-maint-04) in parallel with this story. #38 is therefore **story-maint-05** — renamed from the originally-planned `maint-04` to resolve the namespace collision with PR #50 (PR #50 was opened minutes after PR #48 but #21 precedes #38 in the sequence).

**Maintenance sub-loop (CLAUDE.md § 6.7) — 2026-04-24, this run.**
- **Open Dependabot PRs:** none. (PRs #45 and #36 are draft `story-maint-03` + plugin scaffold, not dep bumps.)
- **Open issues (12):** no re-triage needed; nothing stale. All `deferred-suggestion` items still map to valid follow-ups.
- **`npm audit`:** 0 high/critical. 4 low on the `@inquirer/*` chain (`@inquirer/prompts@5` → `@inquirer/editor` → `external-editor` → `tmp` — GHSA-52f5-9888-hmc6) — this story fixes them. 4 moderate on the `quickpickle / @cucumber/* / uuid` chain — out of scope, tracked in [#24](https://github.com/xavierbriand/accounting/issues/24).

**Proceed-to-planning.**

## Motivation

1. **Clears the low-sev `npm audit` chain** (`@inquirer/editor → external-editor → tmp`). Upstream fix is `@inquirer/prompts@8.4.2`.
2. **Supported major.** v5 is no longer patched. v6/v7 are likewise stale; v8 is the current line.
3. **Small surface area now + audit on paper = ideal time.** Any drift against the v8 API will only grow as the CLI surface grows post-Epic-3.

## Surface area (pre-planning probe)

One file imports `@inquirer/prompts` directly: [src/cli/utils/interactive.ts:1](src/cli/utils/interactive.ts).

```ts
import { select, confirm } from '@inquirer/prompts';
```

Used by [src/cli/commands/ingest-command.ts:187](src/cli/commands/ingest-command.ts) and [src/cli/program.ts:61](src/cli/program.ts) through the `InteractivePrompter` port — callers depend on our own interface, not `@inquirer/prompts` directly, so the dep boundary is narrow.

**Call-signature audit against v8:**

| Call site | Usage | v8 signature | Delta |
| --- | --- | --- | --- |
| [interactive.ts:29–32](src/cli/utils/interactive.ts) | `select({ message, choices })` | Same shape accepted | None |
| [interactive.ts:40–43](src/cli/utils/interactive.ts) | `confirm({ message, default })` | Same shape accepted | None |

No `cancel()`, no `theme`, no `instructions`, no legacy `inquirer` package — i.e., nothing from the v6/v7/v8 breaking-change surface.

**Automated test coverage of the boundary.** None. All `InteractivePrompter` tests use a mock of the port ([tests/unit/cli/commands/ingest-command.test.ts:92,148,187,221,292](tests/unit/cli/commands/ingest-command.test.ts)). Story 2.4 retro ([docs/retrospectives/story-2.4.md:13,24](docs/retrospectives/story-2.4.md)) records this as intentional: `@inquirer/prompts` v5 writes directly to `process.stderr` and bypasses injected streams, so the port-mock pattern was chosen over end-to-end prompt assertions. The AC for this story therefore includes a **manual smoke-test** step (below).

## Breaking-change audit (issue body + cross-check with repo)

| Version | Breaking change | Our usage | Impact |
| --- | --- | --- | --- |
| 6.0.0 | Prefix `?` → `✓` after answer; themeable | No custom theme | Cosmetic only |
| 7.0.0 | `@types/node` → `peerDependencies` | Already in [devDependencies](package.json) (`^25.6.0`) | None |
| 8.0.0 | ESM-only | [package.json:20](package.json) `"type": "module"` | None |
| 8.0.0 | Node ≥ 20 | CI runs Node 20 ([.github/workflows/ci.yml:18](.github/workflows/ci.yml)); stack baseline | None |
| 8.0.0 | Legacy `inquirer` list alias removed | We import `@inquirer/prompts` directly | None |
| 8.0.0 | `theme.helpMode` → `theme.style.keysHelpTip` | No theme | None |
| 8.0.0 | `checkbox`/`search`/`select` `instructions` option removed | Not used | None |
| 8.0.0 | Promise `.cancel()` → `AbortSignal` | Not used | None |
| 8.0.0 | `yoctocolors` → Node `util.styleText` (internal) | Transparent | None |

**Conclusion:** zero code change in `interactive.ts` expected. The migration is `package.json` + `package-lock.json` only.

## Pre-planning probe findings

Ran `npm install @inquirer/prompts@8.4.2 --save` + `npm run lint && npm run build && npm test` + `npm audit` in this worktree on 2026-04-24, following the story-maint-01 pre-planning-probe precedent. Results:

| Gate | Pre-bump | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm run lint` | green | green | 0 |
| `npm run build` (`tsc` + `tsc -p tsconfig.test.json`) | green | green | 0 |
| `npm test` | 213 tests pass across 23 files (probe time) | 213 post-bump / 217 post-rebase across 25 files[^rebase] | 0 (bump delta) |
| `npm audit` — `@inquirer/*` chain | 4 low (`@inquirer/editor`, `@inquirer/prompts`, `external-editor`, `tmp`) | 0 findings | chain cleared |
| `npm audit` — `quickpickle / @cucumber/* / uuid` chain | 4 moderate | 4 moderate (unchanged) | out of scope (#24) |
| `src/cli/utils/interactive.ts` diff | — | byte-identical | 0 LOC changed |

Transitive churn: `@inquirer/prompts@8` internalises `external-editor` as `@inquirer/external-editor@3` and migrates colouring from `yoctocolors` to Node `util.styleText` — this is what clears the `tmp` GHSA-52f5-9888-hmc6 chain. `@inquirer/core@11`, `@inquirer/ansi@2`, `@inquirer/figures@2` come along as internal restructuring.

The probe confirms the plan's § 5 scenarios 1–4 pass verbatim. Scenario 5 (manual smoke-test) remains a user-executed AC, unchanged.

[^rebase]: Mid-story, [PR #45](https://github.com/xavierbriand/accounting/pull/45) (story-maint-03) and [PR #47](https://github.com/xavierbriand/accounting/pull/47) (CI token scope hardening) merged to main. The branch was rebased onto the new tip. #45 added 4 tests in 2 new files; the bump itself still contributes 0 tests. Post-rebase suite is 217/217 green with `@inquirer/*` audit chain still 0. Historical probe-time count (213) kept above as the authoritative delta-0 proof for this story.

## Selected solution

Three approaches considered.

### Divergent options

**Option A — straight `npm install @inquirer/prompts@8.4.2 --save`, zero code change.**  Bump the pin, regenerate lockfile, run the suite, smoke-test locally, commit. **Pro:** smallest diff; matches issue scope verbatim; preserves the existing port boundary. **Con:** manual smoke-test remains the final AC; no net-new automated coverage of the dep boundary.

**Option B — bump + add a stdin-driven integration test for `inquirerPrompter`.** Same bump, plus a new `tests/integration/cli/interactive.test.ts` that drives a `PassThrough` stdin through the real `select` + `confirm` calls and asserts the returned values. **Pro:** removes the manual-smoke-test dependency; protects future v9/v10 bumps with automated coverage. **Con:** story 2.4 retro recorded that v5 `@inquirer/prompts` writes directly to `process.stderr`, bypassing injected streams — whether v8 exposes a clean stdin injection path is an unknown; scope creep beyond issue's "zero or near-zero code change"; meaningful test scaffolding (TTY emulation) adds several files and ~100 LOC. **Rejected** — worth filing as a follow-up issue if we accumulate more dep-boundary friction, but premature now.

**Option C — replace `@inquirer/prompts` with a lighter dep (`@clack/prompts`, `prompts`, hand-rolled readline).** **Pro:** one fewer major rebase to worry about on future stories. **Con:** out of scope; changes the port's character (library-specific conventions leak into defaults, error styling); YAGNI per engineering-standards.md "at least two concrete callers". **Rejected.**

### Chosen — Option A

Rationale:
- Breaking-change audit is airtight — every v6/v7/v8 breaking change is either N/A or already satisfied by our stack (confirmed against [package.json](package.json), [tsconfig.json](tsconfig.json), [.github/workflows/ci.yml](.github/workflows/ci.yml)).
- Manual smoke-test is the established AC for interactive CLI per [CLAUDE.md § 2](CLAUDE.md) ("For UI or frontend changes, start the dev server and use the feature… type checking and test suites verify code correctness, not feature correctness").
- Automated coverage gap is a known limitation from Story 2.4, not a new regression; deferring it preserves issue scope and defers the v8-stdin-injection unknown until we have a reason to need it.

## Gherkin / AC scenarios

No `.feature` files — dep bumps have no CLI surface change. Scenarios map 1:1 to post-bump verification.

```gherkin
Feature: @inquirer/prompts 5.5.0 → 8.4.2 migration

  Scenario: dependency pin shifts to v8
    Given package.json dependencies["@inquirer/prompts"] == "^5.5.0"
    When `npm install @inquirer/prompts@8.4.2 --save` is applied
    Then package.json dependencies["@inquirer/prompts"] == "^8.4.2"
    And package-lock.json reflects the new resolution

  Scenario: no source code change required
    Given src/cli/utils/interactive.ts imports { select, confirm } from '@inquirer/prompts'
    And uses select({ message, choices }) and confirm({ message, default })
    When the dep is bumped to 8.4.2
    Then src/cli/utils/interactive.ts is byte-identical to its pre-bump state

  Scenario: npm audit low-sev chain clears
    Given npm audit currently reports 4 low findings on the @inquirer/* / external-editor / tmp chain
    When the dep is bumped to 8.4.2
    Then npm audit reports 0 low/moderate/high/critical findings on that chain
    And moderate findings on quickpickle / @cucumber/* / uuid remain unchanged (tracked in #24)

  Scenario: full test suite green, unmodified
    Given the existing test suite passes pre-bump (213 at probe time; 217 post-rebase after #45 + #47 landed on main)
    When the dep is bumped to 8.4.2
    Then `npm run lint && npm run build && npm test` completes green on the developer machine and on CI
    And no test file is modified

  Scenario: manual smoke-test of the interactive ingest flow (user-executed)
    Given a synthetic BPCE CSV from tests/fixtures/csv/
    When `npm run ingest -- <path>` runs interactively
    Then the category-select prompt lists choices in the expected layout
    And the 'Abort' choice returns { action: 'abort' } and exits cleanly
    And the 'Keep: <category>' choice returns { action: 'keep' }
    And the 'Change to: <other>' choice returns { action: 'change', category: '<other>' }
    And the final confirm prompt honours both the default (No) and an explicit Yes
    And the post-answer prefix displays '✓' (v6 cosmetic change, not '?') — not a regression
```

**Gherkin-to-test-mapping audit (Story 2.5 retro action C, [CLAUDE.md § 6.1](CLAUDE.md)).** The P1 retro-check in Phase 4 asks whether every Gherkin scenario has at least one corresponding test whose `fails if …` clause regresses when the scenario's production path breaks. For this story the mapping is unconventional because there is no new production path — each scenario asserts an invariant about the bump itself, not a behaviour the code implements:

| Scenario | Verification mechanism (not a test file) |
| --- | --- |
| 1 — pin shifts to v8 | `git diff` on [package.json](package.json) |
| 2 — no source code change | `git diff` on [src/cli/utils/interactive.ts](src/cli/utils/interactive.ts) (expected: empty) |
| 3 — audit chain clears | `npm audit` output + probe table in § 4 |
| 4 — test suite green unmodified | the 213-test suite (unchanged) + CI |
| 5 — manual smoke-test | user-executed |

Phase 4 should therefore skip the standard scenario-to-test walk and substitute a probe-diff audit + suite-green check. Flagged here so the reviewer doesn't file a spurious "missing test coverage" blocker.

## Commit sequence

Per [CLAUDE.md § 6.4](CLAUDE.md) the canonical rhythm is `test: → feat: → refactor:`. For this story the rhythm **cannot apply** — there is no behaviour to test-drive because there is no behaviour change. The `chore(deps)` commit replaces the `test:/feat:` pair by construction, not by shortcut:

- **Why not a synthetic `test:` commit.** Options considered: (a) an export-existence assertion (`typeof select === 'function'`) — redundant with `tsc` strict type-checking at build; (b) a stdin-driven integration test — blocked on the v5 stderr-bypass unknown flagged in Option B rejection; (c) a `package.json` assertion that the pinned version is `^8.x` — tautological. None add invariant protection that doesn't already exist. A synthetic commit would add ceremony without adding a guard.
- **Precedent — Dependabot minor (`chore(deps): bump ora 9.3.0 → 9.4.0 (#37)`)** — § 6.7 explicitly waives the rhythm for routine minor bumps. That waiver applies *because* there is no behaviour change to test-drive, not *because* the bump is minor. The same logic applies to a major bump whose breaking-change audit produces a zero-code-change verdict.
- **Flag for Phase 5.** [CLAUDE.md § 6.4](CLAUDE.md) doesn't currently address major-bump-with-zero-code-change stories. Worth a retro action item to add a one-line clarification: "When § 6.7 routes a major dep bump through the main loop, and the breaking-change audit produces a zero-code-change verdict, the rhythm collapses to `chore(docs): plan` + `chore(deps): bump` + `refactor: empty slot` + `chore(retro)`. This is not a deviation but a documented mode."

Sequence (4 commits):

1. `chore(docs): story-maint-05 plan + P1/P2/P3 review (story-maint-05)` — this plan doc.
2. `chore(deps): bump @inquirer/prompts from 5.5.0 to 8.4.2 (story-maint-05)` — `package.json` + `package-lock.json` only. Body:
   > 3-major-version skip (5 → 6 → 7 → 8). Breaking-change audit in docs/plans/story-maint-05.md § 4: zero impact — our usage is `select` + `confirm` with `{ message, choices, default }` only. No theming, no `cancel()`, no `instructions`, no legacy `inquirer` alias. Closes the low-sev `@inquirer/editor → external-editor → tmp` audit chain (GHSA-52f5-9888-hmc6). Closes #38.
3. `refactor(cli): empty slot — interactive.ts unchanged (story-maint-05)` — following the story-maint-02 "empty refactor slot with justification" pattern ([CLAUDE.md § 6.4](CLAUDE.md)). Body:
   > No-op: src/cli/utils/interactive.ts is byte-identical to its pre-bump state. All v6/v7/v8 breaking changes are N/A to our usage per docs/plans/story-maint-05.md § 4. Nothing to refactor.
4. `chore(retro): story-maint-05 retrospective (story-maint-05)` — `docs/retrospectives/story-maint-05.md`.

Squash on merge optional.

## Implementation phase (Phase 3) — collapsed into the pre-planning probe

The pre-planning probe in § 4 *is* the implementation. Per the original Phase 3 options:

- **Default — delegate to `sonnet-implementer` via Task.** Protocol-compliant, but would require reverting the probe, re-running the install via Sonnet, and confirming the exact same outcome. Pure ceremony for a two-file diff with a fully-specified plan.
- **Alternative — Opus executes directly.** Justifiable under the [CLAUDE.md § 6.1 phase 4](CLAUDE.md) trivial-inline-fix carve-out: two-file diff (`package.json` + `package-lock.json`), fix coordinates fully pre-specified, no design question remains, no Core or Infra code touched. The carve-out is written for Phase 4 refactors but the same rationale applies to a zero-code-change Phase 3.
- **Chosen — probe stands as implementation.** The probe already ran (§ 4 table). Phase 3 collapses into Phase 1, mirroring story-maint-01's precedent where the pre-planning probe drove the plan. Flag for Phase 5 retro: "dep-bump stories with airtight breaking-change audits can collapse Phase 3 into the Phase 1 probe" — candidate CLAUDE.md § 6.7 clarification.

No separate Sonnet brief is issued. The commit sequence in § 7 is executed by Opus directly.

## Suggestion log

Phase 2 (pre-implementation P1/P2/P3) entries are populated below. Phase 4 (retro-check against the committed code) will extend this table after the dep-bump commit lands.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Issue #38 AC "existing unit tests for `inquirerPrompter` still green" is vacuously true — no such tests exist. Plan should acknowledge this explicitly, not silently. | adopted | Called out in § 3 ("No automated test coverage of the boundary"); also referenced by the Gherkin-to-test-mapping audit in § 5. |
| P1 | All 6 issue #38 AC bullets map to Gherkin scenarios in § 5 (pin shift, audit clearance, unmodified test suite, smoke-test, npm audit, DoR/DoD compliance). | adopted | Mapping verified during Phase 2 walk. |
| P2 | Smoke-test scenario should call out the v6 cosmetic prefix change (`?` → `✓` post-answer) so the user doesn't flag it as a regression during manual verification. | adopted | § 5 scenario 5 extended with the explicit "✓ vs ?" line. |
| P2 | Moderate `quickpickle / @cucumber/* / uuid` findings remain post-bump. | adopted | Explicit in § 4 probe table + § 5 scenario 3; out of scope, tracked in [#24](https://github.com/xavierbriand/accounting/issues/24). |
| P3 | `InteractivePrompter` port lives in [src/cli/utils/interactive.ts](src/cli/utils/interactive.ts), not `src/core/ports/` — possible architectural drift per [CLAUDE.md § 2](CLAUDE.md)? | rejected | Not drift: [src/core/](src/core/) does not depend on `InteractivePrompter`; only CLI does. CLI-layer code is allowed to define its own abstractions; the `src/core/ports/` rule applies only to ports that Core depends on. No change to plan. |
| P3 | Commit rhythm deviation (no `test:`/`feat:` pair) — Phase 4 P3 walks engineering-standards; the rhythm skip needs an honest justification, not a weak precedent. | adopted | § 7 rewritten to argue the rhythm **cannot apply** (no behaviour to test-drive; synthetic tests would be redundant or unhelpful). Retro action item candidate to add one-line CLAUDE.md clarification for major-bump-zero-code-change stories. |
| P3 | Story 2.5 retro action C (Gherkin-to-test-mapping audit in Phase 4 P1) doesn't cleanly apply here — scenarios assert invariants about the bump, not new production paths. | adopted | Documented in § 5 with a scenario-to-verification-mechanism table. Phase 4 reviewer should substitute probe-diff audit + suite-green check for the standard walk. |
| P3 | Verify CI baseline matches v8 Node ≥ 20 requirement. | adopted | Checked: [.github/workflows/ci.yml:18](.github/workflows/ci.yml) pins `node-version: '20'`. Exact match. Documented in § 4 breaking-change table. |
| P3 | Plan should state that the probe already happened (reality over fiction) and mark Phase 3 as collapsed. | adopted | § 4 "Pre-planning probe findings" section added; § 8 "Implementation phase" rewritten to declare collapse into Phase 1. |
| P4-retro | Confirm diff matches plan: `git diff main...HEAD -- src/ tests/` produces 0 lines. | verified | Ran post-commit: 0 LOC in src/ or tests/. [package.json](package.json) diff is 1 line (version pin). [package-lock.json](package-lock.json) regen. |
| P4-retro | CI gate green: `npm run lint && npm run build && npm test`. | verified | [gh pr checks 48](https://github.com/xavierbriand/accounting/pull/48) → `build` pass (24s). CodeQL still pending at time of this commit (non-blocking security-scan side-channel). |
| P4-retro | Gherkin-to-test-mapping substitution from plan § 5 holds. | verified | Scenarios 1–4 verified by `git diff` + CI; scenario 5 (smoke-test) remains user-executed. |
| P4-retro | No mock-diversity-class regression in the diff (Story 2.4 retro action A). | N/A | No structured-output assertions in the diff. |
| P4-retro | No safeguard-removal concerns (Story-maint-01 retro action A rule). | N/A | No code change. |

## Sonnet's learnings

_Empty — awaits Phase 3 return report._

## Retrospective

Full retrospective: [docs/retrospectives/story-maint-05.md](docs/retrospectives/story-maint-05.md). Headline: second data point for the pre-planning probe pattern from story-maint-01; first data point for Phase 3 collapse into probe (and for commit-rhythm skip on a major-bump-zero-code-change story). Both flagged as passive observation targets for the next major dep bump ([#11](https://github.com/xavierbriand/accounting/issues/11) or [#12](https://github.com/xavierbriand/accounting/issues/12)); CLAUDE.md § 6.7 codification deferred until a second data point confirms the pattern.

## Merge checklist

- [ ] `lint` / `build` / `test` green on CI
- [ ] PR out of draft
- [ ] Retrospective file committed at `docs/retrospectives/story-maint-05.md`
- [ ] All suggestion-log items resolved (no blank `Resolution` cells)
- [ ] All Phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)
- [ ] Manual smoke-test executed locally (scenario in § 5)
- [ ] User approval
