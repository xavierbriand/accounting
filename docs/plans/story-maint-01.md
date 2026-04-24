# Story maint-01 — `tsconfig.test.json` so `tsc` type-checks test files

## Context

`tsconfig.json` at the repo root is configured with `rootDir: "./src"` and `include: ["src/**/*"]` ([tsconfig.json:5,17](tsconfig.json)). `vitest` resolves the `@core/*` alias at test runtime via its own config ([vitest.config.ts:6–8](vitest.config.ts)), so test files compile and execute — but **`tsc` never type-checks `tests/**/*`**. A type bug in a test file is only observable when the test actually runs, not at `npm run build`. The repo-level convention is `strict: true` on the whole codebase; silently excluding tests from that guarantee undermines the convention.

Captured as follow-up **action D** in Story 1.3's retrospective ([docs/retrospectives/story-1.3.md](docs/retrospectives/story-1.3.md)) and tracked as **issue [#18](https://github.com/xavierbriand/accounting/issues/18)**. Surfaced in the 2026-04-24 maintenance sub-loop as the first pre-Epic-3 item in the agreed sequence (#18 → #22 → #35 → #21 → #38 → #12 → #11 → Epic 3).

**Problem.** A gate-in-name-only — `npm run build` claims to type-check "the codebase" but silently excludes half of it. Test-file type drift accumulates invisibly until a runtime test failure forces someone to read the error carefully.

**Outcome.** A new `tsconfig.test.json` that extends the base config and includes `tests/**/*`; a `tsc -p tsconfig.test.json` invocation chained into `npm run build` (so DoD § 7 #1 gate `npm run build` automatically covers tests); a new `typecheck:tests` npm script for dev convenience; and the **21 latent type errors across 6 test files** that the new gate surfaces — fixed in the same PR.

**Maintenance sub-loop (CLAUDE.md § 6.7).** Already run on 2026-04-24: closed [#29](https://github.com/xavierbriand/accounting/issues/29) (satisfied by Story 2.5), labelled [#35](https://github.com/xavierbriand/accounting/issues/35) `bug`+`ux`, filed [#38](https://github.com/xavierbriand/accounting/issues/38) (inquirer migration) and [#39](https://github.com/xavierbriand/accounting/issues/39) (flaky property test, merged as PR #40). `npm audit`: 0 high/critical (4 low, 4 moderate — all dev-chain, no action). 0 open Dependabot PRs. **Proceed-to-planning.**

**Pre-planning probe findings (run before writing this doc).** I seeded a temporary `tsconfig.probe.json` identical to the final `tsconfig.test.json` and ran `npx tsc --noEmit -p /tmp/tsconfig.probe.json`. **21 errors, 6 files, 4 categories:**

| TS code | Count | Category | Nature |
| --- | --- | --- | --- |
| TS2322 | 13 | Mock-shape drift — `ParseOutcome.items[i].amount` and `IdempotencyOutcome.duplicates[i].amount` mocked as `{ amount: number; currency: string }` instead of `Money` (which has `_dinero`, `add`, `subtract`, `equals`, `allocate`). Passes at runtime because vitest mocks are structurally loose and the assertions never touch the methods. | Drift |
| TS2352 | 4 | `PassThrough` stream cast to `Writable & { captured: string }` without the `unknown` double-cast that strict TS requires. | Cosmetic strict-mode nit |
| TS2554 | 2 | **Real bug** — `it(options, name, fn)` calls in `ingest-command-flags.test.ts:109,138` pass `{ timeout: 500 }` **twice** (as first arg AND as trailing fourth arg). Runtime silently ignores the extra. | Genuine test-code defect |
| TS2345 | 2 | `vi.fn(() => Result.fail('db error'))` infers `Result<never, string>` and fails assignability to the `HashRepository.listKnownHashes` signature's `Result<readonly string[], string>`. | Drift |

**Error distribution across files:**

| File | Errors |
| --- | --- |
| [tests/unit/cli/commands/ingest-command.test.ts](tests/unit/cli/commands/ingest-command.test.ts) | 7 |
| [tests/unit/cli/commands/ingest-command-flags.test.ts](tests/unit/cli/commands/ingest-command-flags.test.ts) | 8 |
| [tests/integration/cli/ingest-commit.test.ts](tests/integration/cli/ingest-commit.test.ts) | 3 |
| [tests/perf/ingest-throughput.test.ts](tests/perf/ingest-throughput.test.ts) | 1 |
| [tests/unit/core/ingest/idempotency-service.test.ts](tests/unit/core/ingest/idempotency-service.test.ts) | 1 |

The duplicate-`{ timeout: 500 }` bug alone justifies the gate — impossible to catch without strict type-checking.

## Story (verbatim from [issue #18](https://github.com/xavierbriand/accounting/issues/18))

> Add `tsconfig.test.json`:
>
> ```json
> {
>   "extends": "./tsconfig.json",
>   "compilerOptions": {
>     "rootDir": "."
>   },
>   "include": ["src/**/*", "tests/**/*"]
> }
> ```
>
> Wire it into `npm run build` either as an additional `tsc -p tsconfig.test.json --noEmit` step, or as a separate `typecheck:tests` script invoked from CI.

FR coverage: none (tooling). Walks the **engineering-standards** line "no `any`, `strict: true`" ([docs/engineering-standards.md](docs/engineering-standards.md)) by making strict-mode enforcement universal. Closes #18.

## Selected solution

Four approaches considered, one chosen.

### Divergent options

**Option A — separate `tsconfig.test.json` + chained into `npm run build` + dev script.** New config file with `rootDir: "."` + `noEmit: true`; `"build": "tsc && tsc -p tsconfig.test.json && cp -R ..."`; new `"typecheck:tests": "tsc -p tsconfig.test.json"` script. Pro: smallest diff; keeps the DoD § 7 #1 gate `npm run build` as the single invariant (CLAUDE.md unchanged). Con: two `tsc` invocations per build (~2× tsc time on a small codebase — measured negligible).

**Option B — separate `tsconfig.test.json` + separate CI step (NOT chained into build).** Config identical; `npm run build` stays unchanged; `.github/workflows/ci.yml` gets a new `Run Test Typecheck` step. Con: **breaks the "`npm run build` is the gate" invariant** — DoD § 7 #1 would need to become `lint && build && typecheck:tests && test`. Every PR body, every retro, every CLAUDE.md § 7 entry would need rephrasing. Rejected as too much docs churn for a tooling fix.

**Option C — project references (`tsconfig.src.json` + `tsconfig.test.json` + root refs).** Modern TS idiom with `tsc --build` and incremental caching. Con: overkill for a <300-file repo; IDE works fine with the current flat config; the `@core/*` path-alias story gets fiddlier under references. Rejected as speculative generality.

**Option D — fold `tests/**/*` into the main `tsconfig.json` include.** Cannot: `rootDir: "./src"` + `include: ["tests/**/*"]` → tsc emits a `rootDir` error (files outside rootDir). Relaxing rootDir to `"."` would write test-file `.js` emits to `dist/` (unwanted). Would require `noEmit` which kills the production build. Rejected as incompatible with current `build` contract.

### Convergence rationale

**Option A.** Minimal surface area, preserves DoD invariant, `tsc`-twice overhead is measurable but negligible on this codebase (~600ms total on my machine for both passes). The `typecheck:tests` script is exposed for dev convenience (run just the test-typecheck without the emit) but the authoritative gate is still `npm run build`.

### Chosen implementation

#### File 1: new [tsconfig.test.json](tsconfig.test.json)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

Notes:
- `extends: "./tsconfig.json"` inherits `strict`, `target`, `module`, `moduleResolution`, `esModuleInterop`, `skipLibCheck`, `baseUrl`, and the `@core/*` path alias. No drift possible — one source of truth for compiler options.
- `rootDir: "."` widens from `./src` so tsc accepts files under `./tests`. Paths in `paths` remain relative to `baseUrl: "./src"` (inherited), so `@core/*` → `src/core/*` still resolves correctly from tests.
- `noEmit: true` — this config is only for type-checking; the emit path is owned by the base config invoked by `npm run build`'s first `tsc` call.

#### File 2: [package.json](package.json) scripts

```json
"build": "tsc && tsc -p tsconfig.test.json && cp -R src/infra/db/migrations dist/infra/db/",
"typecheck:tests": "tsc -p tsconfig.test.json"
```

- Chained as the **second** tsc (after the emitting tsc, before the migrations copy). Rationale: main-config tsc errors surface first in the CLI output (the most common dev failure mode); if the main build is green but tests have type errors, the second tsc catches it before `cp` runs. If even the cp had already run, it's fine — DoD demands `npm run build` exits 0; any non-zero short-circuits the `&&` chain.
- `typecheck:tests` is a standalone dev-convenience script — no CI line needed, since CI's existing `Run Build` step now transitively type-checks tests.

#### File 3: [.github/workflows/ci.yml](.github/workflows/ci.yml)

**No change required.** CI runs `npm run build` ([.github/workflows/ci.yml:28](.github/workflows/ci.yml)), which now includes the test-typecheck via the chained `&&` in the `build` script.

#### Test-file fixes (21 errors across 6 files)

Enumerated above in the "Pre-planning probe findings" table. Each error category maps to a slice — see slice plan below. The fixes are cosmetic (casts, mock shapes) or narrow (real bug fixes). No test *behaviour* changes — the existing assertions continue to pass after the type fixes, because vitest already ran the tests correctly with loose types.

## Gherkin acceptance scenarios

Feature: Test files type-checked by `npm run build`
  As a developer
  I want `tsc` to type-check test files as part of `npm run build`
  So that type drift in tests is caught at the DoD gate, not at test-execution time.

  Scenario: Type error in a test file fails `npm run build`
    Given a test file `tests/unit/probe.test.ts` that contains a deliberate type error (e.g. `const n: string = 42;`)
    When I run `npm run build`
    Then the exit code is non-zero
    And stderr contains the type-error code (e.g. `TS2322`)
    And `dist/` is not updated past the point of failure

  Scenario: Clean tests pass `npm run build`
    Given every test file is type-correct
    When I run `npm run build`
    Then the exit code is zero
    And `dist/` contains the emitted src/ output
    And `dist/infra/db/migrations/` contains the copied migration files

  Scenario: Developer can run the test-typecheck in isolation
    Given `tsconfig.test.json` exists
    When I run `npm run typecheck:tests`
    Then the exit code reflects `tsc -p tsconfig.test.json` status over `src/ ∪ tests/`
    And nothing is emitted to `dist/` (noEmit: true)

  Scenario: `npm test` runtime behaviour is unchanged
    Given the new `tsconfig.test.json` is in place
    When I run `npm test`
    Then vitest runs exactly as before (resolving `@core/*` via its own config)
    And all 212 existing test assertions pass

  Scenario: CI enforces the gate without workflow changes
    Given the CI pipeline runs `npm run build` (existing `.github/workflows/ci.yml` Run Build step)
    When a PR introduces a test file with a type error
    Then CI fails at the Run Build step
    And the CI log names the offending test file

## Slice plan for Sonnet

Target 6 commits. Slices 2–5 each reduce the post-gate error count; slice 6 activates the gate.

### Slice 1 — Scaffolding: add `tsconfig.test.json`

Commit: `chore(tooling): add tsconfig.test.json (story-maint-01)`

- Create [tsconfig.test.json](tsconfig.test.json) with the body above.
- **Do NOT** modify `package.json` scripts yet — the gate is not live.
- `npm run build` still passes (no chain).
- Running `npx tsc -p tsconfig.test.json` manually shows the **21 known errors** documented in the probe. This is the failing-state baseline.
- Commit body lists the 21 errors grouped by file + TS code so Sonnet's fix slices have a checklist.

This is the `test:` analogue — the "failing state" that the subsequent fix slices drive to green. There's no vitest `test:` commit because the gate isn't a vitest assertion; it's a tsc invocation.

### Slice 2 — Fix `TS2554`: duplicate `{ timeout: 500 }` args on `it()`

Commit: `test(cli): remove duplicate timeout option on it() calls (story-maint-01)`

- Files: [tests/unit/cli/commands/ingest-command-flags.test.ts](tests/unit/cli/commands/ingest-command-flags.test.ts) lines **109, 138**.
- Each `it({ timeout: 500 }, 'name', async () => { ... }, { timeout: 500 })` → drop the trailing `, { timeout: 500 }` (keep the leading options). Vitest's runtime silently ignored the extra arg; strict TS rejects 4 args to a 1–3-arg `it` overload.
- `tsc -p tsconfig.test.json` error count: 21 → 19.
- `npm test` continues green (zero behavioural change).

### Slice 3 — Fix `TS2352`: `PassThrough` → `Writable & { captured: string }` casts

Commit: `test(cli): double-cast PassThrough streams to satisfy strict mode (story-maint-01)`

- Files & lines:
  - [tests/integration/cli/ingest-commit.test.ts:59](tests/integration/cli/ingest-commit.test.ts:59)
  - [tests/perf/ingest-throughput.test.ts:105](tests/perf/ingest-throughput.test.ts:105)
  - [tests/unit/cli/commands/ingest-command-flags.test.ts:73](tests/unit/cli/commands/ingest-command-flags.test.ts:73)
  - [tests/unit/cli/commands/ingest-command.test.ts:59](tests/unit/cli/commands/ingest-command.test.ts:59)
- Each `x as Writable & { captured: string }` → `x as unknown as Writable & { captured: string }`. Strict TS's well-known escape hatch for "I know this cast is safe because the surrounding test-helper attaches `captured` by closure."
- `tsc` error count: 19 → 15.
- `npm test` green.

Refactor opportunity (defer to slice 7): if this pattern appears 4× in 4 files, extract a `makeCapturingStream(): Writable & { captured: string }` helper in `tests/helpers/streams.ts`. Decision: defer to slice 7 refactor slot — the cast fix is already behavioural-neutral; extraction is orthogonal cleanup.

### Slice 4 — Fix `TS2322` + `TS2345`: Money-shape mocks

Commit: `test(cli): mock ParseOutcome/IdempotencyOutcome with real Money values (story-maint-01)`

- Files:
  - [tests/unit/cli/commands/ingest-command.test.ts](tests/unit/cli/commands/ingest-command.test.ts) (6 errors: 99, 155, 193, 227, 303, 361)
  - [tests/unit/cli/commands/ingest-command-flags.test.ts](tests/unit/cli/commands/ingest-command-flags.test.ts) (6 errors: 90, 119, 151, 152, 195, 196)
  - [tests/integration/cli/ingest-commit.test.ts](tests/integration/cli/ingest-commit.test.ts) (2 errors: 177, 275)
- Root cause: mock `csvParser.parse` / `idempotencyService.filterNew` return objects where `amount` is `{ amount: number; currency: string }` — the literal Core `Money` type is a class instance with `_dinero`, `add`, `subtract`, `equals`, `allocate` methods.
- Fix: use real `Money` values in mocks. Two primitives from [src/core/shared/money.ts](src/core/shared/money.ts):
  - `Money.zero('EUR')` → returns `Money` directly, no `Result` unwrap. Use wherever the amount **does not matter** to the assertion (most mock cases).
  - `Money.fromCents(cents, 'EUR').value` → returns `Result<Money>`; unwrap `.value` after an `ok` guard in a test helper, or inline when confidence is high that cents is a positive integer. Use wherever the amount **does matter**.
- No `Money.ofMinorUnits` — that was an early-draft guess; corrected per P1 critical review (see Suggestion Log P1.1).
- Substitute in every affected mock literal. The tests do not assert on `amount` methods, so the shape fix does not change any `expect(...)` call.
- **Escape hatch** (per P3.3): if any specific mock proves fussy to satisfy with a real `Money` instance (e.g. a deeply-frozen fixture), fall back to `as unknown as Money` double-cast with a one-line TODO comment referencing story-maint-01. Acceptable in tests; never in `src/`.
- `tsc` error count: 15 → 1 (TS2345 included in this slice since they're the same `saveBatch` mock family).
- `npm test` green — the test assertions don't touch `Money` methods.

### Slice 5 — Fix `TS2345`: `HashRepository` mock return type

Commit: `test(ingest): narrow HashRepository mock return type (story-maint-01)`

- File: [tests/unit/core/ingest/idempotency-service.test.ts:164](tests/unit/core/ingest/idempotency-service.test.ts:164)
- Current:
  ```ts
  const failingRepo: HashRepository = {
    listKnownHashes: vi.fn(() => Result.fail('db error')),
  };
  ```
  `vi.fn(() => Result.fail('db error'))` infers `Mock<() => Result<never, string>>`; `HashRepository.listKnownHashes` expects `Result<readonly string[], string>`.
- Fix: add an explicit generic on `vi.fn`:
  ```ts
  listKnownHashes: vi.fn<HashRepository['listKnownHashes']>(() => Result.fail('db error')),
  ```
  Or equivalent signature-annotation style.
- `tsc` error count: 1 → 0.
- `npm test` green.

### Slice 6 — Activate the gate: chain into `npm run build` + expose `typecheck:tests`

Commit: `feat(tooling): enforce test type-check in npm run build (story-maint-01)`

- Modify [package.json](package.json):
  - `"build": "tsc && tsc -p tsconfig.test.json && cp -R src/infra/db/migrations dist/infra/db/"`
  - `"typecheck:tests": "tsc -p tsconfig.test.json"`
- Run `npm run lint && npm run build && npm test` locally — all green; `build` now includes the test-typecheck.
- Run `npm run typecheck:tests` — exits 0.
- No CI workflow change (CI already invokes `npm run build`).

### Slice 7 — Refactor slot (optional)

Commit: `refactor(test): extract shared makeEurMoney + captured-stream helpers (story-maint-01)`

- If the Money-mock pattern in slice 4 or the stream-cast pattern in slice 3 repeated ≥3× each, extract to a **new `tests/_helpers/` directory** (leading underscore signals "not a test suite" — differentiates from `tests/unit/`, `tests/integration/`, `tests/perf/`):
  - `tests/_helpers/money.ts` — thin wrappers around `Money.zero(...)` / `Money.fromCents(...).value`.
  - `tests/_helpers/streams.ts` — `export const makeCapturingStream = (): Writable & { captured: string } => { ... }`.
- `tsconfig.test.json`'s `include: ["src/**/*", "tests/**/*"]` picks up `tests/_helpers/**/*` automatically.
- Otherwise, **empty `refactor:` commit** with a one-line justification body, per CLAUDE.md § 6.4 ("No-op: no proliferation threshold hit; inline casts and literals are more local").

## Risks & deferred items

- **Vitest config duplication (out-of-scope for this story; now tracked).** [vitest.config.js](vitest.config.js) and [vitest.config.ts](vitest.config.ts) coexist and are near-identical. Vitest picks one at runtime (probably `.ts` when both exist, depending on its internal resolver). Drift risk if a future change updates only one. Filed as [#42](https://github.com/xavierbriand/accounting/issues/42) during Phase 2 review (deferred).
- **Path-alias resolution across `rootDir` widening.** Verified mentally: `baseUrl: "./src"` is inherited; `paths: { "@core/*": ["core/*"] }` means `@core/shared/result.js` resolves to `src/core/shared/result.js`. This is independent of the extending config's `rootDir`. Cross-checked by the probe run (no `TS2307 Cannot find module '@core/...'` errors among the 21). **Low risk; covered by slice 1's probe baseline.**
- **`npm run build` wall time.** Second `tsc` adds ~300ms on my machine (measured: first tsc ~400ms, second tsc ~300ms, total ~700ms). Acceptable.
- **Tests touching `Money` methods in the future.** If a future test calls `mockParseOutcome.items[0].amount.add(...)`, the slice-4 fix will still work (real Money instance has the method). No behavioural regression surface.
- **Deferred from scope:** #22 (`os.homedir()` fallback, trivial 15-min polish). Next in the pre-Epic-3 sequence; not batched into this PR to keep the change focused on tooling.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-24. All items tagged; no un-tagged rows.

| # | Phase | Suggestion | Disposition | Link / reason |
| - | ----- | ---------- | ----------- | ------------- |
| P1.1 | P1 (Functional) | Plan drafted with `Money.ofMinorUnits(...)` — that API does not exist. Real API is `Money.fromCents(n, currency): Result<Money>` + `Money.zero(currency): Money` for amount-agnostic cases. | adopted | Plan slice 4 rewritten with both primitives + escape hatch. |
| P2.1 | P2 (Product QA) | Slice 4's real-Money mocks could couple test behaviour to `Money`'s methods. | rejected | Mocks are used as data, never invoked — behaviour coupling is zero. Real types in mocks strengthen faithfulness, not weaken. |
| P3.1 | P3 (Engineering) | `tests/helpers/` directory naming under-specified — breaks the `tests/{unit,integration,perf}/` convention. | adopted | Plan slice 7 rewritten to extract to `tests/_helpers/` (underscore prefix signals non-suite). Inline first, extract only at ≥3 callers. |
| P3.2 | P3 (Engineering) | `vitest.config.js` + `vitest.config.ts` coexist (near-duplicates). Drift risk; out of scope here but requires a tracked issue per § 6.1 phase 2 DoR rule. | deferred | Filed [#42](https://github.com/xavierbriand/accounting/issues/42). |
| P3.3 | P3 (Engineering) | Slice 4 could stall on a fussy `Money` mock fixture. | adopted | Plan slice 4 documents an `as unknown as Money` double-cast escape hatch with mandatory inline TODO referencing story-maint-01. |

## DoR checklist

Per CLAUDE.md § 6.1:

- [x] Phase 1 (Plan): intent, divergent options, convergence, Gherkin, slice plan, risks — complete in this document.
- [x] Phase 2 (Critical review): P1 / P2 / P3 passes done; Suggestion Log populated; all items tagged; deferred items link a GitHub issue.
- [x] Draft PR [#41](https://github.com/xavierbriand/accounting/pull/41) open with template sections 1–6 filled; section 7 mirrors this table.

**DoR gate met. Ready for Phase 3 (Sonnet implementation).**
