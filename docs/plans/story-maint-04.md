# Story maint-04 — Validate `dbPath` against symlink-based path hijacking

## Context

Fourth story on the pre-Epic-3 maintenance track. [Issue #21](https://github.com/xavierbriand/accounting/issues/21) — Story 1.4 P3 deferred suggestion. **Elevated in priority by Story 2.5**, which added a sibling `.bak` snapshot path derived from `dbPath`: the filename attack surface doubled.

**Threat model.** `dbPath` is user-controlled via two sources: (a) the CLI `--db-path` flag, (b) `accounting.yaml`'s `dbPath` field (parsed into `AppConfig.dbPath` — not yet wired to `getDb` at CLI level, but latent). An adversary with write access to the config location (tainted share-file, co-installed compromised package, or a hostile `accounting.yaml` in a cloned repo) can point `dbPath` at a symlink whose target is an unrelated file the user can write to. `better-sqlite3.Database` opens the path, follows the symlink, writes SQLite bytes — corrupting or creating the target. The blast radius extends to `${dbPath}.bak` since Story 2.5 snapshots there.

**Current defence.** [src/cli/program.ts:43](src/cli/program.ts:43) and [src/cli/migrate.ts:6](src/cli/migrate.ts:6) both call `path.resolve(options.dbPath)` before `getDb()`. That collapses `..` segments but **does nothing about symlinks**. No validation of the resolved path's filesystem reality.

**Outcome.** A new `validateDbPath(rawPath): Result<string>` helper in infra that:
1. Resolves the path (`path.resolve`).
2. `lstatSync`s it: if the entry exists and is a symbolic link, refuses with a friendly error.
3. Tolerates `ENOENT` (fresh install: path doesn't exist yet — `getDb` will create it).

Wired into both `migrate` and `ingest` actions at the composition root (same pattern as story-maint-03's `assertMigrated`). Updates the [docs/security-checklist.md:26](docs/security-checklist.md) line about user-controlled paths to name the new enforcement.

**Maintenance sub-loop (§ 6.7)** run 2026-04-25 post story-maint-03 merge: main synced, 0 new Dependabot PRs, `npm audit` unchanged (0 high/critical). **Proceed-to-planning.**

## Story (from [issue #21](https://github.com/xavierbriand/accounting/issues/21), scoped)

> In the wire-up story:
> 1. Normalize the path via `path.resolve` before opening.  ← **already done**; lock it in.
> 2. Assert it is within an allowed root... reject symlinks that escape it, reject absolute paths outside the allowed root, reject paths containing `..` after resolution when strict mode is enabled.
> 3. Document the policy in `docs/security-checklist.md`.
> 4. Add a unit test for each rejection case.

**Scope cut.** The issue's bullet 2 proposes three enforcement layers (symlink-escape, absolute-outside-allowed-root, strict-mode `..` rejection). For this story we adopt **only the symlink rejection**. Allowed-root policy requires defining an allowed-root concept (`dataDir` config field, per-user data directory, project-root fencing) that doesn't exist today; strict-mode `..` would forbid legitimate user-chosen relative paths. Both become their own stories when a concrete policy emerges. Documented under "Deferred items" below.

Closes #21. No FR coverage (security hardening). Walks [docs/security-checklist.md § Validation & boundaries](docs/security-checklist.md).

## Selected solution

Two options considered.

**Option A — single check at composition root** (chosen). Helper `validateDbPath(raw): Result<string>` in `src/infra/db/db-path-validator.ts`. Both `migrate` and `ingest` actions in `program.ts` call it before `getDb()`. Consistent with story-maint-03's `assertMigrated` pattern.
- Pro: one policy point; same code path for both commands and any future command.
- Pro: helper is pure + Result-returning; easy to unit test.
- Con: each action has to remember to call it. Mitigated by grouping composition-root checks — both land near `getDb(resolvedDb)`.

**Option B — check inside `getDb`.** Move the validation into `src/infra/db/sqlite-client.ts`. Impossible to forget, enforced everywhere.
- Pro: single choke point.
- Con: `getDb`'s signature must change from throwing-on-failure to `Result<Database>` (since validation is policy and should be surface-able). Touches every caller (program.ts migrate + ingest actions, plus every test that constructs a DB). Big blast radius for a security policy that currently has two callers.
- Con: `getDb` today does real file I/O (creates empty DB, sets pragmas, chmods). Mixing validation into that is layering a policy onto an operation — breaks single responsibility.

**Option A chosen.** Option B is re-considered if a third caller emerges.

### Chosen implementation

1. **New file** [src/infra/db/db-path-validator.ts](src/infra/db/db-path-validator.ts):
   ```ts
   import fs from 'fs';
   import path from 'path';
   import { Result } from '@core/shared/result.js';

   export function validateDbPath(rawPath: string): Result<string> {
     const resolved = path.resolve(rawPath);
     try {
       const stat = fs.lstatSync(resolved);
       if (stat.isSymbolicLink()) {
         return Result.fail(
           `refusing to open dbPath: ${rawPath} is a symbolic link. ` +
           `Point --db-path at a regular file or let one be created fresh.`,
         );
       }
     } catch (err) {
       const code = (err as NodeJS.ErrnoException).code;
       if (code !== 'ENOENT') {
         return Result.fail(`failed to stat dbPath '${rawPath}': ${String(err)}`);
       }
       // ENOENT is acceptable — getDb will create the file.
     }
     return Result.ok(resolved);
   }
   ```
   Returns the resolved path on success so callers don't re-`path.resolve`.

2. **Wire into [src/cli/program.ts](src/cli/program.ts)** — both `migrate` and `ingest` actions, replacing the current `path.resolve(options.dbPath)` line:
   ```ts
   const validation = validateDbPath(options.dbPath);
   if (validation.isFailure) {
     process.stderr.write(`error: ${validation.error}\n`);
     process.exit(2);
   }
   const resolvedDb = validation.value;
   ```
   The `migrate` action currently delegates to `runMigrate(options.dbPath)` in `migrate.ts`. Two moves:
   - Option W (widens program.ts): inline the validation in program.ts before calling `runMigrate`, pass the validated path.
   - Option X (widens migrate.ts): move validation into `runMigrate` itself.
   - **Choice:** W — keeps the composition-root pattern consistent with `ingest`.

3. **Update [src/cli/migrate.ts](src/cli/migrate.ts)** — accept the already-resolved path from program.ts; drop the internal `path.resolve`.

4. **Update [docs/security-checklist.md:26](docs/security-checklist.md)** — expand the "No user-controlled path strings reach `fs` without prior normalization" line to mention the new symlink-rejection enforcement at CLI boundaries.

5. **Tests:**
   - **Unit:** `tests/integration/infra/db/db-path-validator.test.ts` (integration tier because it touches real `fs.lstatSync`):
     - `(a)` non-existent path → `Result.ok(resolved)`.
     - `(b)` regular file at path → `Result.ok(resolved)`.
     - `(c)` symlink at path (pointing at a real target) → `Result.fail` with "symbolic link" token.
     - `(d)` symlink at path (dangling — target doesn't exist) → `Result.fail` with "symbolic link" token. Defensive case: dangling symlinks are still symlinks.
     - `(e)` `EACCES` surface: a stat that fails for non-ENOENT reason propagates as `Result.fail`. Simulate by stubbing `fs.lstatSync` (vitest mock).
   - **Subprocess integration:** `tests/integration/cli/symlink-dbpath-refuse.test.ts` — reuses the tsx-spawn pattern from story-maint-03's [uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts). Two tests (one per command):
     - `ingest --db-path <symlink>` → exit 2, stderr contains "symbolic link" + "refusing to open dbPath", no `SqliteError` or stack token.
     - `migrate --db-path <symlink>` → same.

## Gherkin acceptance scenarios

```gherkin
Feature: Reject symlinked dbPath

  Scenario: CLI ingest against a symlinked db path is refused
    Given a symlink at /tmp/link.db pointing at anywhere (target existent or dangling)
    When I run `accounting ingest --db-path /tmp/link.db --file <csv>`
    Then the process exits with code 2
    And stderr contains "refusing to open dbPath"
    And stderr contains "symbolic link"
    And stderr does not contain "SqliteError"
    And no write reaches the symlink's target

  Scenario: CLI migrate against a symlinked db path is refused
    Given a symlink at /tmp/link.db
    When I run `accounting migrate --db-path /tmp/link.db`
    Then the process exits with code 2
    And stderr contains "refusing to open dbPath"
    And stderr contains "symbolic link"

  Scenario: Regular file at dbPath proceeds normally
    Given a regular file at /tmp/real.db (possibly an existing SQLite DB)
    When I run `accounting ingest --db-path /tmp/real.db ...`
    Then validation passes silently
    And the rest of the ingest pipeline runs as before

  Scenario: Non-existent dbPath proceeds (getDb creates fresh)
    Given /tmp/fresh.db does not exist
    When I run `accounting migrate --db-path /tmp/fresh.db`
    Then validation passes (ENOENT is acceptable)
    And getDb creates the file and migrations run
```

## Slice plan for Sonnet

Target **7 commits** + retrospective.

1. **`test(db): validateDbPath — failing (story-maint-04)`**
   - New file `tests/integration/infra/db/db-path-validator.test.ts` with the 5 cases enumerated above.
   - All 5 fail because the helper file doesn't exist yet.

2. **`feat(db): validateDbPath implementation — minimal green (story-maint-04)`**
   - Create `src/infra/db/db-path-validator.ts` with the exact body above.
   - All 5 unit tests green.

3. **`test(cli): migrate + ingest refuse symlinked dbPath — failing (story-maint-04)`**
   - New file `tests/integration/cli/symlink-dbpath-refuse.test.ts` — 2 subprocess tests (reuse tsx-spawn pattern from [uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts)).
   - Each test: create a tmpdir, create a symlink inside it (pointing at a sibling real file — avoids ENOENT on the target), spawn `tsx src/cli/program.ts migrate|ingest --db-path <symlink>`, assert exit=2 + stderr contents.
   - Fails under current code: `getDb` will happily follow the symlink and better-sqlite3 will open the target (possibly a valid SQLite file, possibly not — either way, no stderr refusal).

4. **`feat(cli): wire validateDbPath into program.ts migrate + ingest — minimal green (story-maint-04)`**
   - Edit `src/cli/program.ts`: import `validateDbPath`; in both `migrate` and `ingest` actions, call it before `getDb`. On failure: stderr + exit 2.
   - Edit `src/cli/migrate.ts`: drop the internal `path.resolve` (program.ts now hands in a validated path); `runMigrate(resolvedDb)` directly.
   - Subprocess tests green.
   - Existing tests regression-check: `npm test` runs full suite.

5. **`chore(docs): document dbPath symlink-rejection in security-checklist (story-maint-04)`**
   - Edit [docs/security-checklist.md:26](docs/security-checklist.md) — expand the existing line to call out the new enforcement. Add a sub-bullet for the `.bak` sibling surface that's transitively protected.

6. **`refactor(db): empty slot — no cleanup identified (story-maint-04)`**
   - Empty `refactor:` per § 6.4.

7. **Retrospective** (`chore(retro): ...`) — separate commit as always.

## Risks & deferred items

- **Allowed-root enforcement is out of scope.** A policy (`dataDir: ~/.accounting` or similar) requires a product decision. Not blocking for the symlink rejection — the main attack vector closes. File a follow-up issue for "define an allowed-root policy for dbPath" if/when a concrete caller surfaces.
- **Parent-directory symlinks unvalidated.** If `dbPath = /home/alice/data/db.sqlite` and `/home/alice/data` is itself a symlink to an attacker-chosen directory, `lstatSync` on `db.sqlite` doesn't flag it. Realpath-parent comparison would catch it but introduces allowed-root complexity. Documented limitation; scoped out.
- **TOCTOU between lstat and open.** A narrow window exists where an attacker could swap the file for a symlink between our `lstatSync` and better-sqlite3's `open`. For a local-CLI threat model this is acceptable: the attacker already has filesystem write access to the user's path. Story 2.5's snapshot service uses atomic-rename-from-randomised-tmp precisely because writes are the attackable surface; opens are harder to race.
- **`AppConfig.dbPath` config-file surface is still un-wired.** Current state: CLI `--db-path` flag is the only source of `dbPath` reaching `getDb`. When a future story wires `configService.load().value.dbPath` → `getDb`, it should call the same `validateDbPath` helper. Called out in the retro to be linked when that story lands.

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus on 2026-04-25.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Gherkin scenario 4 ("non-existent dbPath proceeds") — covered by the unit test case (a) and implicitly by existing migrator tests (they use in-memory or fresh paths). Add a subprocess version too? | rejected | Doubles subprocess-test cost (slow `tsx` transpile) for a path already covered at the unit + integration levels. |
| P2 | Symlink error message echoes the raw `rawPath` — PII leak? | rejected | Same posture as story-maint-03 P2 rejection: the user typed the path, echoing is UX. Redacting removes the actionable "which path?" context. |
| P3 | Should the validation be in `src/core/` (Core port) or `src/infra/` (direct helper)? | adopted | Stays in `src/infra/db/` — the check is intrinsically bound to `fs.lstatSync` (Node API); no Core port buys anything. Mirrors story-maint-03 P3 decision for `assertMigrated`. |
| P3 | Should the helper also check for hard links (multiple names pointing at one inode)? | rejected | Hard links don't participate in path-traversal attacks — they share an inode but can't point "outside" the filesystem. Not a symlink-class concern. |
| P3 | Scenario 4 test relies on `getDb` creating the file; if `getDb`'s behaviour changes (e.g., stops auto-creating), the scenario silently breaks. Should we assert file creation too? | adopted | Expand scenario 4's subprocess test (or rely on existing migrator tests covering the create path). Decision: rely on existing tests — they'd fail first if `getDb` regressed. Avoid over-testing here. |

2 adopted / 3 rejected / 0 deferred. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 5 findings (3 adopted, 3 rejected). No deferred items.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
