# Story maint-03 — Friendly "run migrate" error for uninitialised DB

## Context

Third story on the pre-Epic-3 maintenance track. [Issue #35](https://github.com/xavierbriand/accounting/issues/35) — surfaced during Story 2.5's first-contact-with-real-data manual smoke test. Labeled `bug` + `ux`.

Today, running `npm run ingest -- -f <csv> --db-path /tmp/fresh.db` against a **non-existent or unmigrated** DB path produces a raw Node stack trace:

```
node_modules/better-sqlite3/lib/methods/wrappers.js:5
SqliteError: no such table: transactions
    at new SqliteTransactionRepository (src/infra/db/repositories/sqlite-transaction-repo.ts:28:28)
    at Command.<anonymous> (src/cli/program.ts:49:35)
```

**Root cause.** [SqliteTransactionRepository](src/infra/db/repositories/sqlite-transaction-repo.ts) eagerly prepares 4 statements in its constructor ([line 28](src/infra/db/repositories/sqlite-transaction-repo.ts:28)). On an empty DB the first prepare throws synchronously; [program.ts:41–70](src/cli/program.ts:41)'s `.action` handler doesn't wrap construction in any error surface — the exception propagates to Node's unhandled-rejection printer.

Siblings: `SqliteHashRepository` has an empty constructor (prepares lazily) and `NodeSqliteSnapshotService` has an empty constructor (never prepares). Only `SqliteTransactionRepository` eagerly prepares, and only on *this* failure path. No need to touch them.

**Outcome.** A CLI-level **pre-flight migration check** in `program.ts`'s `ingest` action, backed by a tiny `assertMigrated(db, dbPath): Result<void>` helper in infra. On `user_version === 0` → write a friendly stderr line (`error: database not initialised at <path>` + `hint: run 'accounting migrate --db-path <path>' first`) and `process.exit(2)`. The raw `SqliteError` stack never reaches the user.

**Maintenance sub-loop (§ 6.7)** run 2026-04-24 post-story-maint-02: main synced, 0 new Dependabot PRs, `npm audit` unchanged (0 high/critical, 4 moderate/4 low — all dev-chain). 12 open issues. **Proceed-to-planning.**

## Story (verbatim from [issue #35](https://github.com/xavierbriand/accounting/issues/35))

> Expected:
> ```
> error: database not initialised at /tmp/fresh.db
> hint: run 'accounting migrate --db-path /tmp/fresh.db' first
> ```
> No stack trace, no raw SQLite error class name.

Closes #35. No FR coverage (UX hardening). Walks [docs/engineering-standards.md](docs/engineering-standards.md)'s "error surfaces are user-facing contracts, not debugging aids" and [docs/quality-assurance.md](docs/quality-assurance.md)'s spirit ("no stack trace from a first-party code path").

## Selected solution

Three options, one chosen (the one the issue author already preferred).

**Option 1 — pre-flight check in CLI** (chosen). `program.ts`'s `ingest` action reads `PRAGMA user_version` via a tiny helper; if `0`, prints friendly error + exits 2. Helper lives in `src/infra/db/migration-check.ts` for reuse when future CLI commands land.
- Pro: smallest diff; fully backward-compatible; works for `ingest` now and every future command that needs a migrated DB (reconcile, transfer, etc.) by calling the same helper.
- Pro: separates concerns cleanly — the composition root (`program.ts`) owns the "is the DB ready?" question, not the repository constructors.
- Con: requires one extra `PRAGMA` round-trip per command invocation. Negligible (<1 ms).

**Option 2 — lazy prepares in `SqliteTransactionRepository`.** Move the 4 `db.prepare()` calls from the constructor into each method. Rejected: doesn't actually fix the UX — the first `saveBatch` call would still crash with the same raw `SqliteError`, just later in the flow. Also loses the constructor-time fail-fast signal, which is a repo-pattern consistency regression.

**Option 3 — try/catch at CLI error boundary.** Wrap `.action` in try/catch that pattern-matches `SqliteError` + "no such table". Rejected (issue author also flagged this as "brittle"): string-matching DB error messages is fragile across SQLite/better-sqlite3 versions.

### Chosen implementation

1. **New file** [src/infra/db/migration-check.ts](src/infra/db/migration-check.ts):
   ```ts
   import type Database from 'better-sqlite3';
   import { Result } from '@core/shared/result.js';

   export function assertMigrated(db: Database.Database, dbPath: string): Result<void> {
     const userVersion = db.pragma('user_version', { simple: true }) as number;
     if (userVersion === 0) {
       return Result.fail(
         `database not initialised at ${dbPath}\n` +
         `hint: run 'accounting migrate --db-path ${dbPath}' first`,
       );
     }
     return Result.ok(undefined);
   }
   ```
   Pattern mirrors [migrator.ts:18](src/infra/db/migrator.ts:18)'s existing `db.pragma('user_version', { simple: true }) as number` idiom. Returns `Result.fail` (not throw) so CLI callers stay on the existing error-surfacing path.

2. **Wire into [src/cli/program.ts:41](src/cli/program.ts:41)** inside the `ingest` action, **before** constructing any repositories:
   ```ts
   .action(async (options) => {
     const resolvedDb = path.resolve(options.dbPath);
     const db = getDb(resolvedDb);

     const migrationCheck = assertMigrated(db, resolvedDb);
     if (migrationCheck.isFailure) {
       process.stderr.write(`error: ${migrationCheck.error}\n`);
       process.exit(2);
     }

     // ... existing construction + runIngestCommand call unchanged
   });
   ```
   Exit code 2 matches existing convention ([runIngestCommand](src/cli/commands/ingest-command.ts) exits 2 on `--non-interactive` low-confidence).

3. **Unit test** for `assertMigrated` — 3 cases: unmigrated → `Result.fail` with the friendly message, migrated → `Result.ok`, migrated-then-check-again stable.

4. **Subprocess integration test** in `tests/integration/cli/uninit-db-hint.test.ts` — spawns the built CLI (`node dist/cli/program.js ingest ...`), points at a non-existent DB path, asserts exit=2, stderr contains the expected strings, stderr does NOT contain `SqliteError` or `at new` (stack-trace token). This is the first subprocess test in the repo; the new `tests/integration/cli/` pattern is worth it because nothing else proves the user-visible fix end-to-end.

5. **`migrate` command stays untouched.** It's the recovery path; must not gate itself on `user_version`. Current `migrate.ts` already wraps `runMigrations` in try/catch — acceptable error surface.

## Gherkin acceptance scenarios

```gherkin
Feature: Friendly error when ingesting against an uninitialised database

  Scenario: Fresh / unmigrated DB exits 2 with a friendly hint
    Given a database path that does not yet exist, or exists but has not been migrated
    When I run `accounting ingest --file <csv> --db-path <path>`
    Then the process exits with code 2
    And stderr contains "database not initialised at <path>"
    And stderr contains "hint: run 'accounting migrate --db-path <path>' first"
    And stderr does not contain "SqliteError"
    And stderr does not contain a stack-trace token (e.g. "at new " or "at Command")

  Scenario: Migrated DB ingest works as before
    Given a database path that has been migrated
    When I run `accounting ingest --file <csv> --db-path <path>`
    Then the migration check passes silently
    And the rest of the ingest pipeline runs as before

  Scenario: `migrate` command against a fresh path still works
    Given a database path that does not yet exist
    When I run `accounting migrate --db-path <path>`
    Then migrations run and the DB is initialised
    (This is the recovery path — the pre-flight check must NOT gate `migrate` itself.)
```

## Slice plan for Sonnet

Target **5 commits** + optional refactor slot.

1. **`test(db): assertMigrated helper — failing (story-maint-03)`**
   - Add `tests/integration/infra/db/migration-check.test.ts` (integration because it uses a real `better-sqlite3` in-memory DB).
   - 3 test cases:
     - `(a)` empty DB (user_version = 0) → `Result.fail`; `result.error` contains "database not initialised" + "hint: run 'accounting migrate" + the exact dbPath string.
     - `(b)` migrated DB (after `runMigrations(db)`) → `Result.ok`.
     - `(c)` stability: calling twice on a migrated DB returns `ok` both times (no state pollution).
   - All 3 fail because `src/infra/db/migration-check.ts` doesn't exist yet.

2. **`feat(db): assertMigrated helper — minimal green (story-maint-03)`**
   - Create [src/infra/db/migration-check.ts](src/infra/db/migration-check.ts) with the body from "Chosen implementation" above.
   - 3 unit tests green.

3. **`test(cli): subprocess ingest vs uninitialised DB — failing (story-maint-03)`**
   - Add `tests/integration/cli/uninit-db-hint.test.ts` (new test file; first subprocess test in the repo).
   - Use `execFileSync('node', ['dist/cli/program.js', 'ingest', ...], { ... })` pattern. CI builds `dist/` before tests; locally `npm run build` is required first (document in the test's header comment).
   - Setup: create a tmpdir, write a minimal CSV fixture (any valid BPCE shape), assert exit === 2, stderr contains "database not initialised", stderr does NOT contain "SqliteError" or "at new ".
   - Fails under current code (exits with stack trace).

4. **`feat(cli): pre-flight migration check on ingest — minimal green (story-maint-03)`**
   - Edit [src/cli/program.ts](src/cli/program.ts): add `import { assertMigrated } from '../infra/db/migration-check.js';`.
   - Inside the `ingest` `.action`, after `getDb(resolvedDb)` and BEFORE constructing any repositories, call `assertMigrated(db, resolvedDb)`. On failure: `process.stderr.write(...)` + `process.exit(2)`.
   - Subprocess test green. All 216 tests green (213 existing + 3 unit + subprocess integration).

5. **`refactor(...): empty slot (story-maint-03)`** — or a real behaviour-preserving cleanup if one surfaces. Candidates: none currently anticipated — the change is minimal and the helper is in its natural location. Expect empty commit per § 6.4.

## Risks & deferred items

- **Subprocess test fragility.** Spawning `node dist/cli/program.js` couples the test to the build output. CI always builds before tests (see `.github/workflows/ci.yml`); locally, a fresh checkout needs `npm run build` once. If this becomes friction, a later story can either (a) vitest's `runCLI` helper if we adopt one, or (b) refactor `program.ts` to export a testable handler. Not this story.
- **`migrate` command remains untested for the "user_version > 0 starting state" case.** Its idempotency is already covered by existing migrator tests. No regression surface here.
- **No changes to `SqliteTransactionRepository`.** The constructor still eagerly prepares; if someone bypasses `program.ts` and instantiates it directly against an empty DB, the crash reappears. Acceptable — the composition root is the sanctioned entry point.
- **Integration test directory `tests/integration/cli/` already exists** (see `ingest-commit.test.ts`). No new directory; new file pattern only.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-24.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | The 3rd Gherkin scenario ("migrate still works on fresh path") lacks a corresponding test. Should we add one? | rejected | Already covered by existing `tests/integration/infra/db/migration-004.test.ts` and migrator tests. Not a regression surface for this story; adding a test would be coverage-duplication. |
| P2 | The friendly error embeds the full dbPath; if that path contains sensitive info (e.g., `/home/alice/secret/db.db`), is that a PII surface? | rejected | The user is the one who typed the path. Echoing it back is expected UX (search any POSIX CLI error for prior art). Redacting would be surprising and remove the actionability (user can't copy the hint). |
| P3 | Should the helper go in `src/core/` (with a Core-level port) or `src/infra/` (as direct helper)? | adopted | Helper stays in `src/infra/db/migration-check.ts` — it's inherently coupled to `better-sqlite3`'s Database type, no port abstraction buys anything. Confirmed by reading § 2 architecture note: Core depends on nothing, Infra talks to the outside world. PRAGMA is a SQLite wire-protocol concern; belongs in Infra. |
| P3 | Subprocess test introduces a new pattern. Worth it? | adopted | Yes — the issue's acceptance criterion is user-visible behaviour (no stack trace in stderr). Unit-testing the helper alone doesn't prove the wire-up. Subprocess test is the minimum pattern that provides E2E proof. Document the one-time `npm run build` requirement in the test file's header comment. |

No deferred items. 2 adopted / 2 rejected. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 4 findings (2 adopted, 2 rejected). No deferred items.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**

**DoR gate met. Ready for Phase 3 after PR opens.**
