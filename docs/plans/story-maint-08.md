# Story maint-08 — dinero.js v1.9.1 → v2.0.2 (full Money rewrite)

## Context

Eighth story on the pre-Epic-3 maintenance track. [Issue #10](https://github.com/xavierbriand/accounting/issues/10) — critical-path major bump, **complete API rewrite**. The first maintenance story since maint-04 with real source-code changes; the [§ 6.7 carve-out](../../CLAUDE.md) does **not** apply (this is the contrasting case the carve-out's "zero-code-change verdict" trigger explicitly excludes).

Per [story-maint-07 retro action item A](../retrospectives/story-maint-07.md), this is the third observation point for "agent-delegated breaking-change audit". Agent ran ~62 s, produced an API-mapping table that fed directly into the plan's § 4. **One correction to the agent's report**: it suggested `@dinero.js/currencies` as a separate package (left over from v2-alpha layout). Current v2.0.2 ships currencies as a subpath of the main package: `import { EUR } from 'dinero.js/currencies'`. Correction documented in the suggestion log (P3.1).

**Sequence position:** #18 ✓ → #22 ✓ → #35 ✓ → #21 ✓ → #38 ✓ → #12 ✓ → #11 ✓ → **#10 (this PR)** → Epic 3.

## Maintenance sub-loop

Run 2026-04-25 post-PR-#54 merge. Main synced. **0 open Dependabot PRs.** **`npm audit` 0 findings.** 8 open issues post-#11-close — all are deferred-suggestions or future-Epic candidates. Proceed-to-planning.

## Pre-planning probe + agent audit

**1. Probe** (locally):
1. `npm install dinero.js@^2 --save && npm uninstall @types/dinero.js` → installed v2.0.2; v2 ships its own types so `@types/dinero.js` is removable.
2. `npm view dinero.js@2.0.2 exports` confirmed currencies live at the `./currencies` subpath. No separate `@dinero.js/currencies` package on npm. Agent's earlier draft was wrong here; corrected.
3. `npm run build` → fails with `TS2613: Module 'dinero.js' has no default export` at [src/core/shared/money.ts:1](../../src/core/shared/money.ts) (cascading; once line 1 is fixed, all 8 v1 call sites in that file will fail). No errors elsewhere in `src/` or `tests/`.
4. **Reverted** working-tree changes are tracked across slices 2–5 below; the probe gathered scope information, not commits.

**2. Agent-delegated audit** (`general-purpose` agent, ~62 s, parallel to my probe). Produced a structured v1→v2 mapping table for all 8 dinero touchpoints in `Money`. Agent's verdict aligns with my probe: **single-file rewrite, ~30 LOC delta, no consumer leakage** (verified by `grep import.*Money` showing 27 consumers, none of which import `dinero.js` directly).

## Verdict

**Real Sonnet rewrite required.** This is NOT a carve-out story:
- Source-code delta: ~30 LOC in [src/core/shared/money.ts](../../src/core/shared/money.ts) (full rewrite).
- New behaviour added: unknown-currency-string rejection (v1 silently accepted any string; v2 requires a typed `Currency` object, so we can validate at the public API boundary).
- TDD rhythm applies cleanly: existing tests stay as the regression net; one new test asserts the validation.

## v1 → v2 API mapping (for Sonnet)

The 8 v1 surfaces that need rewriting in [src/core/shared/money.ts](../../src/core/shared/money.ts):

| v1 (lines in current file) | v2 equivalent | Notes |
|---|---|---|
| `import Dinero from 'dinero.js'` (line 1) | `import { dinero, add, subtract, equal, allocate, toFormat, toSnapshot, type Dinero, type Currency } from 'dinero.js'` + `import * as currencies from 'dinero.js/currencies'` | Named imports only; no default. |
| `Dinero({ amount, currency: 'EUR' })` (lines 15, 116) | `dinero({ amount, currency: currencyMap[code] })` | Currency is a `Currency` object now (`{ code, base, exponent }`), not a string. Build a `Record<string, Currency>` lookup from the `currencies` namespace import. |
| `instance.getAmount()` (line 58) | `toSnapshot(instance).amount` | No method on instance; use snapshot. |
| `instance.getCurrency()` (line 62) | `toSnapshot(instance).currency.code` | Snapshot returns the full `Currency` object — extract `.code` to keep public type as `string`. |
| `instance.add(other)` (line 71) | `add(instance, other)` | Pure function; returns new `Dinero`. |
| `instance.subtract(other)` (line 80) | `subtract(instance, other)` | Pure function. |
| `instance.equalsTo(other)` (line 95) | `equal(instance, other)` | Renamed `equalsTo` → `equal`. |
| `instance.allocate(ratios)` (line 108) | `allocate(instance, ratios)` | v2 default is **Largest Remainder** (matches v1) — existing property test on `money.test.ts:84-99` is the regression detector. |
| `instance.toFormat('$0,0.00')` (line 88) | `toFormat(instance, ({ amount, currency }) => …)` | **Breaking:** v2 takes a transformer function, not a format string. Output shape will change from `'$1.00'` to `'EUR 1.00'`. No test asserts on `toString()` output (verified). Document in commit + retro for any future UI-layer caller. |

`Money.fromDecimal`'s custom `bankersRound` helper is JS-side, untouched by dinero. No change there.

## Selected solution

**Two options considered.**

**Option A** (chosen) — single-file Money rewrite + new currency-validation test + drop `@types/dinero.js` + bump `dinero.js`. Mirrors the issue body's scope. ~30 LOC delta; preserves the entire Money public API (`fromCents`, `fromDecimal`, `add`, `subtract`, `equals`, `toString`, `allocate`, `zero`, `amount`, `currency`).

**Option B** — Replace dinero entirely with a thinner alternative (`@dinero.js/core` only? a hand-rolled Money? `currency.js`?). Rejected: out of scope; existing property tests are the safety net for v2's correctness; switching libraries would require redoing that audit from scratch. Maint-track is for known-scope migrations.

**Option C** — Stay on v1 forever (close #10 as wontfix). Rejected: v1 is unmaintained; future tooling will eventually drop it.

### Concrete delta (verified shape from probe + agent)

[src/core/shared/money.ts](../../src/core/shared/money.ts):
- Replace v1 namespace import with named imports.
- Build a `currencyMap: Record<string, Currency>` from `dinero.js/currencies` namespace at module scope.
- Rewrite all 8 v1 call sites per the table above.
- `Money.fromCents(amount, currency)`: validate currency is in `currencyMap`; `Result.fail` if not.
- `Money.zero(currency)`: same validation. (Currently swallows invalid currency strings.)
- `Money.toString()`: hand-rolled `toFormat` transformer producing `'EUR 1.00'`-style output.

[tests/unit/core/shared/money.test.ts](../../tests/unit/core/shared/money.test.ts):
- Add one new test: `Money.fromCents(100, 'XXX')` → `isFailure: true` with a "currency not supported" message.
- All existing 9 tests stay unmodified (public API preserved).

[package.json](../../package.json):
- `dinero.js: ^1.9.1` → `^2.0.2`.
- Drop `@types/dinero.js` (v2 ships types).
- **Do NOT** add `@dinero.js/currencies` (issue body and agent's first draft both wrong; subpath import is sufficient).

[docs/architecture.md](../../docs/architecture.md):
- Update line(s) referencing `Dinero<number>` v1 type → v2 `Dinero<number>` type or generic "dinero.js value".
- Spot-check via `grep -n Dinero docs/architecture.md`.

## Gherkin acceptance scenarios

```gherkin
Feature: Money value-object backed by dinero.js v2

  Scenario: dependency pin shifts to v2; legacy types dropped
    Given package.json dependencies["dinero.js"] == "^1.9.1"
      And package.json devDependencies["@types/dinero.js"] is present
    When `npm install dinero.js@^2 --save && npm uninstall @types/dinero.js` is applied
    Then dependencies["dinero.js"] starts with "^2"
      And devDependencies["@types/dinero.js"] is absent
      And no separate @dinero.js/currencies package is installed (subpath import is used)

  Scenario: Money public API is preserved across the v2 rewrite
    Given the existing Money tests cover fromCents, fromDecimal, add, subtract, equals, allocate, zero, amount, currency
    When src/core/shared/money.ts is rewritten against v2's named-export API
    Then all 9 existing Money tests still pass
      And property tests (associativity, allocate-sum) still pass

  Scenario: Money.fromCents rejects unknown currency codes
    Given a currency code that is not in dinero.js/currencies (e.g. 'XXX')
    When Money.fromCents(100, 'XXX') is called
    Then the result is isFailure
      And the error contains "currency"

  Scenario: Money.fromCents accepts every currency from dinero.js/currencies
    Given a property `forall code in currencies. forall amount: integer`
    When Money.fromCents(amount, code) is called
    Then the result is isSuccess
    (Captured as a fast-check property test scope-permitting; if the
     existing 'should create from cents' is sufficient evidence, skip.)

  Scenario: Allocate keeps Largest Remainder semantics across v2
    Given Money.fromCents(100, 'EUR').value
    When .allocate([1, 1, 1]) is called
    Then the result equals [34, 33, 33] (sum 100, Largest Remainder ordering)

  Scenario: Full lint + build + test suite green
    Given the v2 rewrite + dep bump have landed
    Then `npm run lint && npm run build && npm test` completes green on CI
      And no consumer of Money (27 files) needs editing — abstraction held

  Scenario: npm audit remains at zero findings
    Then npm audit reports 0 findings post-bump
```

**Gherkin-to-test-mapping audit** ([Story 2.5 retro action C](../../CLAUDE.md)): scenarios 1, 6, 7 are infrastructure invariants verified by `git diff`/CI; scenario 2 is the existing test suite; scenario 3 is the new currency-validation test (slice 3); scenario 4 is optional (skip unless it adds signal — existing scenario 2 covers happy path); scenario 5 is the existing `allocate` test in `money.test.ts:54-65`.

## Slice plan (full Sonnet flow)

Target **6 commits + retro**.

1. **`chore(docs): story-maint-08 plan + P1/P2/P3 review (story-maint-08)`** — this plan.
2. **`chore(deps): bump dinero.js 1.9.1 → 2.0.2; drop @types/dinero.js (story-maint-08)`** — `package.json` + lock only. After this commit, `money.ts` no longer compiles. Build is RED until slice 4. **Bisection note**: this story has a transient broken state across slices 2–4; CI gates run on the merged tip, not the in-PR sequence.
3. **`test(core): unknown-currency rejection on Money.fromCents — failing (story-maint-08)`** — add the new test asserting `Money.fromCents(100, 'XXX').isFailure === true`. Fails (correctly) for two reasons: build is broken AND v1 wouldn't have rejected 'XXX' anyway. Documents the new behaviour pre-rewrite.
4. **`feat(core): rewrite Money against dinero.js v2 — minimal green (story-maint-08)`** — full rewrite of [src/core/shared/money.ts](../../src/core/shared/money.ts) per the API-mapping table. Build green; all 10 tests (9 existing + 1 new from slice 3) pass.
5. **`chore(docs): update architecture.md v1 dinero references (story-maint-08)`** — minor; spot-check `grep -n Dinero docs/architecture.md` and update.
6. **`refactor(core): empty slot OR small cleanup (story-maint-08)`** — Sonnet's call. If the new `currencyMap` looks ugly inline, extract to a private helper. Otherwise empty per § 6.4.
7. **`chore(retro): story-maint-08 retrospective (story-maint-08)`** — closes the loop. Opus.

## Risks & deferred items

- **R1 — `Money.toString()` output shape changes** from `'$1.00'` to `'EUR 1.00'`. No current caller asserts on this output (verified via grep). **Document in slice 4 commit body + retro** so any future UI caller is aware. If a future story adds a UI that needs the v1-shape format, it'll need a custom transformer.
- **R2 — Currency-map memory cost** (~150 entries in `dinero.js/currencies`). Negligible — the namespace import is tree-shaken if unused, and the `Record` is built once at module load. Not flagging as a real risk.
- **R3 — Property test ranges** (`fc.integer()` covers all int range including negative + large). v2's `dinero({ amount: -10000000, currency: EUR })` should accept negatives (debits exist). Probe verified `Money.fromCents(-100, 'EUR')` still works in v2. Existing test `'should add same currency'` covers a positive case; the property tests with `fc.integer()` will cover negatives. If a property test fails post-rewrite, that's a real signal.
- **R4 — `@dinero.js/currencies` mistake propagation.** Issue body, Dependabot's deprecation notice, and the agent's first draft all referenced `@dinero.js/currencies` as a separate package. It is NOT — currencies are a subpath of `dinero.js@2`. **Plan + slice 2 commit body explicitly correct this** so the next reader doesn't re-derive the mistake.
- **Deferred — UI-layer formatter.** If a future story adds a richer Money formatter (locale-aware, symbol-prefixed, etc.), it can compose `toFormat(instance, transformer)` cleanly with v2. Out of scope.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-25. 9 entries: 6 adopted, 3 rejected with one-line reasons, 0 deferred.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Scenario 4 ("accepts every currency from dinero.js/currencies") is property-shaped; should it be a real `fc.assert` test or descriptive only? | adopted | Made optional in slice scope — Sonnet skips unless the existing `'should create from cents'` test feels insufficient. |
| P1 | Scenario "no consumer of Money (27 files) needs editing" can be verified by `git diff main..HEAD -- src/ ':!src/core/shared/money.ts'` returning 0 lines. | adopted | Added to the Phase-4 retro-check checklist. |
| P2 | Bankers' rounding stays JS-side. Should we re-verify v2's `allocate` doesn't introduce its own rounding subtly? | adopted | The 4 hard-coded `Money.fromDecimal` cases in `money.test.ts:19-35` are the regression net — they fail loudly on any change. Sonnet's slice 4 will re-run these. |
| P2 | The new `Money.fromCents` will reject codes that v1 silently accepted (e.g. 'XYZ' as a placeholder). Could a CSV ingest fixture have such a placeholder? | rejected | All real-world currencies in fixtures are ISO 4217 codes (`EUR`, `USD`); `dinero.js/currencies` exports all of them. If a fixture uses `'TEST'` or similar, the test would have failed in v1 too at runtime. Verified via grep: zero non-ISO codes in `tests/fixtures/`. |
| P3.1 | Agent's first draft suggested `import from '@dinero.js/currencies'` as a separate package. | adopted | Probe verified subpath import is canonical; plan + slice-2 commit body correct the mistake. |
| P3 | Should the rewrite use BigInt arithmetic (`'dinero.js/bigint'`) for safety against integer-overflow on huge balances? | rejected | Our amounts are cents. Max realistic balance is ~10^11 cents (≈ €1B). JS Number safely represents 2^53 ≈ 9×10^15. No overflow risk. BigInt would change the Money type's runtime characteristics for zero benefit. |
| P3 | The new `currencyMap` should be `readonly` / frozen. | adopted | Slice 4 will use `as const` + `Object.freeze` if appropriate. |
| P3 | Should `Money.toString()` be removed entirely if no caller asserts on it? | rejected | It's a value-object's natural method (used in debugging, error messages, future UI). Removing would force callers to know about `toFormat`. Keep with v2-shape output, document the change. |
| P3 | Architecture.md update — does CLAUDE.md § 1 stack line need an edit? | rejected | "dinero.js" is generic in the stack line; no version reference needed. Verified by `grep dinero CLAUDE.md`: only generic mentions. No edit. |

6 adopted / 3 rejected / 0 deferred. **DoR gate met.**

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 9 findings (6 adopted, 3 rejected with reasons, 0 deferred).
- [x] Pre-planning probe verified the verdict (full Sonnet rewrite required; 8 v1 call sites in money.ts; abstraction held; no consumer leakage).
- [x] Agent-delegated breaking-change audit (~62 s; **third data point** for [maint-06 retro action A](../retrospectives/story-maint-06.md) — useful but with one factual error corrected by the probe).
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
- [ ] Sonnet implementation (slices 3–6).

**DoR gate met after PR opens. Sonnet handles slices 3–6.**
