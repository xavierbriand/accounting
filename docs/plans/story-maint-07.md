# Story maint-07 — TypeScript 5.9.3 → 6.0.3

## Context

Seventh story on the pre-Epic-3 maintenance track. [Issue #11](https://github.com/xavierbriand/accounting/issues/11) — TypeScript major bump (`^5.9.3` → `^6.0.3`), routed through the main story loop per [CLAUDE.md § 6.7](../../CLAUDE.md). Critical-path dep (TypeScript is named in CLAUDE.md § 1's stack line). Per [story-maint-06 retro action item A](../retrospectives/story-maint-06.md), this story is the second observation target for "agent-delegated breaking-change audit" — if it saves time at similar magnitude, codify in § 6.7.

**Sequence position:** #18 ✓ (maint-01) → #22 ✓ (maint-02) → #35 ✓ (maint-03) → #21 ✓ (maint-04) → #38 ✓ (maint-05) → #12 ✓ (maint-06) → **#11 (maint-07, this PR)** → [#10](https://github.com/xavierbriand/accounting/issues/10) (dinero v2, schedule inside or after Epic 3) → Epic 3.

## Maintenance sub-loop

Run 2026-04-25 post-PR-#52 merge. Main synced. **0 open Dependabot PRs.** **`npm audit` 0 findings** (clean since [PR #49](https://github.com/xavierbriand/accounting/pull/49)). 9 open issues post-#12-close; all are deferred-suggestions or future-Epic-3 candidates. Proceed-to-planning.

## Pre-planning probe + agent-delegated breaking-change audit

Per [story-maint-06 retro action item A](../retrospectives/story-maint-06.md). Two parallel inputs:

**1. Agent-delegated breaking-change audit** (`general-purpose` agent, ~3 min). Verdict: *"Small fixes expected — single tsconfig diff (~5 lines), zero source-code changes."* Agent flagged 3 yes-rows (baseUrl deprecation, `types` default flip, `tsc <files>` advisory) + 3 probe-required rows (alwaysStrict, strict baseline, @types/node lib churn). Cross-verified my codebase greps: zero matches for legacy namespace, import assertions, triple-slash directives, decorator metadata, `Reflect.metadata`, `useDefineForClassFields`. `typescript-eslint@8.59.0` peer-deps span TS 6 (no major bump required).

**2. Pre-planning probe** (locally, in this branch's worktree, before plan commit):
1. `npm install typescript@6.0.3 --save-dev` → installed; `node_modules/typescript/package.json` reports 6.0.3.
2. `npm run build` → **failed** with 2 deprecation errors:
   - `tsconfig.json:6` `moduleResolution=node10` deprecated (we set `"node"`, alias of `node10`).
   - `tsconfig.json:12` `baseUrl` deprecated.
3. Applied 4 changes to [tsconfig.json](../../tsconfig.json):
   - `module: "ESNext"` → `"NodeNext"` (NodeNext requires the matching `module`).
   - `moduleResolution: "node"` → `"nodenext"`.
   - Drop `baseUrl: "./src"`.
   - `paths: { "@core/*": ["core/*"] }` → `["./src/core/*"]` (paths now relative to tsconfig dir, not baseUrl).
4. `npm run build` → **second failure**: NodeNext requires explicit `.js` extensions. Two test files had extension-less imports (pre-existing inconsistency; loose `node` resolution tolerated):
   - [tests/unit/core/shared/money.test.ts:3](../../tests/unit/core/shared/money.test.ts) `import { Money } from '@core/shared/money'`
   - [tests/unit/core/ledger/transaction.test.ts:3-4](../../tests/unit/core/ledger/transaction.test.ts) `Transaction` + `Money` imports
5. Added `.js` extensions to those 5 imports. `npm run build && npm run lint && npm test` → **all green, 224/224 tests pass**.

**Probe verdict differs from agent verdict on one point:** agent recommended adding `"types": ["node"]` to tsconfig (claiming the `types` default flips to `[]` in TS 6). Probe shows this is unnecessary — `skipLibCheck: true` plus the natural auto-include of `@types/node` from `node_modules` keeps Node globals (`process`, `fs`, etc.) resolved without an explicit list. Logged in the suggestion log (P3.3, rejected).

## Verdict

**Near-zero-code-change.** The TS 6 migration requires tsconfig modernisation (deprecations) and test-import hygiene (NodeNext extensions), but no source-code logic changes. Total diff: 4 LOC in `tsconfig.json` + 5 LOC across 2 test files + the standard package.json/lockfile update. The 224-test suite passes unmodified.

This is **NOT** the strict zero-code-change shape that triggers the [§ 6.7 carve-out](../../CLAUDE.md). However, the spirit applies: the small mechanical changes are forced by the dep bump, no behaviour is added or removed, no TDD red→green rhythm exists for tsconfig deprecations or import-extension fixes. The plan applies the carve-out **by analogy** — Phase 3 collapses into the probe — but commits the tsconfig and test-extension changes as `chore(tsconfig)` and `test(core)` slices rather than bundling them with the deps commit.

## Selected solution

Three options considered.

**Option A — defensive escape hatch.** Add `"ignoreDeprecations": "6.0"` to tsconfig. Silences the deprecation errors without addressing the underlying issue; punts to TS 7.0 timeline. Rejected: leaves a known-bad config behind, requires another story before TS 7.0 lands. Story 2.5 retro precedent (CLAUDE.md § 6.4): "fix it now is the right answer when the fix is the same size as the kick-the-can".

**Option B — bump only, ship without tsconfig changes.** Impossible: probe proves `npm run build` fails on a fresh TS 6 install without the tsconfig modernisation.

**Option C — modernise tsconfig + fix test imports** (chosen). The 4-line tsconfig delta and 5-line test-extension delta are mechanical, verified by the probe, and durable past TS 7.0. This is the shape Microsoft is steering everyone toward (the deprecations exist precisely to flush old `node` resolution + `baseUrl` patterns).

### Concrete delta (verified by probe)

[tsconfig.json](../../tsconfig.json):
```diff
-    "module": "ESNext",
+    "module": "NodeNext",
-    "moduleResolution": "node",
+    "moduleResolution": "nodenext",
     ...
-    "baseUrl": "./src",
     "paths": {
-      "@core/*": ["core/*"]
+      "@core/*": ["./src/core/*"]
     }
```

[tsconfig.test.json](../../tsconfig.test.json) — unchanged. Inherits all four edits via `extends: "./tsconfig.json"`.

[tests/unit/core/shared/money.test.ts](../../tests/unit/core/shared/money.test.ts):
```diff
-import { Money } from '@core/shared/money';
+import { Money } from '@core/shared/money.js';
```

[tests/unit/core/ledger/transaction.test.ts](../../tests/unit/core/ledger/transaction.test.ts):
```diff
-import { Transaction } from '@core/ledger/transaction';
-import { Money } from '@core/shared/money';
+import { Transaction } from '@core/ledger/transaction.js';
+import { Money } from '@core/shared/money.js';
```

## Gherkin scenarios

```gherkin
Feature: TypeScript 5.9.3 → 6.0.3 migration

  Scenario: dependency pin shifts to v6
    Given package.json devDependencies["typescript"] == "^5.9.3"
    When `npm install typescript@6.0.3 --save-dev` is applied
    Then package.json devDependencies["typescript"] == "^6.0.3"
    And package-lock.json reflects the new resolution

  Scenario: tsconfig modernised — NodeNext + paths without baseUrl
    Given tsc 6 emits TS5107 (moduleResolution=node10 deprecated) and TS5101 (baseUrl deprecated)
    When tsconfig.json is updated to module=NodeNext, moduleResolution=nodenext,
         baseUrl removed, paths value rewritten to "./src/core/*"
    Then `npm run build` (which runs both tsc invocations) emits zero diagnostics

  Scenario: NodeNext-required .js extensions on @core/* imports
    Given two test files import @core/* without the .js extension
    When NodeNext is enabled
    Then those imports must include .js to resolve
    And no other test or src file requires the same fix (verified by `npm run build` post-edit)

  Scenario: full lint + build + test suite green, no source code changes
    Given the existing 224-test suite passes pre-bump
    When typescript is bumped to 6.0.3 and the tsconfig + test extensions land
    Then `npm run lint && npm run build && npm test` completes green on CI
    And no file in src/ is modified by this story

  Scenario: npm audit remains at zero findings
    Given npm audit reports 0 findings pre-bump
    When the bump and tsconfig changes land
    Then npm audit reports 0 findings post-bump

  Scenario: typescript-eslint stays compatible without bump
    Given typescript-eslint@^8.59.0 declares peer typescript >=4.8.4 <6.1.0
    When typescript is bumped to 6.0.3
    Then npm install reports no peer-dependency warnings
    And `npm run lint` continues to operate without rule-loading errors
```

**Gherkin-to-test-mapping audit** ([Story 2.5 retro action C](../../CLAUDE.md)). Scenarios assert invariants about the bump rather than new production paths, so the standard walk is substituted with: `git diff main...HEAD -- src/` returns 0 lines (scenario 4); `npm run build` (scenario 2 + 3); 224/224 vitest green (scenario 4); `npm audit` (scenario 5); peer-deps inspection (scenario 6). All verified by the pre-planning probe before plan commit.

## Slice plan (carve-out by analogy)

Phase 3 collapsed into the pre-planning probe per [§ 6.7](../../CLAUDE.md). Sonnet delegation skipped — the diff is 4 files (tsconfig + 2 tests + package.json + lockfile) with all coordinates verified by the probe. Mechanical edits, no design surface.

Sequence (5 commits + retro):

1. **`chore(docs): story-maint-07 plan + P1/P2/P3 review (story-maint-07)`** — this plan.
2. **`chore(deps): bump typescript 5.9.3 → 6.0.3 (story-maint-07)`** — `package.json` + `package-lock.json` only.
3. **`chore(tsconfig): modernise for TS 6 NodeNext (story-maint-07)`** — the 4-line tsconfig diff. Without slice 4 the build is red; the slice intentionally documents the modernisation in isolation.
4. **`test(core): add .js extensions to @core/* imports for NodeNext (story-maint-07)`** — the 5-line extension fix across 2 test files. After this commit, `npm run build && npm test` is green.
5. **`refactor: empty slot (story-maint-07)`** — per [§ 6.4](../../CLAUDE.md). Body: "No-op: TS 6 migration required no source-code refactor; tsconfig modernisation is the entire delta."
6. **`chore(retro): story-maint-07 retrospective (story-maint-07)`** — closes the loop.

The "NodeNext extension fix" is logically a separate concern from the tsconfig modernisation (it's test-file hygiene that was always inconsistent, the bump just exposed it). Splitting into slices 3 and 4 keeps each commit's scope auditable.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-25. 7 entries: 5 adopted, 2 rejected with one-line reasons, 0 deferred.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Scenario 4 ("no source code change") relies on a `git diff` assertion. Should the plan additionally name an explicit grep for `src/` LOC delta? | adopted | Added `git diff main...HEAD -- src/` returns 0 lines as the grep target. Phase 4 retro-check will run it. |
| P1 | Scenario 6 (typescript-eslint compat) has no concrete test — peer-deps warnings are an `npm install` side-output, not a test signal. | adopted | Re-formulated: "no peer-dependency warnings" is asserted by the install step; no separate test slice needed. The probe's clean install validates this once. |
| P2 | The probe modified the working tree. Should the plan note that the tree was reset before the plan commit and reapplied via the slice commits? | rejected | Working-tree state vs commit-tree state is a workflow detail, not a product/QA concern. The slice commits document the changes; that's the canonical record. |
| P3 | Audit agent recommended `"types": ["node"]`. Should we add it for forward-safety with TS 7? | rejected | Probe verified it's unnecessary at TS 6 (skipLibCheck + auto-include of `@types/node` cover Node globals). Adding a speculative compiler option violates the "minimal diff" preference; if TS 7 actually requires it, file then. |
| P3 | Drop `rootDir: "./src"` — it's redundant when `include` already names `src/**/*`. | rejected | Different concern: `rootDir` constrains the *emit* path layout, `include` constrains *what gets typechecked*. Dropping `rootDir` would emit `dist/` files at unexpected nested depths. Keep. |
| P3 | The tsconfig delta should also tighten `noUncheckedSideEffectImports` (new in v5/6 era). | rejected | Verified by audit-agent grep: zero side-effect-only imports in `src/`. Adding the flag now is preemptive scope expansion; revisit if a future story introduces side-effect imports. |
| P3 | Two test files had pre-existing `.js`-extension inconsistency. Was a Phase-1 lint rule needed (no-extensionless-relative-imports)? | adopted | Recorded as Try-item in this retro: investigate whether `eslint-plugin-import` or a typescript-eslint rule would catch this class of inconsistency in CI. Not in this PR's scope; if maint-08 or similar reproduces extension inconsistency, file as a follow-up. |

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 7 findings (5 adopted, 2 rejected with reasons, 0 deferred).
- [x] Pre-planning probe verified the verdict (224/224 green with the 4 tsconfig + 5 extension changes applied locally).
- [x] Agent-delegated breaking-change audit (~3 min, second data point for [maint-06 retro action A](../retrospectives/story-maint-06.md)).
- [ ] Draft PR with template sections 1–6 filled. **Next action.**

**DoR gate met.** Phase 3 collapses into the probe; no Sonnet invocation. Slices 2–5 stage the verified changes from the probe.
