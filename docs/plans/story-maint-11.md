# Story maint-11 — Code refactor bundle: Result combinators + busy_timeout + YAML-authoritative dbPath + #56

## Context

Second story of the **Refactor epic** (Epic M-A) per the senior-engineer refactor backlog plan. Bundles four code-health improvements that share a common shape (small Core/Infra/CLI changes, no new product features) and pay back during Epic 3:

1. **`Result` combinators** (`map`, `flatMap`, `getOrElse`, `Result.all`) on [src/core/shared/result.ts](src/core/shared/result.ts). Epic 3 (Predictive Transfer Engine) will chain `Money` operations, ledger lookups, and validity-window resolutions; the current `if (r.isFailure) return Result.fail(r.error); const x = r.value;` boilerplate appears 16 times in Core today and would multiply.
2. **SQLite `busy_timeout` pragma** in [src/infra/db/sqlite-client.ts](src/infra/db/sqlite-client.ts). Currently `journal_mode = WAL` and `foreign_keys = ON` are set but `busy_timeout` is not. Snapshot creation + ingest commit (Story 2.5) can plausibly contend; default behaviour is an immediate `SQLITE_BUSY` error rather than the customary 5-second wait. One-line fix.
3. **YAML-authoritative `dbPath` + `--db-path-override` flag** — closes [#65](https://github.com/xavierbriand/accounting/issues/65). Currently `program.ts` ignores `accounting.yaml`'s `dbPath` field entirely and uses the `--db-path` flag's default `'accounting.db'`. Per user direction (refactor backlog plan), config becomes authoritative; the CLI flag is renamed to `--db-path-override` and warns on use (preserving the operator escape hatch for recovery scenarios).
4. **Issue [#56](https://github.com/xavierbriand/accounting/issues/56)** — extract `findDuplicateIndices` helper from four near-identical patterns in [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts).

Bundled because each item is small (≤30 LOC of production code), they share one PR's overhead, and they're scope-independent so a partial revert is per-commit.

**Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning:**
- `git status` clean post-PR-#66 merge; main rebased to `d9e5d54`.
- Open issues: 8 — one bug ([#65](https://github.com/xavierbriand/accounting/issues/65), to be closed by this story), 7 deferred-suggestions; priorities unchanged.
- Dependabot: no open PRs.
- `npm audit`: zero vulnerabilities.
- **Proceed-to-planning.**

## Story

> As a developer working on Epic 3, I want fewer `if (r.isFailure) return Result.fail(...)` boilerplates, predictable SQLite contention behaviour, a single source of truth for `dbPath`, and the duplicate-detection helper that's already triaged — so that Predictive Transfer Engine code reads cleanly, doesn't surface spurious `SQLITE_BUSY` errors during snapshot+commit, doesn't bait users into editing `accounting.yaml` then wondering why nothing changed, and reuses the helper instead of growing a fifth copy.

Closes [#65](https://github.com/xavierbriand/accounting/issues/65), [#56](https://github.com/xavierbriand/accounting/issues/56). Walks [docs/architecture.md](docs/architecture.md) (Core dep-rule, Result discipline), [docs/engineering-standards.md](docs/engineering-standards.md) (no-`any`, function-size, naming), [docs/quality-assurance.md](docs/quality-assurance.md) (no silent data loss). No FR coverage (cleanup + bug fix).

## Selected solution

### 1. `Result` combinators

Current API: `isSuccess`/`isFailure` getters, `value`/`error` getters, `Result.ok()`, `Result.fail()`, `Result.combine()`. Add four combinators + property tests:

- `map<U>(fn: (t: T) => U): Result<U, E>` — transform success value, pass-through failure.
- `flatMap<U>(fn: (t: T) => Result<U, E>): Result<U, E>` — chain Result-returning calls; short-circuit on first failure.
- `getOrElse<U>(fallback: U): T | U` — extract value with default; useful at boundaries.
- `Result.all<T>(rs: readonly Result<T>[]): Result<readonly T[]>` — short-circuit on first failure, accumulate successes. Existing `Result.combine` returns `Result<unknown>` and is functionally a `Result.all` with a discarded value array; deprecate `combine` in favour of `all`. (Internal API only — no external consumers.)

Property tests using `fast-check`:
- `map` identity: `r.map(x => x).equals(r)` for any Result.
- `map` composition: `r.map(g(f(x))) === r.map(f).map(g)`.
- `flatMap` left identity: `Result.ok(x).flatMap(f) === f(x)`.
- `flatMap` right identity: `r.flatMap(Result.ok) === r`.
- `flatMap` short-circuit: `Result.fail(e).flatMap(f) === Result.fail(e)` (f never called).
- `getOrElse`: `Result.ok(x).getOrElse(y) === x`; `Result.fail(e).getOrElse(y) === y`.
- `Result.all` empty: `Result.all([]) === Result.ok([])`.
- `Result.all` first-failure: short-circuits on the first failing element.

**Migrate exemplar call sites.** Pick two heavy ones and rewrite to combinator-style. Leave the rest opportunistic (Epic 3 stories will migrate as they touch the code):
- [src/core/ingest/transaction-builder.ts:74](src/core/ingest/transaction-builder.ts) — currently `if (txResult.isFailure) return Result.fail(txResult.error); return Result.ok({ ... });` becomes `txResult.map((tx) => ({ transaction: tx, category, classification, confidence, idempotencyHash }))`.
- [src/core/ingest/idempotency-service.ts:21,28](src/core/ingest/idempotency-service.ts) — convert one of the two `isFailure` early-returns to `flatMap` to demonstrate the chained shape.

**Internal-API caveat.** `Result.combine`'s return type changes when removed (fewer call sites today; re-check via grep before deletion). Deprecation comment for one slice; removal as a follow-up if the grep finds external usage.

### 2. SQLite `busy_timeout` pragma

[src/infra/db/sqlite-client.ts:11-13](src/infra/db/sqlite-client.ts) currently sets:

```ts
dbInstance.pragma('journal_mode = WAL');
dbInstance.pragma('foreign_keys = ON');
```

Add:

```ts
dbInstance.pragma('busy_timeout = 5000');
```

5000ms is the standard busy-timeout for SQLite-backed CLIs. Addresses snapshot+commit contention (Story 2.5 introduced both). Probe test: `db.prepare('PRAGMA busy_timeout').pluck().get()` returns `5000` immediately after `getDb()` returns.

### 3. YAML-authoritative `dbPath` + `--db-path-override`

**Issue #65's "Fix" section** (with user's `--db-path-override` modification):

1. Load `FileConfigService` in `program.ts` **before** opening the DB; use `config.dbPath`.
2. Rename `--db-path` to `--db-path-override` on both `migrate` and `ingest`. Warn to stderr on use.
3. Replace `configService: ConfigService` dep in `IngestCommandDeps` with `config: AppConfig` (config already loaded upstream by `program.ts`).
4. Remove the silent `= 'accounting.db'` default from `getDb()` to prevent future drift. `getDb` now requires an explicit `dbPath`.

**Concrete code changes:**

- [src/cli/program.ts](src/cli/program.ts):
  - Both `migrate` and `ingest` actions: rename option to `--db-path-override <path>`. No default value.
  - Both actions: load config via `FileConfigService` first; resolve effective `dbPath = options.dbPathOverride ?? config.dbPath`. If `options.dbPathOverride` is set, write `[warning] --db-path-override is set; YAML dbPath ignored. Use only for recovery.` to stderr (once).
  - Pass `config` (not `configService`) into `runIngestCommand`'s deps.
  - `migrate` action: same flag handling.
- [src/cli/commands/ingest-command.ts](src/cli/commands/ingest-command.ts):
  - `IngestCommandDeps`: replace `configService: Pick<ConfigService, 'load'>` with `config: AppConfig`.
  - `loadAndParse` becomes `loadAccountAndParseCsv` (no longer loads config; receives it via deps).
- [src/cli/migrate.ts](src/cli/migrate.ts): unchanged signature (already takes `resolvedDbPath: string`); just called with the new resolution.
- [src/infra/db/sqlite-client.ts](src/infra/db/sqlite-client.ts): `getDb(dbPath: string)` — drop the default. Add path-mismatch guard: if called twice with different paths, throw `Error('getDb: already opened with a different path; call closeDb() first')`.
- [src/infra/db/migration-check.ts](src/infra/db/migration-check.ts): the friendly hint currently reads `hint: run 'accounting migrate --db-path ${dbPath}' first` — update to `hint: run 'accounting migrate' first (or set dbPath in accounting.yaml)`. (No flag in the hint; recovery via override is a power-user path.)

**Tests to update:**
- [tests/unit/cli/commands/ingest-command.test.ts](tests/unit/cli/commands/ingest-command.test.ts) — replace `configService: { load: () => Result.ok(config) }` with `config` directly.
- [tests/unit/cli/commands/ingest-command-flags.test.ts](tests/unit/cli/commands/ingest-command-flags.test.ts) — same shape change.
- [tests/integration/cli/ingest-commit.test.ts](tests/integration/cli/ingest-commit.test.ts) — update `makeRealDeps` factory.
- [tests/perf/ingest-throughput.test.ts](tests/perf/ingest-throughput.test.ts) — same.
- **Subprocess tests** ([uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts), [ingest-end-to-end-wiring.test.ts](tests/integration/cli/ingest-end-to-end-wiring.test.ts), [symlink-dbpath-refuse.test.ts](tests/integration/cli/symlink-dbpath-refuse.test.ts), [tests/features/steps/ingest.steps.ts](tests/features/steps/ingest.steps.ts), [tests/features/steps/commit.steps.ts](tests/features/steps/commit.steps.ts)) — pivot to inline-YAML `dbPath` (avoid the warning on every CI run). Use the `writeStubYaml` helper's `dbPath` override (already supported per [tests/_helpers/inline-config.ts:7](tests/_helpers/inline-config.ts)). The `--db-path` flag in test calls drops; the YAML in `<tmp>/accounting.yaml` carries `dbPath: <tmp>/test.db`.
- **New regression test for #65** — `tests/integration/cli/dbpath-yaml-authoritative.test.ts` (or fold into the BDD suite as `Given accounting.yaml carries dbPath: ./mydb.db, When I run migrate without --db-path-override, Then the migration writes to ./mydb.db`). Subprocess tier; uses inline YAML.
- **New regression test for `--db-path-override` warning** — assert that `accounting migrate --db-path-override <path>` produces the warning string in stderr.
- **New unit test** — `getDb` throws on second call with mismatched path.

### 4. Issue [#56](https://github.com/xavierbriand/accounting/issues/56) — extract `findDuplicateIndices`

Four near-identical patterns in [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts) (lines 30–38, 96–99, 101–104, 148–156). Extract:

```ts
function findDuplicateIndices<T>(items: readonly T[], keyFn: (t: T) => string): number[] {
  const seen = new Map<string, number>();
  const dupes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const key = keyFn(items[i]);
    if (seen.has(key)) {
      dupes.push(i);
    } else {
      seen.set(key, i);
    }
  }
  return dupes;
}
```

(Map-based to avoid `indexOf`'s O(n²); preserves the "first occurrence is canonical, later occurrences are duplicates" semantic that all four call sites express.)

Replace each call site:

```ts
// Before:
names.forEach((n, i) => {
  if (names.indexOf(n) !== i) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...], message: 'duplicate ...' });
  }
});

// After:
for (const i of findDuplicateIndices(items, (it) => it.partner)) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...], message: 'duplicate ...' });
}
```

Tests in [tests/unit/infra/config/config-schema.test.ts](tests/unit/infra/config/config-schema.test.ts) already cover the four duplicate-detection paths; verify they stay green. Add one helper unit test for `findDuplicateIndices` itself (covers the empty array, all-unique, all-duplicate, mixed cases — under 20 LOC).

## Production-code surface

Per the [story-maint-10 retro](docs/retrospectives/story-maint-10.md) rule (CLAUDE.md § 6.1 phase 1), explicit list of production-code changes this story makes:

- **`Result` class** ([src/core/shared/result.ts](src/core/shared/result.ts)) — adds 4 instance methods (`map`, `flatMap`, `getOrElse`) and 1 static method (`Result.all`). `Result.combine` deprecated (kept as alias for one slice; removed in slice 3 if grep confirms no consumers).
- **`IngestCommandDeps`** ([src/cli/commands/ingest-command.ts](src/cli/commands/ingest-command.ts)) — `configService: Pick<ConfigService, 'load'>` replaced with `config: AppConfig`. Breaking change for the deps interface; affects 5 test files and `program.ts`.
- **`getDb` signature** ([src/infra/db/sqlite-client.ts](src/infra/db/sqlite-client.ts)) — drops default value (`dbPath: string` instead of `dbPath: string = 'accounting.db'`). Now throws on re-open with mismatched path.
- **CLI flag rename** ([src/cli/program.ts](src/cli/program.ts)) — `--db-path` → `--db-path-override` on both `migrate` and `ingest`. User-visible breaking change; documented in PR section "Operational note."
- **Migration hint string** ([src/infra/db/migration-check.ts](src/infra/db/migration-check.ts)) — updated to not reference the renamed flag.

## Gherkin acceptance scenarios

Two new scenarios in [tests/features/ingest.feature](tests/features/ingest.feature) (extends the existing 4):

```gherkin
Scenario: dbPath in accounting.yaml is honoured (closes #65)
  Given a fresh tmp dir
  And an accounting.yaml at tmp dir with dbPath: "./ledger.db"
  When I run `accounting migrate` with cwd=<tmp> and no --db-path-override
  Then the migration creates the file at <tmp>/ledger.db
  And no file exists at <tmp>/accounting.db
  # fails if: program.ts uses the hardcoded 'accounting.db' default instead of
  # config.dbPath, leaving ledger.db non-existent and accounting.db populated.

Scenario: --db-path-override warns and overrides YAML dbPath
  Given a fresh tmp dir
  And an accounting.yaml at tmp dir with dbPath: "./ledger.db"
  When I run `accounting migrate --db-path-override <tmp>/recovery.db` with cwd=<tmp>
  Then the migration creates the file at <tmp>/recovery.db
  And no file exists at <tmp>/ledger.db
  And stderr contains "[warning]"
  And stderr contains "--db-path-override is set"
  # fails if: --db-path-override is silently honoured (no warn), or the rename
  # didn't propagate (CLI parses old --db-path), or YAML dbPath wins over the override.
```

Both scenarios run subprocess via `spawnCli` against the dist binary — composition-root subprocess test rule (CLAUDE.md § 6.1 phase 1).

## Slice plan for Sonnet

Target **9 commits + retrospective**. At the upper end of the 6–10 band; story scope justifies the breadth.

1. **`test(core): Result combinators property tests — failing (story-maint-11)`**
   - Add `tests/unit/core/shared/result.test.ts` (or extend if exists) with `fast-check` properties for `map`, `flatMap`, `getOrElse`, `Result.all`. All fail (combinators don't exist yet).

2. **`feat(core): Result.map / flatMap / getOrElse / all combinators — minimal green (story-maint-11)`**
   - Implement the four combinators on the `Result` class.
   - `Result.combine` kept untouched in this slice (deprecation comment only).
   - All property tests turn green.

3. **`refactor(core): migrate exemplar call sites + remove Result.combine (story-maint-11)`**
   - Migrate `transaction-builder.ts:74` to `txResult.map(...)`.
   - Migrate one branch in `idempotency-service.ts` to `flatMap` (illustrative; second branch stays as-is to keep the diff small).
   - Grep-verify no consumers of `Result.combine` outside the test file (where it's tested explicitly); if confirmed, remove `Result.combine` and its test. Otherwise leave a deprecation comment for a follow-up issue.

4. **`test(infra): SQLite busy_timeout pragma probe — failing (story-maint-11)`**
   - Add a unit test in `tests/unit/infra/db/sqlite-client.test.ts` (create file if needed): `expect(db.prepare('PRAGMA busy_timeout').pluck().get()).toBe(5000)` after `getDb`. Fails today (default is 0).

5. **`feat(infra): set busy_timeout=5000 — minimal green (story-maint-11)`**
   - Add `dbInstance.pragma('busy_timeout = 5000')` to `getDb`.
   - Probe test from slice 4 turns green.

6. **`test(cli): YAML-authoritative dbPath + --db-path-override warn — failing (story-maint-11)`**
   - Add the two Gherkin scenarios to `tests/features/ingest.feature`.
   - Add the `Given an accounting.yaml at tmp dir with dbPath: <X>` step + `Then the migration creates the file at <Y>` step in `tests/features/steps/ingest.steps.ts`.
   - Add unit test for `getDb` path-mismatch guard.
   - Add unit test for the migration-check hint string update.
   - All fail (production code unchanged).

7. **`feat(cli): #65 fix + --db-path-override rename + warn-on-use — minimal green (story-maint-11)`**
   - Update `program.ts` to load config first, resolve `dbPath = options.dbPathOverride ?? config.dbPath`, warn on override use.
   - Rename `--db-path` to `--db-path-override` on both `migrate` and `ingest`.
   - Refactor `IngestCommandDeps`: `configService` → `config`. Update `runIngestCommand` to read `config` directly instead of calling `loadAndParse(configService)`.
   - Drop the `'accounting.db'` default from `getDb`.
   - Update `migration-check.ts` hint string.
   - Migrate **all** test files that mock `configService` (5 unit + 1 perf + integration) to pass `config` directly.
   - Migrate subprocess tests to inline-YAML `dbPath` (avoid the warning on every CI run); drop `--db-path` from the spawn args. Updates `uninit-db-hint.test.ts`, `ingest-end-to-end-wiring.test.ts`, `symlink-dbpath-refuse.test.ts`, `ingest.steps.ts`, `commit.steps.ts`.
   - Closes #65.
   - All previously-green tests stay green; the new scenarios + unit tests turn green.

8. **`refactor(infra): extract findDuplicateIndices helper (#56) (story-maint-11)`**
   - Add helper to `src/infra/config/config-schema.ts` (or `src/infra/config/duplicate-indices.ts` if cleaner — Sonnet decision).
   - Replace 4 call sites.
   - Add helper unit test (5 cases).
   - Existing config-schema tests stay green.
   - Closes #56.

9. **`chore(retro): story-maint-11 retrospective`** — Keep / Change / Try.

**Why 9 commits, not 6.** The 4 deliverables are scope-independent (a partial revert leaves the rest functional). Each `test:` → `feat:` pair is a real TDD slice. Slices 4+5 (busy_timeout) are the smallest production change but split per CLAUDE.md § 6.4's "never combine red and green in one commit" rule. Bundling 8 (#56) into 7 would muddy the diff for reviewers — keep it as a separate refactor commit.

## Risks & deferred items

- **`Result.combine` removal in slice 3.** If grep finds an external consumer (test or app code), keep it deprecated with a comment + follow-up issue rather than removing. The deprecation alone is a behaviour-preserving cleanup; the removal can wait.

- **`getDb` default removal could break a forgotten call site.** Run `git grep 'getDb('` before slice 7 to confirm only `program.ts` and `tests/integration/cli/ingest-commit.test.ts`-style files call it. Both pass an explicit path already.

- **Subprocess test pivot to inline-YAML.** The `writeStubYaml` helper's `dbPath` override exists but currently defaults to `./test.db` (relative to YAML location). Tests need to either (a) use absolute paths in the YAML override, or (b) understand that `cwd=<tmp>` makes `./test.db` resolve to `<tmp>/test.db`. Verify the FileConfigService's path resolution before slice 7 to avoid mid-implementation surprise.

- **`--db-path-override` operator UX.** The flag is intentionally clunky. If it's still used in tests heavily, the warning logs accumulate on every CI run. Hence the pivot to inline-YAML. Document this trade-off in the retro.

- **`Result.all` vs `Result.combine` API surface.** Both functionally similar but `Result.combine` has a wider type (`Result<unknown>`). If a future consumer wants `Result.combine`'s shape (e.g., they want a single Result without unpacking the array), the deprecation note in slice 2 says: "Use `Result.all(...).map(() => undefined)` for the discard case."

- **The `getDb` path-mismatch guard's error message** mentions `closeDb()`. Verify `closeDb` is exported and accessible from the call sites that would hit this — it is ([src/infra/db/sqlite-client.ts:21](src/infra/db/sqlite-client.ts)) but worth confirming during slice 7.

- **Out of scope** for this story:
  - `Result.allCollect` (accumulate all errors, not just first) — defer to first Epic 3 story that needs it.
  - Remaining `isFailure` early-returns in Core (~10 sites). Migrate opportunistically as Epic 3 stories touch them.
  - [#34](https://github.com/xavierbriand/accounting/issues/34) (999-row hash chunking) — only if Epic 3 grows batch sizes.
  - [#42](https://github.com/xavierbriand/accounting/issues/42), [#43](https://github.com/xavierbriand/accounting/issues/43), [#46](https://github.com/xavierbriand/accounting/issues/46), [#51](https://github.com/xavierbriand/accounting/issues/51), [#57](https://github.com/xavierbriand/accounting/issues/57), [#58](https://github.com/xavierbriand/accounting/issues/58), [#59](https://github.com/xavierbriand/accounting/issues/59) — already closed or out of scope.
  - Plugin migration → Epic M-B (story-maint-12a/b).

## Verification plan

End-to-end manual verification by the user before marking ready:

1. `npm run lint && npm run build && npm test` — green; should be ~270 tests after additions.
2. Manual smoke: with a fresh `accounting.yaml` containing `dbPath: ./mydb.db`, run `npm run migrate`. Confirm `./mydb.db` is created, not `./accounting.db`.
3. Manual smoke: `npm run migrate -- --db-path-override /tmp/recovery.db`. Confirm warning prints to stderr, file appears at `/tmp/recovery.db`.
4. SQLite probe: open the DB and run `PRAGMA busy_timeout;`. Should return `5000`.
5. Spot-check `transaction-builder.ts` and `idempotency-service.ts` for cleaner Result combinator usage.

CI gates: `npm run lint && npm run build && npm test` green. Subprocess tier still under ~5s aggregate.

## Suggestion log

Phase 2 (P1 / P2 / P3) by Opus on 2026-04-26.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Slice 7 bundles a lot (CLI flag rename, deps-shape change, getDb signature change, hint update, 6+ test file updates). Risk: green-on-landing collapse for legitimately-sized work. Defensible per CLAUDE.md § 6.6 (adapter-rule analogue: the minimum-viable fix intrinsically bundles production change + mock-surface updates). | adopted (defended in plan) | Documented in slice 7 + § "Why 9 commits". The rename + deps-shape change cannot land separately — TS compile fails until both move together. The same logic applied to story-maint-09's factory-injection slice. |
| P1 | The `getDb` default removal is a silent breaking change for any caller relying on it. Before removing, the slice should explicitly grep all call sites and confirm none rely on the default. | adopted | Added "Risks" entry + Sonnet instruction in slice 7 to grep first, list call sites in commit body. |
| P1 | The `--db-path-override` warning is "warn-once" — does that mean per-process or per-call? If a single command parses args twice, double-warn possible. | adopted (clarified) | Per-process (one warning per CLI invocation). Implementation: `program.ts` action prints the warning before `getDb`. Single code path. |
| P2 | `Result.all` deprecates `Result.combine`. Should we keep both for backwards-compat or do a hard rename? | adopted (mid-ground) | Slice 3 grep-checks for `Result.combine` consumers; if zero, remove. If non-zero, keep with deprecation comment + follow-up issue. Internal API; aggressive cleanup acceptable. |
| P2 | Privacy: the new `dbpath-yaml-authoritative` scenario writes a YAML with a real-looking dbPath. No PII leak; dbPath is just a file path. | rejected | Not a PII concern. |
| P2 | `findDuplicateIndices` extraction changes algorithmic complexity from O(n²) to O(n). Is this a regression risk? | rejected | Strictly improves perf. The extracted helper preserves the "first occurrence canonical" semantic of the inline `indexOf` form (verified by test). |
| P3 | The `findDuplicateIndices` helper could live in a shared utility module if other parts of the codebase need duplicate detection. Cross-module placement decision? | adopted (in plan) | Slice 8 places in `src/infra/config/duplicate-indices.ts` (or co-located in `config-schema.ts` if the helper stays config-local). Sonnet decides between co-located or extracted module based on the diff size. |
| P3 | Subprocess test pivot to inline-YAML — should this also drop the `--db-path` / `--db-path-override` flag entirely from the spawn args, or pass `--db-path-override` to ensure no warning regression? | adopted (clarified) | Drop the flag entirely from non-warning-test subprocess calls (avoids warning on every CI run). The new "warning" scenario explicitly passes `--db-path-override` to assert the warning fires. |
| P3 | [#34](https://github.com/xavierbriand/accounting/issues/34) (999-row chunking) — adjacent to busy_timeout (both SQLite-related). Fold in? | rejected | Out of scope (not yet a real concern; only matters if Epic 3 grows batch sizes). Stays open. |
| P3 | The `writeStubYaml` helper currently uses fictional partner names "Alice"/"Bob" — should the dbPath default be made absolute too (currently `./test.db`)? | deferred | Subprocess tests use `cwd=<tmp>`, so `./test.db` resolves to `<tmp>/test.db` — works correctly today. Absolute path would clutter logs. Revisit only if a future test fails on path resolution. |

**Tally:** 7 adopted / 2 rejected / 1 deferred. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 10 findings (7 adopted, 2 rejected, 1 deferred).
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
