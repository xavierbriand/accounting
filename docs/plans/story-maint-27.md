# Story maint-27 — CI Node runtime upgrade (20 → 24 LTS) + commander 15 major bump

## Context

[Dependabot PR #221](https://github.com/xavierbriand/accounting/pull/221) bumps `commander` 14.0.3 → 15.0.0 — a **critical-path major bump**, which per the maintenance sub-loop policy (CLAUDE.md § 6.7 / docs/templates/maintenance-sub-loop.md) must be planned as a story, not merged routinely. [Issue #223](https://github.com/xavierbriand/accounting/issues/223) was filed for this from a concurrent session's story-4.5 pre-planning maintenance sub-loop on 2026-07-16, before this session started; this story executes the shape it proposed rather than re-deriving it.

**No model impact** — pure infra/CI + runtime-dependency-version change, no Core domain concept touched (R24 default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run.**
- **Sibling work:** at session start, 4 open Dependabot PRs existed (#218, #220, #221, #222). #220 and #222 (routine minor bumps) were merged directly by the user mid-session. #218 (dev-deps group) is handled separately by [story-maint-28](story-maint-28.md) (originally drafted as `story-maint-26`; renumbered after Phase 2 review found PR #224 had already claimed that id for an unrelated story) — no overlap with this story's surface (`package.json`'s `commander`/`engines` lines vs. the `devDependencies` block; both stories' authors confirmed via Phase 2 review that concurrent merges won't conflict beyond an ordinary rebase). #221 is this story's own subject.
- **Open issues touching this surface:** [#223](https://github.com/xavierbriand/accounting/issues/223) (this story's own tracking issue, pre-existing). Nothing else stale.
- **Open Dependabot PRs:** #221 (handled by this story) and #218 (handled by story-maint-28).
- **Story-id uniqueness (R23):** `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i maint-27` → empty. `gh pr list --state open --json headRefName` → no `maint-27` branch in flight. Clean.
- **`npm audit --audit-level=high`:** 0 findings, pre- and post-bump (checked in § "Pre-planning probe findings" below).
- **Proceed-to-planning.**

## Motivation

1. **Clears the routing block on PR #221.** `commander` 15 requires Node ≥22.12.0 (confirmed via `npm view commander@15.0.0 engines`), while CI is pinned to Node 20 (`.github/workflows/ci.yml:24`) — the bump cannot land without the runtime upgrade landing first, or in the same story.
2. **Node 20 is past end-of-life.** Confirmed via the official Node release schedule (`nodejs/Release` repo): Node 20 ("Iron") reached `end: 2026-04-30` — already past EOL as of this story. Node 22 ("Jod") entered Maintenance LTS 2025-10-21 (still supported but not receiving new features). Node 24 ("Krypton") is the current **Active LTS** (since 2025-10-28, through 2026-10-20, full support until 2028-04-30) — the correct target for new work with the longest support runway among viable options.
3. **`better-sqlite3` 12.10.0+ dropped Node 20 prebuilds** (per issue #223, `WiseLibs/better-sqlite3#1468`) — after the 12.11.1 bump (PR #219, already merged to `main`), CI on Node 20 would fall back to source compilation. Upgrading past Node 20 removes this latent fragility too.
4. **`commander`'s only in-repo usage is the plain `import { Command } from 'commander'` composition root** ([src/cli/program.ts](../../src/cli/program.ts)) — no `--no-*` options anywhere in `src/cli` (`grep -rn -- "--no-" src/cli/` → empty), so the one behavior-changing entry in commander 15's changelog (`--no-*` default-value handling) doesn't apply. The ESM-only requirement is moot (`"type": "module"` already). The removed `commander/esm.mjs` export is moot (we import from `commander` directly, not the subpath).

## Surface area (pre-planning probe)

**Changes (3, all infra/config):**

| Change | From | To |
| --- | --- | --- |
| `.github/workflows/ci.yml` `node-version` | `'20'` | `'24'` |
| `package.json` `engines.node` | *(absent)* | `">=22.12.0"` — declares the actual technical floor (commander's requirement), not an artificially-strict pin to CI's specific version |
| `package.json` `dependencies.commander` | `^14.0.3` | `^15.0.0` |

**commander 15.0.0 changelog breaking changes, audited against actual usage:**

| Change | Our usage | Impact |
| --- | --- | --- |
| ESM-only | Repo already `"type": "module"` throughout | None |
| Requires Node ≥22.12.0 | Addressed by this same story's CI Node bump | None (once bundled together) |
| `--no-*` default-value behavior change | `grep -rn -- "--no-" src/cli/` → no matches; no `--no-*` options defined anywhere in this CLI | None |
| Removed `commander/esm.mjs` export | `src/cli/program.ts:2` imports `{ Command } from 'commander'` directly, not the `esm.mjs` subpath | None |

**Only one file in this repo imports `commander`:** [src/cli/program.ts](../../src/cli/program.ts) (`import { Command } from 'commander'`, `new Command()`, then the standard fluent `.command()/.option()/.action()` chain — no exotic API surface).

**Conclusion:** zero code change expected in `src/` or `tests/`. The migration is `.github/workflows/ci.yml` + `package.json` + `package-lock.json` only.

## Pre-planning probe findings

Ran, in this worktree on 2026-07-17: bumped `commander` to `15.0.0` via `npm install commander@15.0.0`, added the `engines` field, bumped CI's `node-version` to `24`, then `npm run lint && npm run build && npm test && npm run test:harness` + `npm audit --audit-level=high`. (CI's actual Node 24 execution will be confirmed by this PR's own CI run; the local probe runs on this machine's Node 26.5.0, which also satisfies the `>=22.12.0` floor.)

| Gate | Pre-bump | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm install commander@15.0.0` | — | clean, no `ERESOLVE` | — |
| `npm run lint` | 97 warnings, 0 errors | 97 warnings, 0 errors (identical) | 0 |
| `npm run build` | green | green | 0 |
| `npm test` | 1010 passed / 1 skipped, 93 files | 1010 passed / 1 skipped, 93 files | 0 |
| `npm run test:harness` | 252 passed, 18 files | 252 passed, 18 files | 0 |
| `npm audit --audit-level=high` | 0 findings | 0 findings | 0 |
| `git diff --stat -- src/ tests/ harness/` | — | empty | 0 LOC changed |
| Composition-root subprocess coverage | [tests/integration/cli/status-program.test.ts](../../tests/integration/cli/status-program.test.ts) already exercises the compiled `program.ts` binary end-to-end via subprocess; ran green as part of the 1010-test suite above. `program.ts` itself is untouched by this story (R4 — no new subprocess test needed; existing coverage already re-runs against commander 15 as-is). | | |

## Selected solution

**Option A — bundle the Node runtime upgrade and the commander bump into one story, land both together.** Chosen, per issue #223's proposed shape: commander 15 cannot install-and-run in CI without the Node floor moving first, and there's no independent value in landing the Node bump alone without commander (nothing else currently forces it). Bundling avoids an intermediate CI-broken state.

**Option B — bump only `engines`/Node in CI now, leave `commander` at 14 and PR #221 open for a later story.** **Rejected:** defers a bump that's already fully audited as zero-code-change, for no safety benefit — same reasoning as story-maint-22's Option B/C rejections for similar splits.

**Option C — pin Node to 22 (Maintenance LTS) instead of 24 (Active LTS).** **Rejected:** Node 22 is a viable floor (`>=22.12.0` is satisfied either way) but is already in Maintenance LTS (since 2025-10-21) with a shorter total support window (EOL 2027-04-30) than Node 24 (Active LTS through 2026-10-20, EOL 2028-04-30). Picking the Active LTS gives the longest runway before the next forced runtime migration.

## Gherkin / AC scenarios

No `.feature` files — this is a CI-config + runtime-dependency change with no CLI-observable behavior change. Scenarios map 1:1 to post-bump verification, per the story-maint-05/06/21/22 Gherkin-to-test-mapping precedent. **Pseudo-Gherkin, not automatable:** fenced as ` ```text ` rather than ` ```gherkin ` deliberately — `harness/dod-check`'s Gherkin↔step hard gate treats any ` ```gherkin ` fenced block as scenarios that must resolve against real `.feature` files ([issue #198](https://github.com/xavierbriand/accounting/issues/198)).

```text
Feature: CI Node runtime upgrade (20 → 24 LTS) + commander 15 major bump

  Scenario: CI runs on Node 24 instead of Node 20
    Given .github/workflows/ci.yml pins node-version: '20'
    When the runtime is upgraded
    Then .github/workflows/ci.yml pins node-version: '24'
    And package.json declares engines.node >= 22.12.0

  Scenario: commander lands at its major version with zero code change
    Given package.json dependencies.commander == "^14.0.3"
    And src/cli/program.ts is the only file importing commander, using only
      the plain Command / .command() / .option() / .action() API with no
      --no-* options
    When commander is bumped to "^15.0.0"
    Then src/cli/program.ts is byte-identical to its pre-bump state
    And every file under src/ and tests/ is byte-identical to its pre-bump state

  Scenario: full test suite green, unmodified, including the composition-root subprocess test
    Given the existing test suite passes pre-bump (1010 product tests / 93 files,
      including tests/integration/cli/status-program.test.ts's subprocess
      invocation of the compiled program.ts binary)
    When both changes are applied together
    Then `npm run lint && npm run build && npm test && npm run test:harness` completes green
    And no test file is modified
```

**Gherkin-to-test-mapping audit.** Each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — CI Node version + engines field | `git diff` on [.github/workflows/ci.yml](../../.github/workflows/ci.yml) and [package.json](../../package.json); confirmed live by this PR's own CI run |
| 2 — commander lands, zero code change | `git diff --stat -- src/ tests/` (expected: empty); § "Surface area" breaking-change audit table |
| 3 — test suites green unmodified, subprocess coverage included | the 1010-test product suite (incl. `status-program.test.ts`) + 252-test harness suite (both unchanged) + CI |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R15 major-bump-zero-code collapse

Per [CLAUDE.md § 6.7](../../CLAUDE.md) / [§ 8 R15](../../CLAUDE.md), a major bump whose breaking-change audit produces a zero-code-change verdict collapses the standard `test:`/`feat:` rhythm to 4 commits. The CI Node-version bump and the `engines` field are bundled into the same `chore(deps)` commit as the `commander` bump rather than split, since `commander` 15 cannot run in CI without the Node floor moving first — an intermediate commit bumping only one half would leave CI broken.

1. `chore(docs): story-maint-27 plan + Phase 2 review (story-maint-27)` — this plan doc.
2. `chore(ci): bump CI Node runtime 20 → 24 LTS + declare engines floor + land commander 15 (story-maint-27)` — `.github/workflows/ci.yml` + `package.json` + `package-lock.json` only. Body notes the breaking-change audit conclusion and closes #223.
3. `refactor: empty slot — src/cli/program.ts unchanged (story-maint-27)` — no-op, following the story-maint-05/21/22 "empty refactor slot with justification" pattern. Body: commander 15's breaking changes are all N/A to our usage per § "Surface area"; nothing to refactor.
4. `chore(retro): story-maint-27 retrospective (story-maint-27)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06/21/22: the fix is fully pre-specified and probed end-to-end already, including the composition-root subprocess test (R4). No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (infra/CI + runtime-dependency-only change, no Core/domain concept touched — [CLAUDE.md § 6](../../CLAUDE.md) lane table): `sibling-overlap` only, `plan-reviewer` dropped. Findings below.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | No other open PR or issue independently executes issue #223's proposed shape; #221/#223 are correctly this story's own supersession/closure targets. | acknowledge | Confirmed via grep across all 47 open issues and all open PR bodies/titles for `node-version`/`engines.node`/`commander`/`ci.yml`. |
| P2 (sibling-overlap) | `package.json` hunks vs. sibling story-maint-28 (PR #226) confirmed disjoint (`engines` field + `dependencies.commander` here vs. `devDependencies` block there); `package-lock.json` will need regeneration on whichever PR rebases second — an ordinary rebase, not a real conflict. | adopted | Already anticipated in § "Maintenance sub-loop"; will rebase onto `origin/main` before this story's own merge, whichever of #226/#227 lands first. |
| P2 (sibling-overlap) | Re-verified issue #223's technical claims live: `commander@15.0.0` engines still `>=22.12.0`; `better-sqlite3` 12.10.0+ dropped Node-20 prebuilds (confirmed via `WiseLibs/better-sqlite3#1468`, closed, titled "Add support for Node.js v26 prebuilds and remove EOL builds"); Node LTS schedule dates match exactly. | acknowledge | No plan change needed — confirms § "Motivation" is still accurate. |
| P2 (sibling-overlap) | Flagged (informational, not this story's overlap): PR #224 and the sibling dev-deps story both originally claimed the id `story-maint-26` — a live collision between two *other* stories, not touching story-maint-27's files. | acknowledge | Already resolved independently — the dev-deps story was renumbered to `story-maint-28` (see its plan's own R23 account) before this finding was reported. |

## Merge checklist

- [ ] `lint` / `build` / `test` / `test:harness` green on CI (on the new Node 24 runner)
- [ ] PR out of draft
- [ ] Retrospective file committed at `docs/retrospectives/story-maint-27.md`
- [ ] All suggestion-log items resolved (no blank `Resolution` cells)
- [ ] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
