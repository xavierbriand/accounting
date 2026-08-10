# Story maint-36 — better-sqlite3 12.11.1 → 13.0.3 (critical-path major bump)

## Context

[Dependabot PR #259](https://github.com/xavierbriand/accounting/pull/259) bumps `better-sqlite3` from `12.11.1` to `13.0.3` — a major version. Per [CLAUDE.md § 6.7](../../CLAUDE.md), critical-path major bumps (`better-sqlite3` is explicitly named on that list) route to a full story rather than a routine merge, matching how [story-maint-27](story-maint-27.md) handled the `commander` 14→15 critical-path major. This is the second of three sibling maintenance stories run in this session to clear the 4 open Dependabot PRs found at session start (#251 merged directly as routine; [story-maint-33](story-maint-33.md) handled the dev-dependencies group split; this story handles better-sqlite3; a third — chalk — follows under whatever id is free when it's drafted, per the note below).

**No model impact** — `better-sqlite3` is a `src/infra/` persistence driver, never imported by `src/core/` (enforced by the layer-boundary lint rule, story-maint-29). Pure infra dependency-version bump, no Core domain concept touched (R24 default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, continuing the combined "fix open Dependabot PRs" session.**
- **Sibling work:** #251 merged directly; story-maint-33 (PR #264) is open, CI green, ready for review, awaiting user merge. #257 (chalk) remains, planned as a further sibling story next — its id is deliberately not pre-assigned here (Phase 4 review correctly caught this same plan's earlier draft naming a specific future id — "story-maint-36" — for the chalk story before this one had even finished claiming that number itself; per this story's own § below, a pre-assigned future id has now gone stale twice in one session and won't be repeated a third time).
- **Story id, collided twice in this session alone.** First drafted as `story-maint-35` after `story-maint-34` was claimed and merged by an unrelated PR (#263) while story-maint-33's Phase 4 review was in flight (see story-maint-33's own retro). Re-verified `story-maint-35` as free immediately before drafting — but Phase 2 `sibling-overlap` review then found **open PR #267** ("Add the missing status.d fragment for story-maint-34," itself a follow-up to the #263 incident) had claimed `story-maint-35` — title, all 3 commit subjects, and a committed `docs/retrospectives/story-maint-35.md` — in the gap between that check and this plan's Phase 2 review completing. A concurrent session had already named this exact race independently: **[issue #266](https://github.com/xavierbriand/accounting/issues/266)**, "R23 story-id uniqueness check has a real race window under concurrent sessions." This story does not re-file that issue — it's a second live data point for #266, not a new gap. Renumbered to **`story-maint-36`**, re-verified free three ways (`gh pr list`, `git ls-tree origin/main`, `git ls-remote --heads origin`) immediately before Phase 2 completed, committed without further delay to close the window.
- **Open issues touching this surface:** none. No open issue references `better-sqlite3`.
- **No separate tracking issue filed** — planned and executed in the same sitting that discovered the routing block, matching story-maint-33's reasoning.
- **Coordination with PR #259 (Dependabot's own PR, superseded by this story).** Matching the story-maint-33/#260 precedent (added there after Phase 2 review flagged the same omission): PR #259 must be closed manually immediately after this story's PR merges. Until then it stays open and mergeable — nothing at the platform level prevents a direct merge that would bypass this story's changelog audit; this plan does not rely on Dependabot auto-detecting supersession.
- **`npm audit --audit-level=high`:** 4 pre-existing high findings (brace-expansion, js-yaml, nanoid, postcss), unchanged pre- and post-bump — already tracked by [#261](https://github.com/xavierbriand/accounting/issues/261)/[#262](https://github.com/xavierbriand/accounting/issues/262), out of scope.
- **Proceed-to-planning.**

## Motivation

1. **Clears the routing block on PR #259.** `better-sqlite3` is this repo's sole SQLite driver (§ 1 stack: "SQLite via `better-sqlite3` (WAL)") — a critical-path dependency per CLAUDE.md § 6.7's explicit list, so the major bump can't be merged as a routine Dependabot merge regardless of CI being green on that PR.
2. **The changelog and an empirical probe both indicate zero JS-facing breaking change** for this repo's usage — see § "Surface area" below — so this is a "do the bump now" story (story-maint-27 precedent), not a "file an issue and defer" outcome.
3. **v13 removes the deprecated `prebuild-install` dependency chain entirely** (first version on N-API), which is a net install-time simplification: `npm install` shrinks `package-lock.json` by ~300 lines and no longer runs a `node-gyp rebuild` compile step in this environment (a prebuilt N-API binary is used directly).
4. **Supply-chain positive, per [docs/security-checklist.md](../security-checklist.md) § "Supply chain"** — not just an install-speed win. `package-lock.json`'s `better-sqlite3@12.11.1` entry carries `"hasInstallScript": true` (v12 runs a postinstall hook: `prebuild-install`, falling back to `node-gyp rebuild`, both capable of fetching/compiling a binary outside npm's own tarball-integrity coverage). That flag disappears entirely from the `13.0.3` entry — v13 runs **no install script at all**. Fewer install-time code-execution surfaces is a genuine reduction in attack surface for a critical-path native dependency, worth stating explicitly rather than leaving implicit in the "removes 33 packages" line.

## Surface area (pre-planning probe)

**Package inventory (1 change):**

| Package | From | To | Kind | Disposition |
| --- | --- | --- | --- | --- |
| `better-sqlite3` | `12.11.1` | `13.0.3` | **major**, critical-path | taken — see below |

**Why this major is taken, not deferred — changelog read first, then confirmed empirically.** Read the real release notes for every version between `12.11.1` and `13.0.3` (`npm view better-sqlite3 versions`, GitHub releases), not just the top-line summary:

- **v13.0.0** — "the first version of `better-sqlite3` to run on N-API... prebuilt binaries should theoretically work across different versions of Node.js and Electron." Removes the deprecated `prebuild-install` dependency. Adds two new, purely additive methods (`db.explain()`, `preparedStatement.toString()`). Refactors the native addon to `node-addon-api` internally — an implementation-detail change, not a JS-facing API change. No removed or renamed JS API.
- **v13.0.1** — bugfix: parameter binding was overly strict rejecting plain objects from other realms (a *relaxation*, not a narrowing).
- **v13.0.2 / v13.0.3** — a `gypfile` packaging option, an SQLite version bump (3.53.3→3.53.4), a worker-thread-termination segfault fix, and a `package.json` table-parameter validation fix. All bugfixes/build-metadata, no API surface change.
- **v12.12.0** (already superseded by this bump's floor, included for completeness since it sits between the "From" and "To") carries one BREAKING warning — but scoped to Electron consumers only ("Starting with Electron v43, binary assets will require glibc 2.41+ on Linux hosts"). This repo is a Commander-based CLI (`"main": "index.js"`, no Electron dependency anywhere in `package.json`), not an Electron app — not applicable.

**No JS-facing breaking change identified for this repo's usage pattern** (`import Database from 'better-sqlite3'`, then `new Database(path)`, `.prepare()`, `.pragma()`, `.transaction()`, `.exec()` — grepped every call site in `src/infra/db/**` and `src/infra/export/fs-data-exporter.ts`, all use the same stable default-export-constructor API documented unchanged across v12→v13). `@types/better-sqlite3` (currently pinned `^7.6.13`, unrelated version-numbering track from the runtime package) needed no change — confirmed by `npm run build` type-checking clean.

**Confirmed empirically**, not just via changelog: full local probe (below) — including every `src/infra/db/**` repository, the migrator, the migration-check guard, the snapshot service, and the CSV/bundle exporters, all exercised by the integration and feature test tiers — passes unchanged.

## Pre-planning probe findings

Ran `npm install` with `better-sqlite3` bumped to `^13.0.3` + `npm run lint && npm run build && npm test && npm run test:harness` + `npm audit --audit-level=high` in this worktree on 2026-08-10, on a fresh branch cut from `origin/main` (post story-maint-34/#263 merge).

| Gate | Pre-bump (baseline) | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm install` | — | clean; removes 33 packages (the `prebuild-install` chain, no longer needed on N-API) | — |
| `npm run lint` | 124 warnings, 0 errors | 124 warnings, 0 errors (identical) | 0 |
| `npm run build` | green | green | 0 |
| `npm test` | 1263 passed / 1 skipped, 119 files | 1263 passed / 1 skipped, 119 files | 0 |
| `npm run test:harness` | 379 passed, 23 files | 379 passed, 23 files | 0 |
| `npm audit --audit-level=high` | 4 findings (pre-existing, tracked by #261/#262) | 4 findings (identical) | 0 |
| `git diff --stat -- src/ tests/ harness/` | — | empty | 0 LOC changed |
| `package.json` diff | — | 1 line-pair (`better-sqlite3` only) | as planned |
| `package-lock.json` diff | — | 329 changed lines (15 insertions / 314 deletions — net shrink from the dropped `prebuild-install` chain) | benign |

Notably: `npm install`'s own script-permission warning changed from listing 2 packages needing install-script approval (`better-sqlite3@12.11.1` — `node-gyp rebuild`, plus `esbuild`) to listing only 1 (`esbuild`) — `better-sqlite3@13.0.3` ships a prebuilt N-API binary for this platform and no longer needs to compile from source at all in this environment, a strictly lower-risk install path than before.

## Production-code surface (R2)

None. This diff touches only `docs/plans/story-maint-36.md`, `package.json`, and `package-lock.json` — no file under `src/` changes type, signature, or format. Full corrected import-site inventory (Phase 4 review found the first draft's list incomplete): `better-sqlite3` is imported in `src/infra/db/sqlite-client.ts` (the actual `new Database(...)` construction site), all 6 files under `src/infra/db/repositories/` (`sqlite-buffer-ledger-query.ts`, `sqlite-config-state-store.ts`, `sqlite-contribution-query.ts`, `sqlite-domain-event-recorder.ts`, `sqlite-hash-repository.ts`, `sqlite-transaction-repo.ts`), the migrator and migration-check guard, the snapshot service, `src/infra/export/fs-data-exporter.ts`, and — type-only, erased at compile time — `src/cli/program.ts` (`import type Database from 'better-sqlite3'`, a `Database.Database` parameter annotation). Never `src/core/`, enforced by the layer-boundary lint rule. None of these call sites needed a code change.

## Selected solution

**Option A — take the major bump now, as a full Reduced-lane maintenance story.** Chosen: the changelog audit found zero JS-facing breaking changes for this repo's usage (N-API/build-internals rewrite, purely additive new methods, an Electron-only breaking note that doesn't apply), and the full probe (including every DB-touching integration/feature test) confirms it empirically. Matches the story-maint-27 precedent for critical-path major bumps that probe clean — "file an issue and defer" is for bumps that show real risk, not a default for every major-version-number sighting.

**Option B — file an issue and defer to a future story, per the maintenance-sub-loop checklist's literal first-touch guidance.** **Rejected:** the checklist's "file an issue + plan as a full story" is the routing decision (send this to a story, don't merge the Dependabot PR directly) — this plan *is* that story, executed in the same sitting rather than handed off, matching how story-maint-27 executed issue #223 immediately rather than leaving it purely as a backlog item. Deferring further would leave a probed-clean, zero-code-change bump idle for no reason.

**Option C — stay on `better-sqlite3` 12.x indefinitely.** **Rejected:** no maintenance signal or security advisory requires staying, and the 13.x line drops the deprecated `prebuild-install` dependency, which is a real (if minor) install-robustness improvement worth taking now rather than accumulating as later toil.

## Gherkin / AC scenarios

No `.feature` files change — a driver-version bump has no CLI surface change of its own; the *existing* feature suite (`tests/features/*.feature`, all of which touch the DB via `better-sqlite3` through the repository layer) is the regression net. Pseudo-Gherkin, not automatable, per the story-maint-05/06/21/22/27/28/33 precedent: fenced as ` ```text ` rather than ` ```gherkin ` deliberately (`harness/dod-check`'s Gherkin↔step hard gate would otherwise demand these resolve against real `.feature` files — [issue #198](https://github.com/xavierbriand/accounting/issues/198)).

```text
Feature: better-sqlite3 12.11.1 → 13.0.3 major bump

  Scenario: the driver version bumps with no other package.json change
    Given package.json dependencies pin better-sqlite3 at ^12.6.2
    When the major bump is applied
    Then package.json dependencies pin better-sqlite3 at ^13.0.3
    And package-lock.json reflects the new resolution (net shrink — prebuild-install chain dropped)

  Scenario: no source code change required
    Given better-sqlite3 is imported only inside src/infra/db/** (including sqlite-client.ts),
      src/infra/export/fs-data-exporter.ts, and a type-only import in src/cli/program.ts
    When the major bump is applied
    Then every file under src/, tests/, and harness/ is byte-identical to its pre-bump state

  Scenario: every DB-touching test path stays green, unmodified
    Given the existing test suite passes pre-bump (1263 product tests / 119 files, including every
      src/infra/db/** repository, the migrator, migration-check, the snapshot service, and both
      exporters; 379 harness tests / 23 files)
    When the bump is applied
    Then `npm run lint && npm run build && npm test && npm run test:harness` completes green
    And no test file is modified

  Scenario: the install-time native-binary risk goes down, not up
    Given better-sqlite3 12.11.1 requires a node-gyp compile step in this environment
    When the major bump is applied
    Then better-sqlite3 13.0.3 installs from a prebuilt N-API binary with no compile step
```

**Gherkin-to-test-mapping audit.** Each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — version bumps, nothing else in package.json | `git diff` on [package.json](../../package.json) |
| 2 — no source code change | `git diff --stat -- src/ tests/ harness/` (expected: empty) |
| 3 — every DB-touching test path green, unmodified | the 1263-test product suite (which includes every `src/infra/db/**` integration test) + 379-test harness suite (both unchanged) + CI |
| 4 — install-time risk goes down | `npm install` output, pre- vs. post-bump (script-approval warning count 2→1) |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R16 zero-behaviour-change collapse

Per [CLAUDE.md § 6.7](../../CLAUDE.md) / [§ 8 R16](../../CLAUDE.md), a critical-path major bump whose breaking-change audit produces a zero-code-change verdict collapses the standard `test:`/`feat:` rhythm to 4 commits (prep commit exempted from the count), matching the story-maint-27 precedent for this exact story shape.

1. `chore(docs): story-maint-36 plan + P1/P2/P3 review (story-maint-36)` — this plan doc (prep, R30-exempt).
2. `chore(deps): bump better-sqlite3 from 12.11.1 to 13.0.3 (story-maint-36)` — `package.json` + `package-lock.json` only.
3. `refactor: empty slot — no source change required (story-maint-36)` — no-op, following the story-maint-05/21/22/27/28/33 "empty refactor slot with justification" pattern.
4. `chore(retro): story-maint-36 retrospective (story-maint-36)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06/21/22/27/28/33: the fix is fully pre-specified and probed end-to-end already. No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (dependency-version-only bump, no Core/domain concept touched — [CLAUDE.md § 6](../../CLAUDE.md) lane table; same Reduced+R16 pairing gap already tracked by [#268](https://github.com/xavierbriand/accounting/issues/268)): `sibling-overlap` only, `plan-reviewer` dropped. Findings filled in below after the agent runs.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | **Blocking:** the id `story-maint-35` (this story's original number) was live-claimed by open PR #267, an unrelated follow-up to the #263/story-maint-34 incident. | adopted (blocking, fixed) | Renumbered this entire story to `story-maint-36`, re-verified free three ways immediately before committing. See § "Maintenance sub-loop" above. |
| P2 (sibling-overlap) | **Missing:** plan had no "close #259 manually post-merge" coordination step, matching the gap story-maint-33's own Phase 2 review found and fixed for PR #260. | adopted | Added the coordination bullet to § "Maintenance sub-loop" above. |
| P2 (sibling-overlap) | Factual note: PR #258 (closed) is not a better-sqlite3 predecessor — it's an unrelated closed dev-dependencies-group PR in the #260/#264 lineage. This plan never cited it. | acknowledge | No plan change needed (the finding was precautionary, not a correction of actual plan text). |
| P2 (sibling-overlap) | #257 (chalk) and #264 (story-maint-33) touch `package.json`/`package-lock.json` for fully disjoint packages; #255 (story-maint-31) touches DB *test* files but zero `src/infra/db/**` production files. | acknowledge | No plan change needed. |

**Phase 4 (code-reviewer + sibling-overlap, Reduced lane) — run 2026-08-10 against PR #269.**

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 (code-reviewer) | Plan's import-site inventory ("only inside `src/infra/db/**` and `src/infra/export/fs-data-exporter.ts`") missed a 12th site: `src/cli/program.ts:2` (`import type Database from 'better-sqlite3'`, type-only, erased at compile time). Doesn't contradict the "no code change needed" verdict but the enumeration was incomplete. | fix-now | Corrected § "Production-code surface (R2)" and the Gherkin scenario's `Given` line with the full site list. |
| P1 (code-reviewer) | Plan's Context section (lines 5, 10) pre-assigned the *next* sibling story (chalk) a specific future id, "story-maint-36" — this story's own, now-claimed id, left over from before this story's own maint-35→36 renumber. | fix-now | Reworded both mentions to not pre-commit to a specific future id — this story's own history (two prior collisions on pre-assigned ids in one session) is exactly why. |
| P2 (code-reviewer) | The `better-sqlite3` 13 install-script removal is a genuine supply-chain positive (per `docs/security-checklist.md` § "Supply chain") worth stating explicitly, not just implied by the "removes 33 packages" line. | fix-now | Added Motivation point 4, verified against the lockfile directly (`hasInstallScript: true` on 12.11.1, absent on 13.0.3). |
| P2 (code-reviewer) | The `npm audit` pre-existing-findings reference (#261/#262) lives in the Context bullet, not inside the "## Suggestion log" table where `docs/security-checklist.md`'s "documented exception" convention expects it. | acknowledge | Matches story-maint-33's own placement (Context, not suggestion log) — consistent repo-wide convention, not a per-story gap; no change made. |
| P3 (code-reviewer, R11) | Empty-refactor commit says "7 repository files" but `src/infra/db/repositories/*.ts` contains 6; also omits `sqlite-client.ts` and `program.ts` from the named list. | fix-now | Corrected in the history rewrite below (retro/commit-body pass), matching the corrected inventory above. |
| P3 (code-reviewer, soft) | Plan's "## Commit sequence — R16..." heading doesn't match `dod-check`'s `SLICE_PLAN_HEADING` regex, so the envelope check stays advisory rather than actually validating the commit count — same class of gap as story-maint-27's identical heading, not new to this PR. | acknowledge | Pre-existing, repo-wide pattern already covered by open issue [#239](https://github.com/xavierbriand/accounting/issues/239); not re-filed. Renaming the heading to match would break the established "Commit sequence — R16..." convention used identically across 3+ prior stories. |
| P4 (sibling-overlap) | No blocking findings; PR #259 unchanged; #269's diff matches plan scope exactly; story-id uniqueness independently re-confirmed clean. | acknowledge | No action needed. |

## Merge checklist

- [x] `lint` / `build` / `test` / `test:harness` green on CI
- [ ] PR out of draft
- [x] Retrospective file committed at `docs/retrospectives/story-maint-36.md`
- [x] All suggestion-log items resolved (no blank `Resolution` cells)
- [x] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
