# Story maint-28 — dev-dependencies group bump (7 of 9), typescript 7 + pixelmatch 7 excluded

## Context

[Dependabot PR #218](https://github.com/xavierbriand/accounting/pull/218) ("chore(deps-dev): bump the dev-dependencies group across 1 directory with 9 updates") bundles two majors that fail an empirical probe (see § "Surface area" below). Per [CLAUDE.md § 6.7](../../CLAUDE.md), this routes the group to a full story rather than a routine merge. Filed as [#225](https://github.com/xavierbriand/accounting/issues/225) during the 2026-07-17 dependabot maintenance sub-loop run (same sub-loop that produced [story-maint-27](story-maint-27.md), the commander/Node-runtime story).

**No model impact** — pure devDependency-version bump, no Core domain concept touched (R24 default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run.**
- **Sibling work:** `gh pr list --state open --json number,title,headRefName` at session start showed 4 open Dependabot PRs (#218, #220, #221, #222); #220 and #222 were merged directly by the user mid-session (routine minor bumps, no story needed). #221 (commander) already had a filed tracking issue ([#223](https://github.com/xavierbriand/accounting/issues/223)) from a concurrent session's story-4.5 pre-planning maintenance sub-loop — handled separately as [story-maint-27](story-maint-27.md), not duplicated here.
- **Open issues touching this surface:** [#225](https://github.com/xavierbriand/accounting/issues/225) (this story's own tracking issue) and [#57](https://github.com/xavierbriand/accounting/issues/57) ("Track quickpickle's undeclared pixelmatch dependency upstream" — stays open; this story doesn't touch pixelmatch at all, leaving it pinned at its current `^6.0.0`). Nothing else stale.
- **Open Dependabot PRs:** #218 (handled by this story) and #221 (handled by story-maint-27).
- **Story-id uniqueness (R23) — collision found and corrected.** This story was originally drafted as `story-maint-26`. The `git ls-tree`/`gh pr list --json headRefName` check at draft time came back clean, but that check only greps *branch names*, not in-flight plan-file *content* — it missed [PR #224](https://github.com/xavierbriand/accounting/pull/224) (`claude/cli-error-output-format-cecd23`), an entirely unrelated concurrent story (Commander `--json`-contract parse-error fix) that had already claimed the id `story-maint-26` 3 minutes earlier and written its own `docs/plans/story-maint-26.md`. The Phase 2 `sibling-overlap` review caught the collision (identical plan-file path, unrelated content, both still draft). Resolved by renumbering this story to `story-maint-28` (the next free id, since `story-maint-27` was already taken by the sibling commander/Node-runtime story) — PR #224 keeps `story-maint-26` as the earlier claimant. Re-ran the uniqueness check for `maint-28`: `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i maint-28` → empty; `gh pr list --state open --json headRefName,title` → no other PR title or branch references `maint-28`. Clean.
- **`npm audit --audit-level=high`:** 0 findings, pre- and post-bump (checked in § "Pre-planning probe findings" below).
- **Proceed-to-planning.**

## Motivation

1. **Clears the routing block on PR #218.** The group can't be merged as-is once two of its members are excluded — Dependabot's own PR bundles all 9 into one diff.
2. **`typescript` 6→7 and `pixelmatch` 6→7 are both majors that fail an empirical probe** (see below) — routes to a full story regardless of any changelog-only assessment, per this repo's own "probe, don't just read the changelog" lesson from story-maint-21/22.
3. **The other 7 updates are confirmed zero-code-change** via a full local probe (lint/build/test/test:harness/audit), matching baseline exactly.

## Surface area (pre-planning probe)

**Package inventory (9 changes proposed by Dependabot; 7 taken, 2 excluded):**

| Package | From | To | Kind | Disposition |
| --- | --- | --- | --- | --- |
| `@types/node` | `26.1.0` | `26.1.1` | patch | taken |
| `eslint` | `10.6.0` | `10.7.0` | minor | taken |
| `fast-check` | `4.8.0` | `4.9.0` | minor | taken |
| `prettier` | `3.9.4` | `3.9.5` | patch | taken |
| `tsc-alias` | `1.9.0` | `1.9.1` | patch | taken |
| `tsx` | `4.23.0` | `4.23.1` | patch | taken |
| `typescript-eslint` | `8.63.0` | `8.64.0` | patch | taken |
| `typescript` | `6.0.3` | `7.0.2` | **major** | **excluded** — see below |
| `pixelmatch` | `6.0.0` | `7.2.0` | **major** | **excluded** — see below |

**Why `typescript` is excluded — confirmed by empirical probe, not changelog reading.** Installing `typescript@7.0.2` in isolation succeeds and `npm run build` passes cleanly (TypeScript 7's own compiler is backward-compatible enough for this codebase's `strict: true` config). But `npm run lint` crashes outright:

```
TypeError: Cannot read properties of undefined (reading 'Cjs')
    at .../node_modules/typescript-eslint/node_modules/@typescript-eslint/typescript-estree/dist/create-program/shared.js:59:18
```

`typescript-estree` (bundled inside `typescript-eslint`) reaches into TypeScript compiler internals whose shape changed in TS7's rewrite. This isn't a transient/unverified-peer-range situation: `npm view typescript-eslint@8.64.0 peerDependencies` — the exact version this same group bump targets — still declares `{ typescript: ">=4.8.4 <6.1.0" }` **today, upstream**. TS7 is outside the supported range of the linting toolchain this repo depends on; there is no newer `typescript-eslint` release to reach for. Excluded until `typescript-eslint` ships TS7 support.

**Why `pixelmatch` is excluded.** `npm view quickpickle@1.11.2 peerDependencies` → `{ pixelmatch: "^6.0.0" }`. Bumping to `7.2.0` reintroduces the exact ERESOLVE-shaped conflict [story-maint-22](story-maint-22.md) already fixed by pinning `pixelmatch` at `^6.0.0`. [Issue #57](https://github.com/xavierbriand/accounting/issues/57) tracks the real upstream fix (quickpickle declaring a real, current `pixelmatch` dependency); nothing has changed there since maint-22. Left at `^6.0.0`, unchanged by this story.

**Conclusion:** the 7 taken packages produce zero *production*-code change and zero *test*-code change. Three of them **are** imported directly in-repo — `fast-check` in ~25 files under `tests/unit/**` (property-based test assertions) and both `eslint`/`typescript-eslint` in [tests/_helpers/eslint-rule-tester.ts](../../tests/_helpers/eslint-rule-tester.ts) (the lint-rule test-suite harness) — but this is their expected, pre-existing role as test/lint tooling, not a new or surprising import surface; none of the 7 bumps introduce a new call site or change an API shape any of these call sites depend on, confirmed by the full test suite (which exercises all of these import sites) passing unchanged. The 2 excluded packages stay pinned at their current versions.

## Pre-planning probe findings

Ran `npm install @types/node@26.1.1 eslint@10.7.0 fast-check@4.9.0 prettier@3.9.5 tsc-alias@1.9.1 tsx@4.23.1 typescript-eslint@8.64.0` (the 7 taken packages only) + `npm run lint && npm run build && npm test && npm run test:harness` + `npm audit --audit-level=high` in this worktree on 2026-07-17. Also independently probed `typescript@7.0.2` in isolation (reverted — see § "Surface area").

| Gate | Pre-bump | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm install` | — | clean, no `ERESOLVE` | — |
| `npm run lint` | 97 warnings, 0 errors | 97 warnings, 0 errors (identical) | 0 |
| `npm run build` | green | green | 0 |
| `npm test` | 1010 passed / 1 skipped, 93 files | 1010 passed / 1 skipped, 93 files | 0 |
| `npm run test:harness` | 252 passed, 18 files | 252 passed, 18 files | 0 |
| `npm audit --audit-level=high` | 0 findings | 0 findings | 0 |
| `git diff --stat -- src/ tests/ harness/` | — | empty | 0 LOC changed |
| `package.json` diff | — | 7 line-pairs (the 7 taken bumps only) | as planned |
| `package-lock.json` diff | — | 370 changed lines (187 insertions / 183 deletions): the 7 top-level pins plus ordinary transitive re-resolution | benign |

## Production-code surface (R2)

None. This diff touches only `docs/plans/story-maint-28.md`, `package.json`, and `package-lock.json` — no file under `src/` changes type, signature, or format.

## Selected solution

**Option A — take the 7 unambiguously-safe updates, exclude `typescript` and `pixelmatch`, zero code change.** Chosen: both exclusions are backed by a concrete, reproduced failure (lint crash) or a concrete, verified upstream constraint (peer range), not speculation. The 7 taken packages probe clean end-to-end.

**Option B — take all 9 as Dependabot proposed, fix incompatibilities forward (e.g. suppress the TS7/typescript-eslint crash, or override the pixelmatch peer range).** **Rejected:** there is no available fix for the `typescript-eslint` incompatibility (no newer release supports TS7 today) short of dropping type-aware lint rules or switching linters entirely — out of scope for a routine dependency bump. The pixelmatch peer conflict could be forced with `--legacy-peer-deps` or an `overrides` entry, but that's exactly the workaround maint-22 already tried once and it doesn't fix the root incompatibility, only papers over it again.

**Option C — defer the entire group until both blockers clear upstream.** **Rejected:** would leave 7 genuinely-safe, already-probed-green updates sitting idle for no reason; better to take what's safe now and re-attempt the 2 exclusions in a future maintenance sub-loop once `typescript-eslint` ships TS7 support.

## Gherkin / AC scenarios

No `.feature` files — dep bumps have no CLI surface change. Scenarios map 1:1 to post-bump verification, per the story-maint-05/06/21/22 Gherkin-to-test-mapping precedent. **Pseudo-Gherkin, not automatable:** fenced as ` ```text ` rather than ` ```gherkin ` deliberately — `harness/dod-check`'s Gherkin↔step hard gate treats any ` ```gherkin ` fenced block as scenarios that must resolve against real `.feature` files ([issue #198](https://github.com/xavierbriand/accounting/issues/198)).

```text
Feature: dev-dependencies group bump (7 of 9), typescript 7 + pixelmatch 7 excluded

  Scenario: the 7 safe pins shift to their target versions
    Given package.json devDependencies pin the 7 "From" versions listed in § "Surface area"
    When the partial group bump is applied
    Then package.json devDependencies pin the 7 "To" versions
    And package-lock.json reflects the new resolutions
    And typescript stays at ^6.0.3 and pixelmatch stays at ^6.0.0

  Scenario: typescript 7 is confirmed incompatible with the current lint toolchain
    Given typescript-eslint@8.64.0 declares peerDependencies typescript ">=4.8.4 <6.1.0"
    When typescript is bumped to 7.0.2 in isolation
    Then npm run lint crashes with a TypeError inside typescript-estree
    And the bump is excluded from this story

  Scenario: no source code change required
    Given none of the 7 taken packages are imported directly by src/, tests/, or harness/ code
    When the partial group bump is applied
    Then every file under src/, tests/, and harness/ is byte-identical to its pre-bump state

  Scenario: full test suite green, unmodified
    Given the existing test suite passes pre-bump (1010 product tests / 93 files; 252 harness tests / 18 files)
    When the bump is applied
    Then `npm run lint && npm run build && npm test && npm run test:harness` completes green
    And no test file is modified
```

**Gherkin-to-test-mapping audit.** Each scenario asserts an invariant about the bump itself, not a new production path:

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — 7 pins shift, 2 stay pinned | `git diff` on [package.json](../../package.json) |
| 2 — typescript 7 incompatibility confirmed | § "Surface area" probe transcript (this plan) |
| 3 — no source code change | `git diff --stat -- src/ tests/ harness/` (expected: empty) |
| 4 — test suites green unmodified | the 1010-test product suite + 252-test harness suite (both unchanged) + CI |

Flagged here so Phase 4 review substitutes this probe-diff audit for the standard scenario-to-test walk rather than filing a spurious "missing test coverage" finding.

## Commit sequence — R15 major-bump-zero-code collapse

Per [CLAUDE.md § 6.7](../../CLAUDE.md) / [§ 8 R15](../../CLAUDE.md), a bump whose breaking-change audit produces a zero-code-change verdict for the taken subset collapses the standard `test:`/`feat:` rhythm to 4 commits.

1. `chore(docs): story-maint-28 plan + Phase 2 review (story-maint-28)` — this plan doc.
2. `chore(deps): bump dev-dependencies group (7 of 9) — exclude typescript 7 (lint-breaking) and pixelmatch 7 (quickpickle peer conflict) (story-maint-28)` — `package.json` + `package-lock.json` only. Body notes both exclusions' concrete evidence and closes #225.
3. `refactor: empty slot — no source change required (story-maint-28)` — no-op, following the story-maint-05/21/22 "empty refactor slot with justification" pattern.
4. `chore(retro): story-maint-28 retrospective (story-maint-28)`.

**Phase 3 (Implement) collapses into the Phase 1 probe**, same precedent as story-maint-05/06/21/22: the fix is fully pre-specified and probed end-to-end already. No Sonnet invocation.

Squash on merge optional.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (devDependency-only bump, no Core/domain concept touched — [CLAUDE.md § 6](../../CLAUDE.md) lane table): `sibling-overlap` only, `plan-reviewer` dropped. Findings below.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | **Blocking:** PR #224 and this story (drafted as `story-maint-26`) both claimed the id `story-maint-26`, including an identical `docs/plans/story-maint-26.md` path with unrelated content. #224 was created 3 minutes earlier. | adopted (blocking, fixed) | Renumbered this story to `story-maint-28` — see § "Maintenance sub-loop" R23 line for the full account. |
| P2 (sibling-overlap) | Coordinate: PR #218 (the Dependabot PR this story supersedes) is still open/mergeable; if merged directly before this story lands (as happened with #220/#222), it would reintroduce the excluded `typescript` 7 and `pixelmatch` 7 bumps. | adopted | Will close PR #218 manually immediately after this story merges, not left as a dangling follow-up. |
| P2 (sibling-overlap) | Coordinate: this story's `package-lock.json` hunks and story-maint-27's are disjoint (checked line ranges), but whichever merges second should rebase and re-verify the lockfile rather than assume a clean auto-merge. | adopted | Noted; will rebase onto `origin/main` (which will include whichever of #226/#227 merges first) before this story's own merge. |
| P2 (sibling-overlap) | Issue #225 (this story's own tracking issue), issue #223 and story-maint-27 (handled separately, no scope overlap), and issue #57 (correctly left untouched — pixelmatch stays pinned) all confirmed correctly scoped. | acknowledge | No plan change needed. |

**Phase 4 (code-reviewer, Reduced lane) — run 2026-07-17 against PR #226.**

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 (code-reviewer) | Plan carried no `## Production-code surface (R2)` section at all (sibling plans story-maint-24/25 both declare "None." explicitly rather than omitting the section). | fix-now | Added § "Production-code surface (R2)" stating "None." with the file-scope rationale. |
| P1 (code-reviewer) | § "Surface area" Conclusion claimed "no in-repo import of any of them outside their own tooling role" for the 7 taken packages — independently falsified: `fast-check` is imported directly in ~25 `tests/unit/**` files, and `eslint`/`typescript-eslint` are imported directly in `tests/_helpers/eslint-rule-tester.ts`. The bump's safety conclusion still holds (these are pre-existing, expected test/lint-tooling import sites, not new surface, and the full test suite exercising them passed unchanged) but the stated premise was factually inaccurate. | fix-now | Rewrote the Conclusion paragraph to name the three packages' real test-tooling import sites accurately rather than claiming zero imports. |
| P3 (code-reviewer) | The empty-refactor commit's justification ("None of the 7 bumped packages are imported directly by src/, tests/, or harness/ code") has the identical inaccuracy as the P1 finding above. | fix-now | Commit history was already being rewritten in the same pass (see next finding); the new empty-refactor commit body states the corrected premise. |
| P3 (code-reviewer) | The prep commit subject used "plan + Phase 2 review" instead of R30's literal canonical exempt text "plan + P1/P2/P3 review" (`PREP_COMMIT_SUBJECT` regex in `harness/dod-check/lib/commit-subject.ts:70` requires the exact phrase) — `countSlices` therefore didn't exempt the prep commit, inflating the reported slice count to 3. Also root-caused a second, independent gap: `parseEnvelopeRule`'s heading pattern doesn't match this plan's "## Commit sequence — R15..." heading, and its token pattern doesn't recognize `R15` at all (`ENVELOPE_TOKEN_PATTERN` only wires R13/R14/R16) — the same tooling gap already tracked in open issue #200, now with concrete code-level evidence. Also found: every Reduced-lane maintenance-story prep commit since R30 landed (story-maint-25, story-maint-27) has the identical "plan + Phase 2 review" vs. canonical-text mismatch, not just this one. | fix-now (subject wording) / acknowledge (envelope-token gap, already tracked by #200) | Rewrote this branch's prep-commit subject to the literal canonical text. The deeper `ENVELOPE_TOKEN_PATTERN`/R15-recognition gap is issue #200's scope, not re-filed separately; noting here that the "plan + Phase 2 review" wording drift across sibling stories is a distinct, worth-fixing-forward habit — flagged for the next maintenance story to use R30's exact phrase. |
| P2 (code-reviewer) | None — no product-QA-invariant surface touched by this diff (no monetary code, no `--json`/error-message changes, no migrations); `npm audit` 0 findings confirmed independently in CI logs. | acknowledge | No action needed. |
| P3 (soft, code-reviewer) | `package-lock.json` diff described as "~180 changed lines"; actual is 370 (187 insertions / 183 deletions). | fix-now | Corrected to the exact figure in § "Pre-planning probe findings". |

## Merge checklist

- [ ] `lint` / `build` / `test` / `test:harness` green on CI
- [ ] PR out of draft
- [ ] Retrospective file committed at `docs/retrospectives/story-maint-28.md`
- [ ] All suggestion-log items resolved (no blank `Resolution` cells)
- [ ] Phase-4 review (code-reviewer + sibling-overlap) findings classified fix-now / defer-issue / acknowledge
- [ ] User approval
