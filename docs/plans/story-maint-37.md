# Story maint-37 — chalk 5.6.2 → 6.0.0 (runtime dep major bump)

## Context

[Dependabot PR #257](https://github.com/xavierbriand/accounting/pull/257) bumps `chalk` from `5.6.2` to `6.0.0` — a major version of a runtime dependency (`dependencies`, not `devDependencies`, in `package.json`). Per [CLAUDE.md § 6.7](../../CLAUDE.md), major bumps of runtime deps route to a full story rather than a routine merge. This is the third and last of three sibling maintenance stories run in this session to clear the 4 open Dependabot PRs found at session start (#251 merged directly as routine; [story-maint-33](story-maint-33.md) handled the dev-dependencies group split; [story-maint-36](story-maint-36.md) handled the better-sqlite3 critical-path major; this story handles chalk).

**No model impact** — `chalk` is a `src/cli/` output-formatting dependency, never imported by `src/core/`. Pure dependency-version bump, no Core domain concept touched (R24 default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, closing out the combined "fix open Dependabot PRs" session.**
- **Sibling work:** #251 merged directly; story-maint-33 (PR #264) and story-maint-36 (PR #269) are both open, CI green, ready for review, awaiting user merge. This is the last of the 4 originally-open Dependabot PRs.
- **Story id, freshly verified immediately before drafting** — this session hit two live id collisions already (story-maint-34 claimed by PR #263 mid-flight; story-maint-35 claimed by PR #267 mid-flight; full account in story-maint-36's plan and [issue #266](https://github.com/xavierbriand/accounting/issues/266)). Learning applied here: no future id is pre-assigned anywhere in this plan for any not-yet-started work. Checked live right before this file was created: `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -iE "maint-3[7-9]|maint-4[0-9]"` → empty. `gh pr list --state open --json headRefName` → no branch references `maint-37`. `story-maint-37` is free and claimed by this story; will be re-verified again immediately before the first commit, per the established habit.
- **Open issues touching this surface:** none. No open issue references `chalk`.
- **No separate tracking issue filed** — planned and executed in the same sitting that discovered the routing block, matching story-maint-33/36's reasoning.
- **Coordination with PR #257 (Dependabot's own PR, superseded by this story).** Matching the story-maint-33/#260 and story-maint-36/#259 precedent: PR #257 must be closed manually immediately after this story's PR merges. Until then it stays open and mergeable; this plan does not rely on Dependabot auto-detecting supersession.
- **`npm audit --audit-level=high`:** 4 pre-existing high findings (brace-expansion, js-yaml, nanoid, postcss), unchanged pre- and post-bump — already tracked by [#261](https://github.com/xavierbriand/accounting/issues/261)/[#262](https://github.com/xavierbriand/accounting/issues/262), out of scope.
- **Proceed-to-planning.**

## Motivation

1. **Clears the routing block on PR #257.** `chalk` is a runtime dependency undergoing a major bump — CLAUDE.md § 6.7 routes any runtime-dep major to a full story regardless of CI being green on the Dependabot PR itself.
2. **The changelog shows exactly one breaking change, already satisfied.** Chalk 6.0.0's release notes list a single Breaking entry: "Require Node.js 22." This repo's `package.json` `engines.node` is already `>=22.12.0` (set well before this bump, unrelated to it) — the new floor is already met, confirmed by the lockfile diff itself (`chalk`'s `engines.node` changes from `^12.17.0 || ^14.13 || >=16.0.0` to `>=22`).
3. **This repo's chalk usage is the narrowest, most stable slice of its API** — see § "Surface area" below — so this is a "do the bump now" story (story-maint-27/36 precedent), not a "file an issue and defer" outcome.

## Surface area (pre-planning probe)

**Package inventory (1 change):**

| Package | From | To | Kind | Disposition |
| --- | --- | --- | --- | --- |
| `chalk` | `5.6.2` | `6.0.0` | **major**, runtime dep | taken — see below |

**Why this major is taken, not deferred — changelog read first, then confirmed empirically and against actual usage.** Chalk 6.0.0's full release notes:

- **Breaking:** "Require Node.js 22." — already satisfied (`package.json` `engines.node: ">=22.12.0"`, unrelated to this bump).
- **Improvements:** adds underline styles/colors (additive), performance improvements (internal).
- **Fixes:** `FORCE_COLOR` numeric-value handling, `ansi256()`/`bgAnsi256()` downsampling at color level 1 — both edge cases this repo never exercises (see below).

**This repo's actual chalk usage is a narrow, stable slice of the API** — grepped every call site in `src/`: 3 files, 10 raw `chalk.<method>()` invocations, all using one of exactly 4 distinct methods (`.green`, `.yellow`, `.red`, `.bold`) — the oldest, most stable part of chalk's API:

| File | Calls |
| --- | --- |
| `src/cli/utils/printer.ts` | `chalk.green()`, `chalk.yellow()` |
| `src/cli/commands/status-formatter-human.ts` | `chalk.yellow()`, `chalk.red()`, `chalk.green()`, `chalk.bold()` |
| `src/cli/commands/explain-formatter-human.ts` | `chalk.bold()` |

All three files import the same way: `import chalk from 'chalk'` (default export). No `FORCE_COLOR` env var read anywhere in `src/`, no `ansi256()`/`bgAnsi256()` call anywhere, no chalk constructor/`.Instance` usage, no underline-style calls. This is exactly the subset of the API v6.0.0's changelog confirms is unaffected — the one behavioural fix (`ansi256` downsampling) and the one addition (underline styles) are both call sites this repo simply doesn't have.

**Confirmed empirically**, not just via changelog: full local probe (below) — including every `src/cli/commands/*-formatter-human.ts` test and the printer's own tests — passes unchanged. Direct sanity check: `chalk.green('test')` / `chalk.bold('test')` still produce the same interface shape (a callable, chainable colorizer) post-bump.

**One nested-dependency note, not a conflict.** `ora` (this repo's spinner dependency) pins its own private `chalk@5.6.2` as a transitive dependency, independent of this repo's own top-level `chalk`. `npm install` resolves both side-by-side (`node_modules/chalk` at 6.0.0 for this repo's own imports, `node_modules/ora/node_modules/chalk` at 5.6.2 for `ora`'s internal use) — no forced dedup, no conflict, no action needed.

## Pre-planning probe findings

Ran `npm install` with `chalk` bumped to `^6.0.0` + `npm run lint && npm run build && npm test && npm run test:harness` + `npm audit --audit-level=high` in this worktree on 2026-08-10, on a fresh branch cut from `origin/main` (post story-maint-34/35 merges).

| Gate | Pre-bump (baseline) | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm install` | — | clean, no `ERESOLVE` | — |
| `npm run lint` | 124 warnings, 0 errors | 124 warnings, 0 errors (identical) | 0 |
| `npm run build` | green | green | 0 |
| `npm test` | 1263 passed / 1 skipped, 119 files | 1263 passed / 1 skipped, 119 files | 0 |
| `npm run test:harness` | 379 passed, 23 files | 379 passed, 23 files | 0 |
| `npm audit --audit-level=high` | 4 findings (pre-existing, tracked by #261/#262) | 4 findings (identical) | 0 |
| `git diff --stat -- src/ tests/ harness/` | — | empty | 0 LOC changed |
| `package.json` diff | — | 1 line-pair (`chalk` only) | as planned |
| `package-lock.json` diff | — | 20 changed lines (17 insertions / 3 deletions) | benign — new `resolved`/`integrity` fields plus `ora`'s private `chalk@5.6.2` nested entry |

## Production-code surface (R2)

None. This diff touches only `docs/plans/story-maint-37.md`, `package.json`, and `package-lock.json` — no file under `src/` changes type, signature, or format. `chalk` is imported in exactly 3 files: `src/cli/utils/printer.ts`, `src/cli/commands/status-formatter-human.ts`, `src/cli/commands/explain-formatter-human.ts` (all `src/cli/`, never `src/core/`). None of these call sites needed a code change.

## Selected solution

**Option A — take the major bump now, as a full Reduced-lane maintenance story.** Chosen: the changelog's single breaking change (Node 22 floor) is already satisfied, and this repo's actual chalk usage doesn't touch any of v6's other behavioural changes. Matches the story-maint-27/36 precedent for critical/runtime major bumps that probe clean.

**Option B — file an issue and defer to a future story.** **Rejected:** same reasoning as story-maint-36 — the maintenance-sub-loop checklist's "file an issue + plan as a full story" is the routing decision (send this to a story, don't merge the Dependabot PR directly), and this plan *is* that story, executed in the same sitting. Deferring a probed-clean, zero-code-change bump would leave it idle for no reason.

**Option C — stay on `chalk` 5.x indefinitely.** **Rejected:** no maintenance signal or security advisory requires staying, and the changelog shows only additive/internal changes beyond the already-satisfied Node floor bump.

## Gherkin / AC scenarios

No `.feature` files change — a formatting-library-version bump has no CLI surface change of its own; the *existing* CLI-output tests (`status-formatter-human`, `explain-formatter-human`, `printer`) are the regression net. Pseudo-Gherkin, not automatable, per the story-maint-05/06/21/22/27/28/33/36 precedent: fenced as ` ```text ` rather than ` ```gherkin ` deliberately (`harness/dod-check`'s Gherkin↔step hard gate would otherwise demand these resolve against real `.feature` files — [issue #198](https://github.com/xavierbriand/accounting/issues/198)).

```text
Feature: chalk 5.6.2 → 6.0.0 major bump

  Scenario: the runtime dep version bumps with no other package.json change
    Given package.json dependencies pin chalk at ^5.6.2
    When the major bump is applied
    Then package.json dependencies pin chalk at ^6.0.0
    And package-lock.json reflects the new resolution

  Scenario: the one breaking change in the changelog is already satisfied
    Given chalk 6.0.0 requires Node.js >=22
    And this repo's package.json engines.node is already >=22.12.0
    When the major bump is applied
    Then no engines-floor change is needed

  Scenario: no source code change required
    Given chalk is imported only inside src/cli/utils/printer.ts,
      src/cli/commands/status-formatter-human.ts, and
      src/cli/commands/explain-formatter-human.ts
    And every call site uses only .green(), .yellow(), .red(), and .bold()
    When the major bump is applied
    Then every file under src/, tests/, and harness/ is byte-identical to its pre-bump state

  Scenario: every CLI-output-formatting test path stays green, unmodified
    Given the existing test suite passes pre-bump (1263 product tests / 119 files, including the
      status/explain human-formatter tests and the printer's own tests; 379 harness tests / 23 files)
    When the bump is applied
    Then `npm run lint && npm run build && npm test && npm run test:harness` completes green
    And no test file is modified
```

**Gherkin-to-test-mapping audit.** Each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — version bumps, nothing else in package.json | `git diff` on [package.json](../../package.json) |
| 2 — Node floor already satisfied | `package.json` `engines.node` (unchanged by this diff) vs. `package-lock.json`'s `chalk` `engines.node` entry |
| 3 — no source code change | `git diff --stat -- src/ tests/ harness/` (expected: empty) |
| 4 — every CLI-output-formatting test path green, unmodified | the 1263-test product suite (which includes every human-formatter test) + 379-test harness suite (both unchanged) + CI |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R16 zero-behaviour-change collapse

Per [CLAUDE.md § 6.7](../../CLAUDE.md) / [§ 8 R16](../../CLAUDE.md), a runtime-dep major bump whose breaking-change audit produces a zero-code-change verdict collapses the standard `test:`/`feat:` rhythm to 4 commits (prep commit exempted from the count), matching the story-maint-27/36 precedent.

1. `chore(docs): story-maint-37 plan + P1/P2/P3 review (story-maint-37)` — this plan doc (prep, R30-exempt).
2. `chore(deps): bump chalk from 5.6.2 to 6.0.0 (story-maint-37)` — `package.json` + `package-lock.json` only.
3. `refactor: empty slot — no source change required (story-maint-37)` — no-op, following the story-maint-05/21/22/27/28/33/36 "empty refactor slot with justification" pattern.
4. `chore(retro): story-maint-37 retrospective (story-maint-37)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06/21/22/27/28/33/36: the fix is fully pre-specified and probed end-to-end already. No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (dependency-version-only bump, no Core/domain concept touched — [CLAUDE.md § 6](../../CLAUDE.md) lane table; same Reduced+R16 pairing gap already tracked by [#268](https://github.com/xavierbriand/accounting/issues/268)): `sibling-overlap` only, `plan-reviewer` dropped. Findings filled in below after the agent runs.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | #257 coordination step already present and correctly placed; #269 (better-sqlite3) and #264 (dev-deps) touch the same 2 files but disjoint dependency lines; #255 has zero file overlap. Story-id `story-maint-37` verified free 4 independent ways. No drift-scan glob-pattern risk in § "Production-code surface (R2)" — all 3 backtick-quoted `src/` paths are literal, existing files. | acknowledge | No plan change needed — clean review. |
| P2 (sibling-overlap) | Informational: the plan doesn't explicitly discuss the case where a user merges #257 directly before this story's own PR merges (as happened with #251 earlier this session) — would rebase to an empty package.json/package-lock.json diff, a harmless self-resolving outcome. | acknowledge | Noted for awareness; not a real conflict, no plan change needed. |

**Phase 4 (code-reviewer + sibling-overlap, Reduced lane) — run 2026-08-10 against PR #270.**

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 (code-reviewer) | § "Surface area" claimed a "6-call-site" count; actual is 10 raw `chalk.<method>()` invocations across the 3 files (the method-*set* claim — only `.green`/`.yellow`/`.red`/`.bold` — was independently confirmed exhaustive and accurate). | fix-now | Corrected the count in the probe prose; the formal § "Production-code surface (R2)" verdict never stated a count and was already accurate. |
| P3 (code-reviewer, soft) | Plan's markdown links to sibling plans `story-maint-33.md`/`story-maint-36.md` 404 today since those files only exist on their own not-yet-merged branches (PRs #264/#269). | acknowledge | Self-resolving once the sibling PRs merge; same cross-referencing pattern used throughout this session's sibling stories, not unique to this plan. No markdown-link-check exists in CI (issue #86). |
| P3 (code-reviewer, soft) | § "Surface area" contains a backtick-quoted glob (`src/cli/commands/*-formatter-human.ts`) — same pattern class that broke story-maint-36's CI. | acknowledge | Confirmed zero risk: the glob sits outside § "Production-code surface (R2)", the only region `drift-scan`'s Check B parses. CI already green on this exact content. |
| P4 (sibling-overlap) | No blocking findings; PR #257 unchanged; #270's diff matches plan scope exactly; story-id uniqueness independently re-confirmed clean 4 ways. | acknowledge | No action needed. |

## Merge checklist

- [x] `lint` / `build` / `test` / `test:harness` green on CI
- [ ] PR out of draft
- [x] Retrospective file committed at `docs/retrospectives/story-maint-37.md`
- [x] All suggestion-log items resolved (no blank `Resolution` cells)
- [x] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
