# Story maint-06 — Migrate ESLint 9.39.2 → 10.2.1

## Context

ESLint is a dev-tooling dep currently pinned at `^9.39.2` ([package.json:42](package.json)). Latest is `10.2.1` — a 1-major-version jump. Filed as [#12](https://github.com/xavierbriand/accounting/issues/12) by xavierbriand on 2026-04-21 (the dev-dep pre-Epic-3 group); originally surfaced from Dependabot PR #5. Flagged in [CLAUDE.md § 6.7](CLAUDE.md) as a major bump → main story loop.

**Position in the pre-Epic-3 sequence:** #18 ✓ (maint-01) → #22 ✓ (maint-02) → #35 ✓ (maint-03) → #21 (maint-04, in flight as [PR #50](https://github.com/xavierbriand/accounting/pull/50)) → #38 ✓ (maint-05 via [PR #48](https://github.com/xavierbriand/accounting/pull/48)) → **#12 (this story, maint-06)** → [#11](https://github.com/xavierbriand/accounting/issues/11) → Epic 3.

**Maintenance sub-loop (CLAUDE.md § 6.7) — 2026-04-25, this run.**
- **Open Dependabot PRs:** none. (PRs #50, #36 are story drafts; not Dependabot.)
- **Open issues (11):** [#51](https://github.com/xavierbriand/accounting/issues/51) opened today (`Add .claude/ to .gitignore`) — relevant to this worktree's `.claude/settings.local.json` artefact but separate scope. No re-triage of others needed.
- **`npm audit`:** 0 findings (info/low/moderate/high/critical all 0). Repo is at fully-clean state per [story-maint-05 retro](docs/retrospectives/story-maint-05.md) + [PR #49](https://github.com/xavierbriand/accounting/pull/49).

**Proceed-to-planning.**

## Motivation

1. **Stay on a supported major.** ESLint 9 is still maintained but 10 is the current line; v9 will fall behind security/feature patches as v10 stabilises.
2. **No security-driven urgency.** `npm audit` is clean — no audit-chain pressure (unlike maint-05). Pure hygiene.
3. **Smallest possible surface area now.** [eslint.config.js](eslint.config.js) is **10 lines**: one `js.configs.recommended` extend + `tseslint.configs.recommended` spread + `ignores`. Custom rule adoption can only get harder if we delay.

## Surface area (pre-planning probe)

[eslint.config.js](eslint.config.js) is 10 lines, one file, no plugins beyond `@eslint/js` + `typescript-eslint`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist", "node_modules", "coverage"],
  }
);
```

- No custom rules
- No legacy `.eslintrc` migration concerns (already on flat config)
- No JSX/TSX (no JSX-relevant breakage)
- No `eslint-env` comments (none in repo)
- `@eslint/js` is a transitive dep (resolved through `eslint`)
- `typescript-eslint@^8.59.0` peer-deps `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0` → v8 already supports ESLint 10. **No `typescript-eslint` bump needed.**

## Breaking-change audit (ESLint 10.0.0 → 10.2.1)

Sources: [eslint/eslint CHANGELOG.md](https://github.com/eslint/eslint/blob/main/CHANGELOG.md) v10.0.0..v10.2.1 + [migrate-to-10.0.0](https://eslint.org/docs/latest/use/migrate-to-10.0.0).

| Breaking change | Our usage | Impact |
| --- | --- | --- |
| 3 new rules added to `js.configs.recommended` (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`) | Existing `src/` + `tests/` may newly fail | **Probe-required** |
| Old `.eslintrc` format / `FlatESLint` / `LegacyESLint` removed | Already on flat config | None |
| `eslint-env` comments now errors | None in repo | None |
| New config-file lookup defaults to file-relative search | Single root `eslint.config.js`, no `v10_config_lookup_from_file` flag | None |
| POSIX char-classes in glob bracket expressions now honoured | `ignores` are plain literals (`dist`, `node_modules`, `coverage`) | None |
| JSX reference tracking enabled | No JSX/TSX in `src/` | None |
| `name` property restored on `@eslint/js` core configs | No `FlatCompat` | None |
| `no-shadow-restricted-names` reports `globalThis` by default | Rule not explicitly set | None |
| `radix`, `func-names`, `no-invalid-regexp` schema changes | Rules not explicitly set | None |
| Node ≥ `^20.19.0 \|\| ^22.13.0 \|\| >=24` | CI on `'20'` floating tag (resolves to ≥20.19 since Apr 2025) | None on 2026-04-25; **defensive pin candidate** (P3) |
| `@eslint/js` adds `eslint` in `peerDependencies` (v10.0.1, eslint#20467) | We import `@eslint/js` transitively | **Probe-required** (lockfile peer warnings) |

**Conclusion before probe:** zero code change in `eslint.config.js` expected. The migration is `package.json` + `package-lock.json` only. Two probe-required items: (a) the 3 new `recommended` rules against existing `src/` + `tests/`, (b) `@eslint/js` peerDeps lockfile reaction.

## Pre-planning probe findings

Ran `npm install eslint@10.2.1 --save-dev` + `npm run lint && npm run build && npm test` + `npm audit` in this worktree on 2026-04-25, following the [story-maint-05](docs/retrospectives/story-maint-05.md) precedent (which inherited it from [story-maint-01](docs/plans/story-maint-01.md)).

| Gate | Pre-bump | Post-bump | Delta |
| --- | --- | --- | --- |
| `npm run lint` | green (0 findings) | green (0 findings) — no triggers from `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error` against existing `src/` + `tests/` | 0 |
| `npm run build` (`tsc` + `tsc -p tsconfig.test.json`) | green | green | 0 |
| `npm test` | 217 tests pass across 25 files | 217 tests pass across 25 files | 0 |
| `npm audit` | 0 findings | 0 findings | 0 |
| `npm install` peer warnings | none | none — `@eslint/js@10.0.1` peerDeps satisfied via hoisting | 0 |
| [eslint.config.js](eslint.config.js) diff | — | byte-identical | 0 LOC changed |

The probe **confirms zero-code-change verdict** for both probe-required items: the 3 new rules don't trigger on existing code, and the `@eslint/js` peerDeps shift is satisfied transitively.

## Selected solution

Three approaches considered.

### Divergent options

**Option A — straight `npm install eslint@10.2.1 --save-dev`, zero code change.** Bump the pin, regenerate lockfile, run the suite + lint, commit. **Pro:** smallest diff; matches issue scope verbatim. **Con:** keeps `@eslint/js` as a transitive dep (we `import` it directly in [eslint.config.js](eslint.config.js)) — fragile if hoisting changes.

**Option B — bump + add `@eslint/js` as a direct devDep.** Same bump, plus pin `@eslint/js@^10.0.1` in `package.json`. **Pro:** removes the hoisting fragility; matches ESLint's recommended flat-config setup. **Con:** out of issue scope; +1 line to `package.json`; minor maintenance follow-up. Could be defended as inside scope (issue says "review for removed rules / new defaults" — `@eslint/js` direct-pin is a config-correctness concern). Probe didn't flag it as a current problem.

**Option C — bump ESLint + bump `typescript-eslint` to v9 (latest is `^8.59.0`, but `typescript-eslint@9` exists).** **Pro:** keeps the typescript-eslint major also current. **Con:** `typescript-eslint@8.59.0` already supports ESLint 10 per its peerDeps — no need. Combining a typescript-eslint major into this story is what made Dependabot PR #5 fail (per issue #12 source paragraph). **Rejected** — out of scope.

### Chosen — Option A

Rationale:
- Probe-confirmed zero-code-change verdict.
- Issue #12 scope says "package.json devDep bump" + "review for removed rules / new defaults" — Option A satisfies both with the breaking-change audit (§ above) standing in for the rule review.
- Option B's `@eslint/js` direct-pin is a defensible improvement but not justified by current evidence (probe shows hoisting works). File as a follow-up `deferred-suggestion` issue if the next ESLint major exposes the fragility.

## Gherkin / AC scenarios

Same shape as [story-maint-05 § 5](docs/plans/story-maint-05.md) — scenarios assert invariants about the bump rather than new production paths.

```gherkin
Feature: ESLint 9.39.2 → 10.2.1 migration

  Scenario: dependency pin shifts to v10
    Given package.json devDependencies["eslint"] == "^9.39.2"
    When `npm install eslint@10.2.1 --save-dev` is applied
    Then package.json devDependencies["eslint"] == "^10.2.1"
    And package-lock.json reflects the new resolution

  Scenario: no source code change required
    Given eslint.config.js is the 10-line config in § 3
    When eslint is bumped to 10.2.1
    Then eslint.config.js is byte-identical to its pre-bump state

  Scenario: lint stays green against the 3 new rules in v10's `js.configs.recommended`
    Given npm run lint reports 0 findings on existing src/ + tests/ pre-bump
    When eslint is bumped to 10.2.1
    Then npm run lint still reports 0 findings post-bump
    And no new violations of `no-unassigned-vars`, `no-useless-assignment`, or `preserve-caught-error` exist in the codebase

  Scenario: full test + build suite green, unmodified
    Given the existing 217-test suite passes pre-bump
    And npm run build is green pre-bump
    When eslint is bumped to 10.2.1
    Then `npm run lint && npm run build && npm test` completes green on CI
    And no test or source file is modified by this story

  Scenario: npm audit remains at zero findings
    Given npm audit reports 0 findings pre-bump
    When eslint is bumped to 10.2.1
    Then npm audit reports 0 findings post-bump

  Scenario: typescript-eslint stays compatible without bump
    Given typescript-eslint@^8.59.0 declares peer eslint ^8.57.0 || ^9.0.0 || ^10.0.0
    When eslint is bumped to 10.2.1
    Then npm install reports no peer-dependency warnings
```

**Gherkin-to-test-mapping audit ([Story 2.5 retro action C](CLAUDE.md)).** Same substitution as maint-05: scenarios verified by `git diff` + `npm run lint` + `npm test` + `npm audit` outputs, not by automated tests. Phase 4 should walk these against the diff, not file a missing-test-coverage finding.

## Commit sequence

Following the [story-maint-05 § 7](docs/plans/story-maint-05.md) pattern (rhythm collapsed; no `test:`/`feat:` pair because there is no behaviour to test-drive):

1. `chore(docs): story-maint-06 plan + P1/P2/P3 review (story-maint-06)` — this plan doc.
2. `chore(deps): bump eslint from 9.39.2 to 10.2.1 (story-maint-06)` — `package.json` + `package-lock.json` only. Body: 1-major-version jump, 3 new `recommended` rules don't trigger, typescript-eslint v8 already compatible, closes #12.
3. `refactor(cli): empty slot — eslint.config.js unchanged (story-maint-06)` — empty slot per [CLAUDE.md § 6.4](CLAUDE.md). Body: no-op; v10 breaking changes are all N/A.
4. `docs(claude): codify major-bump-with-zero-code-change subcase in § 6.7 (story-maint-06)` — **lands the maint-05 retro action item** (CLAUDE.md § 6.7 sidebar). Triggered by this story being the second data point for the pattern. See § 8.
5. `chore(retro): story-maint-06 retrospective (story-maint-06)` — `docs/retrospectives/story-maint-06.md`.

5 commits. Same structure as maint-05 minus the rebase/rename housekeeping (which were specific to mid-story disruption that hasn't recurred so far in this run).

## Implementation phase (Phase 3) — collapsed into the pre-planning probe

Per [story-maint-05 § 8](docs/plans/story-maint-05.md): the probe in § 4 *is* the implementation. Phase 3 collapses into Phase 1. No Sonnet delegation — pure ceremony for a two-file dep diff.

This is the **second occurrence of this collapse** within ten end-to-end loop runs (first was maint-05, [#48](https://github.com/xavierbriand/accounting/pull/48)). Per maint-05 retro § Try, the second data point is the trigger to land a CLAUDE.md § 6.7 codification — see commit #4 above and § "CLAUDE.md edit" below.

## CLAUDE.md edit (maint-05 retro action triggered)

[Story-maint-05 retro § Try](docs/retrospectives/story-maint-05.md) committed to a passive-observation rule:

> When [#11](https://github.com/xavierbriand/accounting/issues/11) or [#12](https://github.com/xavierbriand/accounting/issues/12) lands … explicitly answer three questions:
> 1. Did the breaking-change audit produce a zero-code-change verdict?
> 2. Did Phase 3 collapse into the probe?
> 3. Was the commit-rhythm skipped?
> If *all three* answers are "yes" again, action item: add a 2-line sidebar to CLAUDE.md § 6.7 …

For this story (maint-06 = #12): all three answers are **yes**. Codification triggers.

**Proposed § 6.7 addition** (inserted after the `npm audit` bullet, before the "Lighter than feature work" closing line):

> **Major-bump-with-zero-code-change subcase.** When a major dep bump goes through the main loop (above rule) and the breaking-change audit produces a zero-code-change verdict against a pre-planning probe (run install + lint + build + test + audit *before* committing the plan), the TDD rhythm in § 6.4 cannot apply by construction — there is no behaviour to test-drive. Commit sequence collapses to `chore(docs): plan` + `chore(deps): bump` + `refactor: empty slot` + `chore(retro)` (+ rebase/rename housekeeping commits as needed). Phase 3 (implementation) collapses into the Phase 1 probe — Sonnet delegation is pure ceremony for a two-file dep diff. Flag the collapse explicitly in the plan's "Implementation phase" section. Exemplars: [story-maint-05](docs/retrospectives/story-maint-05.md) (`@inquirer/prompts` 5→8), [story-maint-06](docs/retrospectives/story-maint-06.md) (ESLint 9→10).

Per [CLAUDE.md § 7 item #10](CLAUDE.md): "Any new rule or constraint from the retrospective lands in the same PR as a CLAUDE.md / docs/ / template edit." → this edit lands as commit #4 of this PR.

## Suggestion log

Phase 2 (P1 / P2 / P3) entries below. Phase 4 retro-check extends after the dep-bump commit lands.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Issue #12 says "Run `npm run lint` and resolve any new findings" — probe shows 0 new findings, so the AC is satisfied by suite-green rather than any explicit fix. Plan should call this out so reviewers don't expect an "applied lint-fix" commit. | adopted | § 5 scenario 3 explicitly asserts "no new violations of the 3 new rules"; § 4 probe table makes it concrete. |
| P1 | Issue #12 says "typescript-eslint compatibility with ESLint 10". Plan should record that v8.59.0 already supports v10 per peerDeps. | adopted | § 3 surface area + § 5 scenario 6 explicit. |
| P2 | Coherence with [story-maint-05 retro § Try](docs/retrospectives/story-maint-05.md): does this run trigger the codification? | adopted | § 8 + commit #4 lands the CLAUDE.md edit. |
| P2 | The 3 new rules added to v10's `recommended` could be stricter than v9's set in subtle ways even if no findings fire on existing code. Worth explicitly probing the rules' triggers against tests/ as well as src/. | adopted | Probe ran `npm run lint` which lints both `src/` + `tests/` per the `tsconfig.test.json` integration (story-maint-01). Verified in § 4 probe table. |
| P3 | `@eslint/js` is imported directly in [eslint.config.js](eslint.config.js) but is a transitive dep, not a direct devDep — fragile under hoisting changes. Pin as direct devDep? | **adopted (post-CI fix)** | Originally rejected based on local probe ("hoisting works"). **CI build failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@eslint/js'`** — local probe was contaminated by parent repo's stale `node_modules/@eslint/js@9.x` (Node's resolution walks up the worktree's parent dir). v10.0.1's `@eslint/js` declares `eslint` in `peerDependencies` (eslint#20467), so without a direct pin it doesn't get installed. Fix landed as commit 6: `fix(deps): pin @eslint/js as direct devDep`. **Probe blind spot recorded as retro Change C.** |
| P3 | Node ≥ 20.19 is required by ESLint 10. CI uses `node-version: '20'` floating tag. Pin defensively to `'20.19'` or `'lts/iron'`? | rejected | The floating `'20'` tag resolves to ≥20.19 since Apr 2025; CI is correct as-is. Defensive pinning would force manual bumps for every Node patch. Floating LTS major is the project convention. |
| P3 | Story 2.5 retro action C Gherkin-to-test-mapping audit doesn't cleanly apply (same as maint-05). | adopted | § 5 explicitly substitutes verification mechanisms; Phase 4 reviewer should not file missing-test-coverage. |
| P3 | Plan should reference the maint-05 § 8 collapse pattern explicitly so readers don't repeat the analysis. | adopted | § 7 + § 8 reference maint-05 directly. |
| P3 | `commander`, `@types/node@25` and other dev deps not bumped — should this story bundle them? | rejected | Per § 6.7 routine bumps merge directly via Dependabot (none open right now); critical-path majors get their own stories (typescript via #11, dinero.js via #10). YAGNI to bundle. |
| P4-retro | Diff matches plan exactly: 0 LOC in [src/](src/) or [tests/](tests/) or [eslint.config.js](eslint.config.js); package.json shows only the `^9.39.2 → ^10.2.1` pin shift; CLAUDE.md +4/-2 (sidebar + DoD #5 patch). | verified | `git diff main...HEAD --stat`: 4 files (CLAUDE.md, plan, package-lock, package.json). |
| P4-retro | All 6 Gherkin scenarios verified by diff + probe outputs (no automated tests, per § 5 substitution). | verified | (1) pin shift via package.json diff; (2) eslint.config.js unchanged via `git diff`; (3) lint green; (4) suite green; (5) audit zero; (6) no peer warnings. |
| P4-retro | Commit-rhythm collapse no longer a deviation — covered by [CLAUDE.md § 6.7 sidebar](CLAUDE.md) landed in commit #4. | verified | DoD § 7 item #5 patched in same commit to reference the carve-out. |
| P4-retro | DoD § 7 item #10 (retro-derived rules land in same PR) satisfied by commit #4. | verified | The CLAUDE.md edit is the sole rule change derived from this PR's chain (maint-05 retro → maint-06 trigger). |
| P4-retro | No mock-diversity-class regression (Story 2.4 retro action A). | N/A | No structured-output assertions in the diff. |
| P4-retro | No safeguard-removal concerns (Story-maint-01 retro action A). | N/A | No code change. |

## Sonnet's learnings

_N/A — Phase 3 collapsed into the Phase 1 probe. Implementation is the `chore(deps): bump eslint` commit (§ 7 commit #2)._

## Retrospective

Full retrospective: [docs/retrospectives/story-maint-06.md](docs/retrospectives/story-maint-06.md). Headline: third application of the pre-planning probe pattern (maint-01 → maint-05 → maint-06); second data point for the Phase-3-collapse + rhythm-skip pattern → triggered the [CLAUDE.md § 6.7](CLAUDE.md) sidebar codification (commit #4) + DoD § 7 item #5 patch. Agent-delegated breaking-change audit (general-purpose agent) was a clean win vs manual cross-walk; flagged as one-data-point candidate for the next major-bump retro (#11 TypeScript 6).

## Merge checklist

- [ ] `lint` / `build` / `test` green on CI
- [ ] PR out of draft
- [ ] Retrospective file committed at `docs/retrospectives/story-maint-06.md`
- [ ] All suggestion-log items resolved (no blank `Resolution` cells)
- [ ] All Phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)
- [ ] CLAUDE.md § 6.7 sidebar landed (commit #4 — DoD § 7 item #10 satisfied)
- [ ] Manual smoke-test: N/A (lint/build are non-interactive; no UX surface)
- [ ] User approval
