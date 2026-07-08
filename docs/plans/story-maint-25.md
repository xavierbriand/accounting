# Story maint-25 — conditional-test-logic rule refinement + genuine-smell fixes

## Context

Follow-up from [story-maint-24](docs/retrospectives/story-maint-24.md) via [issue #206](https://github.com/xavierbriand/accounting/issues/206): `local/conditional-test-logic` (the paper's flagship highest quality-correlation smell, per [docs/plans/story-maint-24.md § 1](docs/plans/story-maint-24.md)) was wired at `warn` with 151 hits at the time, deliberately un-narrowed pending a human triage pass — two known-legitimate categories (`finally`-block cleanup guards, `fc.property` precondition early-returns) were observed but not excluded from the rule, to avoid self-authoring away hits without review.

This story is that triage. A multi-agent workflow (26 parallel per-file agents, each reading the full file + every flagged line's surrounding context, followed by a synthesis pass cross-checking every proposed rule exclusion against the whole dataset for counter-examples) classified all 155 current hits (the count moved from 151 → 155 as unrelated stories landed on `main` in the interim — story-4.3a added `settlement-variance-service.test.ts`, story-maint-23 modified several CLI command tests). Full synthesis retained in this session; summarized below.

**No model impact** — dev-tooling rule refinement + test-file restructuring, no Core domain concept touched (R24 default).

**Maintenance sub-loop (CLAUDE.md § 6.7).**
- **Sibling work:** only open PR is #210 (`story-4.3b`, Settlement Variance CLI) — disjoint file set (touches `src/cli/commands/explain*`, not `eslint-rules/**` or the 15 test files this story edits).
- **Story-id uniqueness (R23):** `story-maint-25` confirmed free via `git ls-tree -r --name-only origin/main -- docs/plans docs/retrospectives docs/status.d | grep maint-2[5-9]` (empty) and every open PR's file list (`gh pr view <n> --json files`, checked for both the id and this story's actual file surface — the lesson from story-maint-24's two collisions, applied).
- **Proceed-to-planning.**

## Production-code surface (R2)

None. This story only touches `eslint-rules/test-smells/conditional-test-logic.js` (+ its `RuleTester` spec) and a set of existing test files under `tests/` (restructuring existing assertions, not adding/removing test coverage or changing what's verified — the exact file list is enumerated in § 2 below). No `src/` changes.

## Recommended approach

### 1. Rule refinement — three new exclusion patterns

Add to `eslint-rules/test-smells/conditional-test-logic.js`, each verified against the full 155-hit dataset for counter-examples (not just the instances that motivated it):

1. **fc-property precondition/filter skip** (~41 hits). An `IfStatement` with no `else`, whose consequent is solely a bare `return;` or literal `return true;` (property-skip) or `return false;` (arbitrary-filter skip), located anywhere inside a callback passed to `fc.property(...)`/`fc.asyncProperty(...)` (property-skip shape) or `.filter(...)` chained off an `fc.*` factory call (filter-skip shape, e.g. `fc.string(...).filter(fn)`). Verified: every genuine-smell `If` in the dataset either has an `else`, returns a *computed* boolean (not a literal), or has extra statements in its consequent — none collide with this shape.
2. **Top-level Result/nullable narrowing guard** (~11 hits). An `IfStatement` that is a **direct** statement of an `fc.property` callback's top-level block (not nested in any further control-flow), whose test is exactly `<ident>.isFailure` / `!<ident>.isSuccess` / `!<ident>` (single identifier/member check, no `&&`/`||`), whose consequent is solely `return false;`/bare `return;` with no side effects, and where `<ident>` is referenced again later in the same block. Verified against the specific lookalikes that must NOT be excluded: a compound `||` condition (`node-csv-parser.test.ts:260`), a guard nested inside a `for...of` rather than top-level (`safe-transfer-calculator.test.ts:293`), and a guard with a side effect before the return (`sqlite-transaction-repo.test.ts:372`) — all three correctly stay flagged under this shape's constraints.
3. **`finally`-block cleanup guard** (2 hits) — already scoped in the original story-maint-24 plan, not yet implemented: any control-flow statement whose nearest enclosing block is a `TryStatement.finalizer`.

**Explicitly NOT implemented:** a fourth pattern the per-file triage agents proposed (~19 hits) — "loop over a fast-check-generated, variable-length array with a nested per-element guard is never a smell." Falsified by the dataset itself: `date-arithmetic.test.ts:104-105` is the *identical* AST shape and is a confirmed genuine smell (a sibling property test in the same file expresses the equivalent invariant via `.every()`, proving the loop was avoidable). AST can't see "an equivalent `.every()`-based sibling exists two tests down," so this stays individually judged at `warn`, not rule-excluded.

Expected effect: ~53 of 155 hits drop to zero after this slice (verify empirically, don't assume the arithmetic).

### 2. Genuine-smell fixes — 55 hits across 15 files, mechanical restructuring only

Every fix preserves the exact assertion being made — restructuring control flow into `expect()`/`.every()`/`.reduce()`/`it.each()`, not changing what's verified. Full per-file fix list (from the triage synthesis):

- **`safe-transfer-calculator.test.ts`** (8 fixes): sortedness/purity/sum loops → `.every()`/`.reduce()`; standalone `if (!x.equals(y)) return false` × 3 → `expect(...).toBe(true)`; Property #7's per-index cluster → one `expect(items1.map(pick)).toEqual(items2.map(pick))`.
- **`recurring-forecast-service.test.ts`** (2): file-pair loop → `it.each`; uniform-constant loop → single `expect(...every(...))`.
- **`idempotency-service.test.ts`** (10): index-loop equality → `.map().toEqual()`; narrowing `if` → `expect(isSuccess).toBe(true)`; count/array-equality loops → mapped `expect`s.
- **`settlement-variance-service.test.ts`** (2): Invariant 2's `for...of` + early-return over `['Alex','Sam']` → `.every()`, restyled to match Invariant 3's existing `.every()` idiom later in the same file (correction from an earlier draft of this plan, which misattributed the fix target itself as "Invariant-3" — Phase 4 code-reviewer finding).
- **`correction-service.test.ts`** (5): hand-rolled net-by-account loop → reuse the file's own `netByAccount` helper (already defined, just not called here).
- **`sqlite-transaction-repo.test.ts`** (4): outcome loop → `it.each`/mapped assertion; manual `allMatch` flag → `.every()`.
- **`cadence.test.ts`** (3): loop over a *provably deterministic* 9-date sequence → hardcode `toEqual([...])`; manual day-overflow guard → `expect(...).toBeLessThanOrEqual(...)`.
- **`node-csv-parser.test.ts`** (2): arithmetic guard → `expect(...).toBe(...)`; compound `||` guard → split narrowing from the real assertion.
- **`canonicalize.test.ts`** (1 + bonus bug): 4-way `if/else if` → lookup table indexed by the generated `field` discriminant. **Bonus fix found while verifying this**: the `'direction'` branch currently sets `description: withUs` instead of `direction: withUs` — a copy-paste bug that means the `direction` field is never actually tampered/tested. Fix alongside the refactor.
- **`yaml-config-writer.test.ts`** (2): POSIX-only assertion buried in a bigger test → extract to its own `it.skipIf(...)` test, per this repo's own `sqlite-transaction-repo.test.ts:194,212` convention.
- **`status-command.test.ts`** (1): fixed 4-element date fixture loop → `it.each`.
- **`domain-event.test.ts`** (1 of 3 — the other 2 deferred): static 7-pattern loop against one resolved file → `it.each`.
- **`date-arithmetic.test.ts`** (2): manual adjacent-pair sortedness loop → `.every()`, matching the file's own sibling-test idiom.
- **`read-bpce-csv.test.ts`** (1): root/non-root branching assertions → split into two `it.skipIf`/`it.runIf`-gated tests.
- **`status-formatter-json.test.ts`** (2): dead regex guards that would silently no-op if formatted prose changes → drop the guard, assert unconditionally.
- **`sqlite-hash-repository.test.ts`** (1): per-hash loop → `expect(result.value).toEqual(new Set(knownHashes))`.
- **`result.test.ts`** (1): dead `if/else` (generator guarantees the `if` branch is unreachable) → delete, keep the one real assertion.
- **`config-schema-recurring.test.ts`** (1): cadence loop → `it.each(['monthly','quarterly','annual'])`.

### 3. Deferred — 15 hits, filed as a follow-up issue, not fixed here

Structural refactors needing more than a mechanical one-liner: `safe-transfer-calculator.test.ts` (Property #1's Money-`.equals()` per-item loop; Property #6's `if/else` needing an `fc.pre()`-filtered property split), `settlement-variance-service.test.ts` (Invariant 5's intrinsic per-presence sign-formula chain — real branching that's part of the model, not incidental complexity), `sqlite-transaction-repo.test.ts:372` (assertion conflated with resource cleanup), `yaml-config-writer.test.ts:223` (vacuous-pass risk needs a type-narrowing step), `status-command.test.ts:455` + `domain-event.test.ts:113,115` (dynamic file-discovery vs. `it.each` needs the file list resolved outside the `it()` body).

### 4. Acknowledged — 13 hits, no action

Genuinely unavoidable (Money `Result`-monad accumulation folds, fast-check-generated variable-length array iteration that IS the invariant, one legitimate one-off determinism check). Left as `warn` noise per rule design intent — not eslint-disabled, since a future contributor should still see them as a prompt to reconsider, just not act on today.

## Gherkin / AC scenarios

No `.feature` files — dev-tooling rule refinement + test restructuring, no CLI/product surface change. Pseudo-Gherkin, fenced ` ```text ` per the `story-maint-21`/`-24` precedent:

```text
Feature: conditional-test-logic rule refinement + genuine-smell fixes

  Scenario: rule refinement excludes exactly the three verified-safe patterns
    Given the fc-property-precondition, Result-narrowing-guard, and cleanup-guard shapes
    When RuleTester valid cases exercise each shape, plus the three rejected lookalikes
      (compound-condition guard, nested-in-loop guard, guard-with-side-effect)
    Then the three shapes report nothing, the three lookalikes still report

  Scenario: the real suite's hit count drops as predicted
    Given 155 conditional-test-logic hits before this story
    When the rule refinement lands
    Then `npm run lint` shows the hit count drop by the excluded-pattern count (verify exact number, not assumed)

  Scenario: every refactor-now fix preserves the original assertion
    Given the 55 genuine-smell hits and their planned mechanical fixes
    When each fix lands
    Then `npm test` stays green with no test deleted, added, or behaviorally changed —
      only control-flow restructured into expect()/.every()/it.each()

  Scenario: the canonicalize.test.ts bug fix actually exercises the direction field
    Given the current 'direction' tampering branch sets description instead of direction
    When the lookup-table refactor lands
    Then the direction field is genuinely tampered and the existing assertion covers it
```

**Verification mechanism per scenario:** 1–2 via `RuleTester` specs + a full-suite `npm run lint` count comparison (before/after, quoted in the relevant commit body); 3–4 via `npm test` full-suite pass/fail count staying identical (847 passing before and after — restructuring, not adding/removing tests) plus a manual read-through confirming each diff is assertion-preserving.

## Slice plan — R13 envelope (target 6–10 slices)

1. `test(lint): conditional-test-logic exclusion patterns — failing` / `feat(lint): fc-precondition + Result-narrowing + cleanup-guard exclusions — minimal green`
2–N. One slice per file-group of refactor-now fixes (grouped by module: transfer/recurring/ingest/ledger/settlement Core tests; infra/integration tests; CLI tests) — target ~4-5 slices covering all 15 files, each a plain `refactor(tests):` commit (no test/feat pair needed — restructuring existing green tests, not adding new ones) verified via `npm test` staying green.
Final. `chore(retro): story-maint-25 retrospective`, plus filing the deferred-items follow-up issue before the retro commit.

No new CLAUDE.md § 8 row expected — this refines R29's existing mechanism (rule + review split), it doesn't introduce a new class of control. Confirm at retro time.

## Suggestion log

Phase 2 review for this story is **Reduced lane** (dev-tooling + test-file restructuring, no Core/domain concept touched): `sibling-overlap` only, `plan-reviewer` dropped (R26). Findings below.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P2 (sibling-overlap) | PR #210 (`story-4.3b`, Settlement Variance CLI)'s own plan commits to a *future* slice (not yet pushed) editing `tests/unit/core/settlement/settlement-variance-service.test.ts` (widening the Invariant-10 determinism property, per issue #208 item 2) — the same file this story's slice 2 mechanically fixes (Invariant-2's `for...of`+early-return loop → `.every()`). Different invariants/regions of the same file; no current diff overlap (PR #210's pushed diff today is only `docs/metrics/loop.csv` + its own plan doc), but a same-file coordination point. | acknowledge | Non-blocking today. This story's fix to `settlement-variance-service.test.ts` is scoped tightly to Invariant-2's existing loop (lines 327/333) — kept minimal so whichever story merges second has a clean, small-surface rebase against the other's Invariant-10 hunk. |
| P4 (code-reviewer) | This suggestion-log row and § 2's file-list entry both originally misattributed the fix target as "Invariant-3" when the actual diff fixes Invariant 2 (styled after Invariant 3's existing `.every()` idiom). | fix-now | Corrected both references above. |
| P2 (sibling-overlap) | Issue #206 (this story's own tracking issue) — confirmed as the originating issue, not a competing overlap. | acknowledge | Close #206 on merge. |

## Merge checklist

- [x] `lint` / `build` / `test` green locally (0 lint errors/96 warnings; build green; 928 passing + 1 correctly-skipped) — awaiting CI confirmation
- [ ] PR out of draft
- [x] Retrospective file committed at `docs/retrospectives/story-maint-25.md`
- [x] All suggestion-log items resolved (no blank `Resolution` cells)
- [x] Phase-4 review (`code-reviewer` + `sibling-overlap`) findings classified fix-now / defer-issue / acknowledge
- [x] Follow-up issue filed for the 15 deferred items ([#211](https://github.com/xavierbriand/accounting/issues/211))
- [ ] User approval
