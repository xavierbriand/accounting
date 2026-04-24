# Epic 2, Story 2.5 — Atomic Commit with Snapshot

## Context

Stories 2.1–2.4 shipped a complete ingest pipeline that stops one step short of writing to disk: `runIngestCommand` ends at a stderr line that reads `"${n} transaction(s) confirmed. (DB writes pending — Story 2.5)"` ([src/cli/commands/ingest-command.ts:130](src/cli/commands/ingest-command.ts:130)). Story 2.5 closes the loop — it takes the confirmed `BuildOutcome[]` batch, snapshots the SQLite DB, writes the batch inside a single SQL transaction, and populates the `idempotency_hash` column that Story 2.2 added nullable. It is the **last story of Epic 2** (Ingest Slice).

**Problem.** Without a batch-level snapshot-plus-transaction, a partial write during ingest could leave the ledger half-populated — violating the two-stage contract in [docs/quality-assurance.md:33–35](docs/quality-assurance.md) ("Commit: set of valid rows written inside a single SQL transaction — all-or-nothing"). Additionally the `idempotency_hash` column, while present, is currently never written — so the read-side dedup (Story 2.2) is effectively useless until Story 2.5 populates it. **Outcome.** A `SnapshotService` port + better-sqlite3 `db.backup`-based adapter; a `TransactionRepository.saveBatch` that persists all `BuildOutcome`s (+ their hashes) in one SQL transaction; a migration tightening `idempotency_hash` to `NOT NULL`; and the ingest-command wire-up that drives all three.

**Maintenance sub-loop** (CLAUDE.md § 6.7): `npm audit` produced 4 low (prod, `tmp` via `@inquirer/prompts`) + 4 moderate (dev, `uuid` via `quickpickle`); **nothing at high/critical** → no immediate-issue trigger. **Zero** open Dependabot PRs. Open-issue triage: **#26 closed** (Story 2.3 already shipped the PAIEMENT CARTE classifier; issue was stale-open); **#27 (throughput <2s)** and **#29 (NOT NULL tightening)** scheduled to close in this story; **#21 (dbPath traversal)** flagged but deferred (scope creep — see Risks). **Proceed-to-planning.**

**Plan-agent stress-test findings applied (6 decisions interrogated):**
- **Decision 3 flipped:** `PRAGMA foreign_keys` is a no-op inside a transaction; the migrator now toggles it outside the migration's tx + asserts `PRAGMA foreign_key_check` post-commit. Migration SQL contains no PRAGMA lines. Would have been silent data loss with any pre-existing rows.
- **Decision 2 adjusted:** snapshot adapter accepts the open `Database` via DI (no re-open); `unlinkSync` cleanup on `create` error so a half-written `.bak` from a crash can't be mistaken for a real snapshot; `fs.chmodSync(0o600)` to match the live DB's permissions.
- **Decision 6 superseded (Opus P3 review):** the originally-planned `lstatSync`-then-refuse pattern has a TOCTOU race; replaced with an **atomic-rename-from-randomised-tmp** pattern — `db.backup` writes to `${path}.tmp.${pid}.${rand}`, `renameSync` atomically replaces any pre-planted file or symlink at target *by name* without traversing it. Full #21 `dbPath` validation still deferred.
- **Decision 5 tuned:** perf test uses on-disk tmpdir DB (not `:memory:` — the one thing that actually exercises WAL fsync); threshold 3000 ms with 1.5× CI headroom; `test:perf` wired into `package.json` scripts so the benchmark has a stable invocation.
- **Decision 4 documented:** `.bak` retention rule (overwrite-on-create) ships with a PR-body line clarifying it is *not* a long-term backup, plus a test asserting a second failed run overwrites the first `.bak`.
- **Decision 1 kept** with one added test (`interactive re-categorisation preserves idempotencyHash`) to lock in the object-spread contract.
- **Slice 11 extracts `commitBatch` helper** (reduces duplication of the snapshot → saveBatch → remove flow); Slice 13 is NOT empty — it extracts `loadAndParse` to bring `runIngestCommand` under the 60-LOC / ≥2-duplication Story-2.3-retro threshold (previous draft misclaimed slice 11's extraction would do it; slice 11 is line-neutral).

**Opus P1/P2/P3 critical review findings applied:**
- **P3 #1 (MAJOR):** slice 13 promoted from "possibly empty refactor" to **mandatory `loadAndParse` extraction** — current `runIngestCommand` at 97 LOC fails the 60-LOC Story-2.3-retro trigger; `commitBatch` alone is line-neutral.
- **P3 #2 (MAJOR):** added **`fast-check` property test** (`saveBatch` populates `idempotency_hash` 1:1 for every outcome) as slice 6 sub-case (e) + a top-level Gherkin scenario. Catches any off-by-one / wrong-binding regression.
- **P3 #3 (MAJOR):** snapshot adapter switched from `lstat`-then-refuse to **atomic-rename-from-randomised-tmp** — see Decision 6 above. Closes the TOCTOU race window.
- **P3 #4 (MINOR):** `PRAGMA foreign_key_check` now runs **inside** the migration's `db.transaction()` — on failure, the schema changes AND the `user_version` bump both roll back atomically. Added slice 4 sub-case (g) to lock in.
- **P3 #5 (MINOR):** perf test now has explicit `afterAll` cleanup (`fs.rmSync(tmp, { recursive: true, force: true })`) so repeated local runs don't leak `/tmp`.
- **P1 adopt #1:** happy-path Gherkin now asserts `snapshotPath === dbPath + ".bak"` (literal-suffix convention lock-in).
- **P1 adopt #2:** `--non-interactive` dry-run promoted from slice-10-e to a first-class named Gherkin scenario.
- **P2 adopt #1:** added PII-hygiene Gherkin scenario — commit-failure stderr must not leak `idempotency_hash` hex values from raw SQLite UNIQUE-constraint errors; implementation redacts hex-like tokens from the SQL error before writing to stderr.
- **P2 adopt #2:** Windows `chmod` skip in slice 9 carries an inline code comment so future readers don't mistake it for a bug.

**Product decisions taken this session:**
- **Snapshot via `better-sqlite3.backup()`.** Online-backup API; handles WAL correctly; no VACUUM INTO, no raw file-copy (unsafe with a hot WAL journal).
- **Hash propagates via `BuildOutcome`.** Extend `IdempotencyOutcome.fresh` from `readonly IngestItem[]` → `readonly FreshIngestItem[]` (each `{ item, idempotencyHash }`), and add `readonly idempotencyHash: string` to `BuildOutcome`. Re-deriving the hash at write time (Option B) was rejected: DRY violation + an extra canonicalize + hash round-trip per row.
- **Migration 004 = full table-rebuild.** SQLite cannot `ALTER COLUMN … SET NOT NULL`. The canonical rebuild idiom (rename → create with NOT NULL → INSERT SELECT → drop old → rename new → recreate indexes) executes in a single `db.transaction()`. Zero-row DBs (the expected state pre-Story-2.5) rebuild trivially.
- **Snapshot lifecycle: create before batch; remove on success; retain on failure.** Matches the user story ("undo the import if something goes wrong"). SQLite's `db.transaction()` wrapper already rolls back the DB on any mid-batch error; the `.bak` is the recovery artifact the user can manually restore from if anything escapes the ROLLBACK.
- **Closing #27 (throughput <2s benchmark)** — explicit in the #27 issue body ("Land the benchmark at the close of Story 2.5"). Synth 1000 rows through the full parse → dedup → build → saveBatch pipeline; assert wall-clock < 2000 ms. Tagged `perf` so CI can run it selectively.
- **Deferred: #21 (dbPath path-traversal validation).** Trigger condition went live in Story 2.4 and widens slightly in Story 2.5 (`.bak` sits next to `dbPath`). Including it would push this story to 7+ Gherkin scenarios. Recorded in Risks; file remains open.

## Story (verbatim from [docs/epics.md:184–197](docs/epics.md))

> As a User, I want the system to backup my database before saving new transactions, so that I can undo the import if something goes wrong.
>
> **Given** A confirmed batch of transactions (already produced by the parse + idempotency + builder stages),
> **When** The system begins the **commit stage**,
> **Then** It first copies `ledger.db` to `ledger.db.bak` (Snapshot).
> **And** It opens a single SQL transaction.
> **And** It inserts all records.
> **And** If any insert fails at the DB level, the ENTIRE batch is rolled back (ACID). Parse-stage skips are out of scope here — they were handled earlier in Story 2.1.

FR coverage: **FR4** (CSV ingest, commit stage) + **FR8** (idempotent re-ingest, since filled hashes make dedup actually dedup). Walks QA invariants "No silent data loss" and "Batch ingestion — two stages: commit is all-or-nothing" ([docs/quality-assurance.md:15,33](docs/quality-assurance.md)). Closes #27 and #29; closes Epic 2.

## Selected solution

Three new components plus a migration plus a CLI wire-up. All changes respect the dependency rule (ports in Core, implementations in Infra, composition in CLI).

### 1. Thread the hash through types & services

**Core types** ([src/core/ingest/types.ts](src/core/ingest/types.ts)) — add hash to fresh items and to build outcomes:

```ts
export interface FreshIngestItem {
  readonly item: IngestItem;
  readonly idempotencyHash: string;
}

export interface IdempotencyOutcome {
  readonly fresh: readonly FreshIngestItem[];   // was: readonly IngestItem[]
  readonly duplicates: readonly IngestItem[];
}

export interface BuildOutcome {
  readonly transaction: Transaction;
  readonly category: string;
  readonly classification: Classification;
  readonly confidence: Confidence;
  readonly idempotencyHash: string;             // new
}
```

**`IdempotencyService.filterNew`** ([src/core/ingest/idempotency-service.ts:13–44](src/core/ingest/idempotency-service.ts)) — instead of dropping the hash after the dedup query, zip each fresh item with its hash. No other logic changes.

**`TransactionBuilder.buildAll`** ([src/core/ingest/transaction-builder.ts:119–133](src/core/ingest/transaction-builder.ts)) — accept `readonly FreshIngestItem[]` instead of `readonly IngestItem[]`; in `build(item)` → pass `idempotencyHash` into the constructed `BuildOutcome` alongside category/classification/confidence. `makeOutcome` signature grows by one arg.

**Downstream flips** in ingest-command.ts and all test mocks: the `fresh` array is now `{ item, idempotencyHash }[]`; anywhere that does `.push(item)` or iterates `for (const item of fresh)` needs `item.item` or `item.idempotencyHash` as appropriate.

### 2. `SnapshotService` port + adapter

**Port** (`src/core/ports/snapshot-service.ts`):

```ts
import type { Result } from '@core/shared/result.js';

export interface SnapshotService {
  // Create an atomic snapshot of the live SQLite DB at dbPath, written to snapshotPath.
  // Overwrites any existing file at snapshotPath (pre-empts a stale .bak from a crashed run).
  create(dbPath: string, snapshotPath: string): Promise<Result<void>>;

  // Restore dbPath from an earlier snapshotPath (file copy).
  // Not called on normal-path rollback (SQLite's db.transaction() wrapper handles that);
  // provided as an explicit recovery API and exercised by tests.
  restore(snapshotPath: string, dbPath: string): Promise<Result<void>>;

  // Delete a snapshot file. Called after a successful batch commit; no-op if absent.
  remove(snapshotPath: string): Promise<Result<void>>;
}
```

All three methods are async for interface consistency (create must be — `db.backup` is async).

**Adapter** (`src/infra/db/node-sqlite-snapshot-service.ts`) — the adapter **accepts the already-open `Database`** via DI rather than re-opening from `dbPath` (per Plan-agent Decision 2 adjustment: re-opening a WAL-mode DB read-only in a separate connection is fragile across processes, and in our single-writer CLI the open connection is already available). Constructor: `constructor(private readonly db: Database.Database) {}`.

- `create(dbPath, snapshotPath)` — **atomic-rename pattern** (P3 finding #3: naive `lstat` then `db.backup` has a TOCTOU window an attacker can exploit by racing a symlink swap):
  1. Build a randomised temp path in the same directory: `const tmpPath = ${snapshotPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}` — not guessable, same-dir so `rename` is atomic on POSIX.
  2. Call `this.db.backup(tmpPath)` — await the Promise. On rejection: `fs.unlinkSync(tmpPath)` if it was created, then `Result.fail(String(err))`.
  3. On success: `fs.chmodSync(tmpPath, 0o600)` on POSIX (`process.platform !== 'win32'` — Windows has no POSIX perm model, skip with an inline-comment note so future readers don't mistake it for a bug).
  4. `fs.renameSync(tmpPath, snapshotPath)` — atomic on POSIX; the rename replaces any existing file **or symlink** at `snapshotPath` *by name*, without traversing the symlink's target. This neutralises the attack surface of a pre-planted symlink at `.bak` pointing at `/etc/passwd` (the rename unlinks the symlink and places the new file at that path; the target of the symlink is untouched).
  5. On any step's failure: `fs.unlinkSync(tmpPath)` if present, then `Result.fail`. No path leak beyond "snapshot failed".

  **Why the rename pattern beats `lstat` + refuse.** P3 review flagged that `lstatSync(path)` → "no symlink, proceed" → `db.backup(path)` has a race window: an attacker with write access to the dir can swap in a symlink between the two calls. The rename-from-randomised-tmp pattern has no such window — at no point do we `open(O_FOLLOW)` a user-controlled path. We also drop the earlier `lstat` step entirely; rename replaces a pre-existing symlink safely.
- `restore(snapshotPath, dbPath)`: `fs.copyFileSync(snapshotPath, dbPath)`. Wrapped in Promise for type consistency. Note: the caller must ensure no `Database` is open on `dbPath` during restore — the CLI's restore path (if ever invoked, which Story 2.5 does not automatically) is a manual recovery step.
- `remove(snapshotPath)`: `fs.unlinkSync(snapshotPath)` if `existsSync`; no-op otherwise. Returns `Result.ok()` in both cases.

**Why `db.backup` over `VACUUM INTO` or `fs.copyFileSync`:** `db.backup` is SQLite's documented online-backup API; it coordinates with the WAL journal so the produced file is a consistent snapshot even if writes are in flight. `VACUUM INTO` would also work but requires executing on the live connection (minor coupling, and also writes to `sqlite_sequence` etc.). Raw `fs.copyFileSync` on a WAL-mode DB can produce a torn file if the `-wal` sidecar file contains uncommitted pages at copy time — unsafe.

### 3. `TransactionRepository.saveBatch`

**Port** ([src/core/ports/transaction-repository.ts](src/core/ports/transaction-repository.ts)) — add:

```ts
export interface BatchWriteOutcome {
  readonly written: number;   // count of transactions persisted
}

export interface TransactionRepository {
  save(transaction: Transaction): Result<void>;                           // unchanged
  saveBatch(outcomes: readonly BuildOutcome[]): Result<BatchWriteOutcome>; // new
  findById(id: string): Result<Transaction | null>;                        // unchanged
}
```

**Implementation** ([src/infra/db/repositories/sqlite-transaction-repo.ts](src/infra/db/repositories/sqlite-transaction-repo.ts)):
- Add a prepared statement `insertHeaderWithHash` = `INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)`.
- `saveBatch(outcomes)` wraps every header + entry INSERT across the whole array in a single `db.transaction(() => { ... })`. Any thrown error (CHECK, UNIQUE, FK) aborts the whole batch.
- Returns `Result.ok({ written: outcomes.length })` on success, `Result.fail(String(err))` on any failure.
- `save()` stays as-is for now — not deleted; used by existing round-trip tests. A follow-up can prune it once unused.

### 4. Migration 004 — NOT NULL tightening

**⚠️ Critical Plan-agent finding (Decision 3).** SQLite `PRAGMA foreign_keys` **cannot** be changed inside a transaction — the PRAGMA is silently a no-op there. The migrator currently wraps each migration in `db.transaction()`, so a `PRAGMA foreign_keys = OFF;` line inside the migration SQL would be ignored and the `DROP TABLE transactions` would cascade-delete `transaction_entries` rows. With today's zero-row DB this is invisible; with any real data, it's silent data loss.

**The pragma toggle must happen in the migrator, outside the migration's own transaction.** The migration SQL therefore contains NO PRAGMA lines.

**Migrator change** ([src/infra/db/migrator.ts](src/infra/db/migrator.ts)) — wrap the per-file migration in an FK toggle. **Critically, the `foreign_key_check` runs INSIDE the same `db.transaction()` that applies the migration** (P3 finding #4): if the check raises, the whole transaction rolls back — including `PRAGMA user_version = <n>`, which would otherwise leave the DB in a half-migrated state marked "upgraded" but with broken FKs.

```ts
const priorFk = db.pragma('foreign_keys', { simple: true }) as number;
db.pragma('foreign_keys = OFF');           // outside any tx — takes effect
try {
  const runMigration = db.transaction(() => {
    db.exec(migrationSql);
    const fkIssues = db.pragma('foreign_key_check') as unknown[];
    if (fkIssues.length > 0) {
      // throw inside db.transaction() → whole tx rolls back, incl. PRAGMA user_version
      throw new Error(`Migration ${file}: foreign_key_check returned ${fkIssues.length} issue(s)`);
    }
    db.pragma(`user_version = ${fileVersion}`);
  });
  runMigration();
} finally {
  if (priorFk === 1) db.pragma('foreign_keys = ON');
}
```

This path toggles FK enforcement around **every** migration (cheap; migrations are rare). Since most migrations don't need it, this is pure defense-in-depth for the rebuild idiom. The `foreign_key_check` **inside** the transaction surfaces rebuild-broke-something scenarios atomically: on failure the migration file's changes AND the `user_version` bump both roll back, leaving the DB cleanly at its prior version — previously there was no check at all.

**Migration file** (`src/infra/db/migrations/004-idempotency-hash-not-null.sql`) — the canonical SQLite rebuild idiom, with **no PRAGMA lines** (those live in the runner now):

```sql
-- SQLite cannot ALTER COLUMN … SET NOT NULL directly.
-- Standard rebuild idiom: create new table with NOT NULL, copy data, drop old, rename new.
-- Runner wraps this in db.transaction() for atomicity.
-- Runner toggles PRAGMA foreign_keys = OFF around this transaction (see migrator.ts)
-- and runs PRAGMA foreign_key_check after the transaction commits.

-- Drop the old index first so the DROP TABLE below doesn't trip over it.
DROP INDEX IF EXISTS idx_transactions_idempotency_hash;

CREATE TABLE transactions_new (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    description TEXT NOT NULL,
    idempotency_hash TEXT NOT NULL
);

INSERT INTO transactions_new (id, occurred_at, description, idempotency_hash)
  SELECT id, occurred_at, description, idempotency_hash FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE UNIQUE INDEX idx_transactions_idempotency_hash ON transactions(idempotency_hash);

PRAGMA user_version = 4;
```

Pre-Story-2.5 DBs have zero rows, so the `INSERT SELECT` moves nothing and the rebuild is effectively a schema swap. If a user *somehow* has rows with `idempotency_hash IS NULL`, the `INSERT SELECT` into a `NOT NULL` column will throw and the migration fails atomically (the `db.transaction()` rolls back) — surfaces the inconsistency loudly.

If the user has transactions + transaction_entries rows, the runner's `PRAGMA foreign_keys = OFF` (applied *before* the transaction begins — that's the whole fix) allows `DROP TABLE transactions` without cascade, and the `PRAGMA foreign_key_check` after commit verifies the child table's `transaction_id` FK still points at rebuilt parent rows. If that check fails, the migrator throws and the process exits non-zero.

### 5. Ingest-command wire-up

**`IngestCommandDeps`** ([src/cli/commands/ingest-command.ts:19–30](src/cli/commands/ingest-command.ts:19)) — new members:

```ts
readonly transactionRepository: Pick<TransactionRepository, 'saveBatch'>;
readonly snapshotService: SnapshotService;
readonly dbPath: string;      // resolved absolute path (from program.ts)
```

**Extract `commitBatch(outcomes, deps)` helper** (Plan-agent slice-concern adjustment). Current `runIngestCommand` is already 97 LOC ([retro 2.4 Keep](docs/retrospectives/story-2.4.md)); adding the snapshot → saveBatch → remove inline would push it to ~115 LOC — past the 60-LOC + duplication flag. Ship slice 11 with an extracted helper so slice 14 (refactor) doesn't become a forced second-pass.

```ts
// src/cli/commands/ingest-command.ts (new helper, lives below runInteractiveLoop)
async function commitBatch(
  outcomes: readonly BuildOutcome[],
  deps: Pick<IngestCommandDeps, 'transactionRepository' | 'snapshotService' | 'dbPath' | 'stderr' | 'exitCode'>,
): Promise<void> {
  const { transactionRepository, snapshotService, dbPath, stderr, exitCode } = deps;
  const snapshotPath = dbPath + '.bak';

  const snapResult = await snapshotService.create(dbPath, snapshotPath);
  if (snapResult.isFailure) {
    writeln(stderr, `Snapshot failed: ${snapResult.error}`);
    exitCode(3);
    return;
  }

  const writeResult = transactionRepository.saveBatch(outcomes);
  if (writeResult.isFailure) {
    // sanitizeSqlError redacts hex-like tokens (≥32 consecutive hex chars) from
    // SQLite's raw UNIQUE/CHECK-violation messages; hashes are PII-adjacent
    // fingerprints per security-checklist.md (P2 adopt #1).
    writeln(stderr, `Commit failed (batch rolled back): ${sanitizeSqlError(writeResult.error)}`);
    writeln(stderr, `Snapshot retained at ${snapshotPath} for recovery.`);
    exitCode(4);
    return;
  }

  const removeResult = await snapshotService.remove(snapshotPath);
  if (removeResult.isFailure) {
    // Snapshot-removal failure is non-fatal — the write succeeded. Warn, don't abort.
    writeln(stderr, `Warning: committed successfully but could not remove snapshot at ${snapshotPath}: ${removeResult.error}`);
  }

  writeln(stderr, `${writeResult.value.written} transaction(s) committed.`);
  exitCode(0);
}
```

Replace [ingest-command.ts:130–131](src/cli/commands/ingest-command.ts:130) terminal block with:

```ts
await commitBatch(resolvedOutcomes, { transactionRepository, snapshotService, dbPath, stderr, exitCode });
```

Exit codes: `3` = snapshot creation failed (no DB touched); `4` = batch commit failed after snapshot (SQLite rolled back; snapshot retained for manual inspection). `0` for success stays.

**`--non-interactive` path** ([ingest-command.ts:114–116](src/cli/commands/ingest-command.ts:114)): `runNonInteractive` currently returns after printing JSON without writing to DB — that's dry-run semantics. Story 2.4's retro treats it as dry-run. **Decision (taken here, not deferred):** keep `--non-interactive` as dry-run for Story 2.5. Documented in the PR body. If user wants CI-mode-commit, file a follow-up issue in Epic 3.

### Rationale (vs alternatives)

- **`db.backup` vs `VACUUM INTO` vs raw file copy** — see "Why" note in § 2.
- **`saveBatch(outcomes: BuildOutcome[])` vs `saveBatch(transactions: Transaction[], hashes: string[])`** → pairing `Transaction` with its hash outside the `BuildOutcome` re-opens the index-coupling footgun that `FreshIngestItem` was meant to close. `BuildOutcome` already carries the transaction and the hash once § 1 lands — pass the whole thing.
- **Keep `save(transaction)` on the repo** → trims the diff and keeps round-trip tests intact. Batch and single-tx semantics are distinct use-cases; "remove if unused" can be a follow-up cleanup once the CLI stops touching `save()` entirely.
- **Migration 004 via table-rebuild vs app-level CHECK** → SQLite CHECK constraints can't be added to an existing column without a rebuild either. The rebuild is standard SQLite practice and both enforces the invariant *and* surfaces pre-existing NULL rows (if any) as a migration failure rather than a silent post-deployment bug.
- **Snapshot create before batch, remove after success, retain on failure** → matches the user story phrasing ("undo the import if something goes wrong") better than "retain always" (leaves a stale file per run) or "delete always" (no recovery artifact when the user needs it most).
- **Mixing sync + async in `SnapshotService`** avoided by making all three methods async → consistent interface; `runIngestCommand` is already async. Trivial overhead (Promise wrapping around sync fs calls for restore/remove).
- **Exit code inflation (3 new codes)** → use-case-specific codes let CI / scripted callers discriminate "snapshot failure" from "commit failure" from "parse failure". Existing 1 / 2 semantics from Story 2.4 unchanged.
- **`FreshIngestItem` as named type vs inline tuple** → clearer diagnostic messages and stable name in future refactors (e.g. if we ever add a `rank` or `source_line_number` field alongside the hash).

## Critical files to create / touch

| Path | Change |
| --- | --- |
| `src/core/ingest/types.ts` | **edit** — add `FreshIngestItem`; change `IdempotencyOutcome.fresh` type; add `idempotencyHash: string` to `BuildOutcome` |
| `src/core/ingest/idempotency-service.ts` | **edit** — zip fresh items with their hashes in the return value |
| `src/core/ingest/transaction-builder.ts` | **edit** — accept `readonly FreshIngestItem[]` in `buildAll`; thread hash through `build` + `makeOutcome` into `BuildOutcome.idempotencyHash` |
| `src/core/ports/transaction-repository.ts` | **edit** — add `BatchWriteOutcome` + `saveBatch` |
| `src/core/ports/snapshot-service.ts` | **new** — `SnapshotService` port (create / restore / remove, all async) |
| `src/infra/db/repositories/sqlite-transaction-repo.ts` | **edit** — prepared statement for INSERT-with-hash; implement `saveBatch` in one `db.transaction()` |
| `src/infra/db/node-sqlite-snapshot-service.ts` | **new** — `db.backup`-based adapter |
| `src/infra/db/migrations/004-idempotency-hash-not-null.sql` | **new** — rebuild migration tightening column + recreating unique index |
| `src/infra/db/migrator.ts` | **edit** — toggle `PRAGMA foreign_keys = OFF` around each migration's `db.transaction()` + `PRAGMA foreign_key_check` assertion post-commit (runner owns the dance — migration SQL has no PRAGMA lines; Plan-agent Decision 3 fix) |
| `src/cli/commands/ingest-command.ts` | **edit** — add `transactionRepository` + `snapshotService` + `dbPath` to `IngestCommandDeps`; replace terminal log with snapshot → saveBatch → remove flow; new exit codes 3 / 4 |
| `src/cli/utils/sanitize-sql-error.ts` | **new** — `sanitizeSqlError(msg: string): string` redacts `[0-9a-f]{32,}` tokens to `<redacted>`; unit-tested (P2 adopt #1) |
| `src/cli/program.ts` | **edit** — construct `SqliteTransactionRepository` + `NodeSqliteSnapshotService`; thread `resolvedDb` into deps |
| `tests/unit/core/ingest/idempotency-service.test.ts` | **edit** — assert `fresh` shape is `{ item, idempotencyHash }` + PII-safe pairing |
| `tests/unit/core/ingest/transaction-builder.test.ts` | **edit** — assert `BuildOutcome.idempotencyHash` = input hash |
| `tests/unit/cli/commands/ingest-command.test.ts` | **edit** — update mocks for new `fresh` shape; add snapshot + repo mocks |
| `tests/unit/cli/commands/ingest-command-flags.test.ts` | **edit** — same as above for flags path |
| `tests/integration/infra/db/sqlite-transaction-repo.test.ts` | **edit** — add `saveBatch` scenarios (happy + mid-batch failure + hash population) |
| `tests/integration/infra/db/node-sqlite-snapshot-service.test.ts` | **new** — create / restore / remove against a real temp-file DB |
| `tests/integration/infra/db/migration-004.test.ts` | **new** — migration 004 rebuilds table; NOT NULL enforced; FK-check clean; index recreated |
| `tests/integration/cli/ingest-commit.test.ts` | **new** — end-to-end: CLI → real temp DB, assert row count + hash populated + snapshot removed on success / retained on failure |
| `tests/perf/ingest-throughput.test.ts` | **new** — synth 1000-row CSV → full pipeline → <2000 ms wall-clock (closes #27) |
| `src/infra/csv/node-csv-parser.ts` | **no change** |

Reuses: `Result.ok/fail`, `Money`, `Transaction.create`, existing migrator scaffolding, `nodeUuidGen` + `nodeHashFn`, `SqliteHashRepository` (no change), `fast-check` (for perf arb). No new runtime deps.

## Gherkin scenarios

```gherkin
Feature: Atomic commit with snapshot (Story 2.5)

  Scenario: happy path — batch commits with snapshot then cleans up
    Given a confirmed batch of 3 BuildOutcomes (each with an idempotency_hash)
    And a SQLite DB at a temp path
    When runIngestCommand completes the commit stage
    Then snapshotService.create was invoked with snapshotPath === dbPath + ".bak"
      (literal suffix — not some other location) before any write
    And all 3 transactions are present in the transactions table
    And for every inserted row, idempotency_hash == hashFn(canonicalize(sourceItem))
    And all 6 entries are present in transaction_entries
    And the snapshot file is removed after the commit
    And (POSIX) the snapshot's file mode was 0o600 while it existed
    And exitCode was called with 0
    # fails if: snapshot skipped, partial writes, idempotency_hash stored as NULL,
    # idempotency_hash stored as a fixed placeholder (Plan-agent missing assertion),
    # snapshot written to anywhere other than dbPath + ".bak" (P1 adopt — convention
    # lock-in: epic docs + user story both stipulate the literal .bak suffix),
    # or snapshot retained after success

  Scenario: interactive re-categorisation preserves idempotencyHash
    Given a batch including one low-confidence outcome whose category the user changes
    When the user picks "change" then submits a new category
    Then the resolved outcome has confidence='high' AND the original idempotencyHash unchanged
    # fails if: the object-spread at runInteractiveLoop drops idempotencyHash
    # (Plan-agent Decision 1 lock-in)

  Scenario: mid-batch failure — ENTIRE batch rolled back, snapshot retained and intact
    Given a confirmed batch of 3 BuildOutcomes where outcome #2 carries a duplicate
      idempotency_hash within the batch (UNIQUE constraint violation)
    And a SQLite DB at a temp path seeded with 0 transactions
    When runIngestCommand completes the commit stage
    Then zero rows are written to transactions
    And zero rows are written to transaction_entries
    And the snapshot at ${dbPath}.bak still exists
    And snapshotService.restore(.bak, dbPath) followed by SELECT COUNT(*) FROM transactions
      returns 0 (confirming .bak content equals pre-batch state — not just the filename)
    And stderr contains "Commit failed (batch rolled back)"
    And stderr contains "Snapshot retained at"
    And exitCode was called with 4
    # fails if: outcome #1 persists while #2 fails, snapshot is removed on error,
    # or .bak exists but is a zero-byte file (torn-copy regression)

  Scenario: second failed run overwrites the first .bak
    Given a .bak file already exists from a prior failed run
    When runIngestCommand enters the commit stage and snapshot creation succeeds
    Then the new .bak replaces the old (by mtime / content)
    # fails if: create refuses when .bak already exists (would brick every retry)
    # documents the overwrite behaviour — the .bak is single-slot, not a history
    # (Plan-agent Decision 4 lock-in)

  Scenario: snapshot-creation failure — DB untouched, batch not attempted
    Given a SnapshotService mock that returns Result.fail on create
    When runIngestCommand reaches the commit stage
    Then TransactionRepository.saveBatch is never called
    And stderr contains "Snapshot failed"
    And exitCode was called with 3
    # fails if: saveBatch fires anyway, or exit code 0 is returned
    # (unit test uses a mock; platform-gated integration test exercises the real
    # "parent-dir-readonly" failure path on POSIX only)

  Scenario: snapshot path is a pre-planted symlink — symlink replaced, target untouched
    Given a regular file at /tmp/sentinel-target with content "SENTINEL"
    And a symlink exists at ${dbPath}.bak pointing at /tmp/sentinel-target
    When snapshotService.create resolves successfully
    Then ${dbPath}.bak is a regular file (fs.lstatSync(...).isSymbolicLink() === false)
    And the content at ${dbPath}.bak starts with SQLite's magic header bytes "SQLite format 3"
    And /tmp/sentinel-target still contains "SENTINEL" (symlink target not modified)
    And saveBatch is called normally and exitCode(0) is returned on full success
    # fails if: the adapter uses a naive lstat-then-write pattern (TOCTOU race between
    # the two syscalls lets an attacker swap in a symlink after the check); or if
    # db.backup follows the symlink and overwrites the attacker-chosen target with
    # SQLite bytes. The atomic-rename-from-randomised-tmp pattern must unlink the
    # pre-planted symlink *by name* (not by following it). (P3 finding #3 lock-in)

  Scenario: round-trip idempotency — second ingest of same CSV yields zero fresh
    Given a CSV with 3 rows
    And an empty DB
    When runIngestCommand is run to completion (first pass)
    Then SELECT idempotency_hash FROM transactions ORDER BY id returns exactly
      the 3 hashes that hashFn(canonicalize(csvRow)) produces (content-correctness,
      not just non-null)
    When runIngestCommand is run again against the same CSV (second pass)
    Then the second pass reports 0 new transactions, 3 duplicates
    And no additional rows are written
    And exitCode of the second pass is 0 (duplicates are not an error)
    # fails if: idempotency_hash is not populated in writes (dedup would never hit)
    # fails if: idempotency_hash stored is not the canonical hash (silent dedup miss)

  Scenario: --non-interactive flag is dry-run — no commit, no snapshot
    Given a valid CSV with 3 rows (all high-confidence) and matching config accounts
    And the --non-interactive flag is passed
    When runIngestCommand runs to completion
    Then SnapshotService.create is NEVER called
    And TransactionRepository.saveBatch is NEVER called
    And the DB has zero new transaction rows after the run
    And exitCode is 0 (batch summary only — dry-run semantics from Story 2.4)
    # fails if: --non-interactive triggers a real commit (silent data-writing regression)
    # documents dry-run semantics; CI-mode-commit is a future Epic-3 concern
    # (P1 adopt — promotes the slice-10-e case to a first-class Gherkin guarantee)

  Scenario: commit-failure stderr excludes idempotency_hash values (PII hygiene)
    Given a confirmed batch where outcome #2's idempotency_hash collides with a
      pre-existing DB row (forces SQLite UNIQUE constraint violation with the
      offending hex value in the raw error message)
    When runIngestCommand reaches the commit stage and saveBatch fails
    Then stderr contains "Commit failed (batch rolled back)"
    And stderr does NOT contain the hex hash string of outcome #2 (or any other
      outcome in the batch) verbatim
    And exitCode was called with 4
    # fails if: the raw better-sqlite3 UNIQUE-constraint error text is pass-through'd
    # into user-visible stderr. Hashes are transaction fingerprints — correlatable
    # across datasets — and count as PII per security-checklist.md. Implementation
    # must redact hex-like tokens from the SQL error before writing to stderr.
    # (P2 adopt — plugs the only remaining PII leak channel once saveBatch lands)

  Scenario (property): saveBatch populates idempotency_hash 1:1 for every outcome
    Given any array of BuildOutcomes of size 1..20, generated by fast-check with
      unique transaction ids and unique idempotency_hash values
    And a fresh DB at user_version 4
    When saveBatch persists the array
    Then for every outcome o in the input, SELECT idempotency_hash FROM transactions
      WHERE id = o.transaction.id returns exactly o.idempotencyHash
    And SELECT COUNT(*) FROM transactions WHERE idempotency_hash IS NULL returns 0
    # fails if: the INSERT binds idempotency_hash from the wrong outcome (e.g. off-by-one
    # in the loop), defaults to a placeholder, stores NULL, or writes the hash column
    # in non-1:1 order to rows. Core coverage invariant for hash-population (P3 finding
    # #2 lock-in). Runs against the real sqlite adapter — Core invariant on an infra
    # path, exercised via the port.

  Scenario: migration 004 — tightens idempotency_hash to NOT NULL
    Given a DB at user_version 3 (post-Story-2.2 schema — column nullable)
    When runMigrations is called
    Then user_version becomes 4
    And the transactions table rejects inserts with idempotency_hash = NULL
    And sqlite_master shows the recreated index IS a UNIQUE INDEX
      (assert via LIKE '%UNIQUE%' on sqlite_master.sql)
    And PRAGMA foreign_key_check returns zero rows
    # fails if: rebuild drops the UNIQUE attribute (Story 2.2 dedup would silently break)
    # fails if: NULL inserts still succeed, or FK check surfaces orphaned child rows

  Scenario: migration 004 is idempotent
    Given a DB at user_version 4 (already migrated)
    When runMigrations is called a second time
    Then user_version remains 4
    And no table rebuild occurs (row counts + mtime stable)
    # fails if: runner loses the version guard and re-runs the rebuild

  Scenario: migration 004 preserves children under foreign_keys=OFF toggle
    Given a seeded DB at user_version 3 with 1 transaction (hash='h1') + 2 entries
    When runMigrations runs the v3→v4 upgrade
    Then the 1 transaction row survives the rebuild with its hash intact
    And the 2 entry rows still reference the rebuilt parent (FK check passes)
    # fails if: migrator forgets the PRAGMA foreign_keys toggle (silent cascade-delete)
    # (Plan-agent Decision 3 lock-in — the critical-bug guard)

  Scenario: SnapshotService round-trip (integration, real temp-file DB)
    Given a SQLite DB at dbPath with 2 transactions written
    When snapshotService.create(dbPath, backupPath) resolves
    And two more transactions are written
    And snapshotService.restore(backupPath, dbPath) resolves
    Then the DB contains exactly the original 2 transactions
    And (POSIX) the snapshot had mode 0o600 at creation time
    And snapshotService.remove(backupPath) succeeds and the file no longer exists
    # fails if: backup is torn (WAL not coordinated), or chmod missed

  Scenario (perf): 1000-row end-to-end pipeline under 3 seconds (closes #27)
    Given a synthetic 1000-row BPCE CSV (generated by fast-check arbitraries)
    And an empty on-disk DB in tmpdir (NOT :memory: — the WAL fsync path is what scales)
    When runIngestCommand completes the full pipeline (parse → dedup → build → commit)
    Then wall-clock duration < 3000 ms (2000 ms local + 1.5× CI headroom)
    And SELECT COUNT(*) FROM transactions returns exactly 1000
    And SELECT COUNT(*) FROM transactions WHERE idempotency_hash IS NULL returns 0
    # dual gate: a buggy early-return could pass the time check with 0 rows committed
    # fails if: any pipeline stage regresses to O(N²), or saveBatch forgets the hash
```

## Plan for Sonnet (commit slices)

Target 10–12 commits. Every subject carries `(Story 2.5)`.

1. `chore(docs): maintenance audit + Story 2.5 plan (Story 2.5)`
   Commit this plan file + a body-line summary: "#26 closed before planning (Story 2.3 shipped the classifier); #27/#29 targeted by this story; #21 deferred (Risks); Plan-agent flipped FK-pragma placement (Decision 3) pre-implementation."

2. `test(ingest): filterNew + BuildOutcome carry idempotencyHash — failing (Story 2.5)`
   Update `tests/unit/core/ingest/idempotency-service.test.ts` to assert `fresh[i].item` + `fresh[i].idempotencyHash`; update `tests/unit/core/ingest/transaction-builder.test.ts` to assert `BuildOutcome.idempotencyHash` is the exact string supplied by the fresh-list entry. Also add the **"interactive re-categorisation preserves idempotencyHash"** test in `tests/unit/cli/commands/ingest-command.test.ts` (Plan-agent Decision 1 lock-in — guards against object-spread dropping the field). Update existing ingest-command tests to match the new `fresh` shape; TypeScript compile will fail before runtime (documented as **compile-red**, acceptable per Plan-agent slice-note).

3. `feat(ingest): thread hash through IdempotencyOutcome + BuildOutcome — minimal green (Story 2.5)`
   Introduce `FreshIngestItem`; change `IdempotencyOutcome.fresh` type; zip hashes in `filterNew`; change `TransactionBuilder.buildAll` signature + `makeOutcome` signature; update `runIngestCommand` to pass `{ item, idempotencyHash }` through `buildAll`, and preserve `idempotencyHash` in the object-spread at `resolved[idx] = { ...outcome, category: ..., confidence: 'high' }`. Still stops at the "DB writes pending" log — writes land in slice 11.

4. `test(db): migration 004 — idempotency_hash NOT NULL + FK-safe rebuild — failing (Story 2.5)`
   New `tests/integration/infra/db/migration-004.test.ts`:
   - (a) start at user_version 3 → run migrations → expect user_version 4;
   - (b) `INSERT INTO transactions (…NULL hash…)` raises `NOT NULL constraint failed`;
   - (c) `sqlite_master.sql` for `idx_transactions_idempotency_hash` contains `UNIQUE` (not just exists);
   - (d) `PRAGMA foreign_key_check` returns zero rows after migration;
   - (e) running migrations a second time at v4 is a no-op (idempotent);
   - (f) **rebuild preserves children under FK-off toggle** — seed v3 DB with 1 tx (hash='h1') + 2 entries, migrate, assert the 1 tx + 2 entries survive (Plan-agent Decision 3 lock-in);
   - (g) **inside-tx FK check rolls back on failure** (P3 #4 lock-in) — using a stub migration that deliberately leaves a dangling FK, run the migrator and assert that on failure `user_version` remains 3 (not 4) and the table's schema remains the v3 shape. Proves the `foreign_key_check` runs inside the same `db.transaction()` as the DDL + `PRAGMA user_version` bump, so a failed check rolls back both the schema changes and the version marker atomically.

5. `feat(db): migration 004 rebuild + FK pragma dance in migrator — minimal green (Story 2.5)`
   Add `src/infra/db/migrations/004-idempotency-hash-not-null.sql` (no PRAGMA lines inside — runner owns those). Update [src/infra/db/migrator.ts](src/infra/db/migrator.ts) to toggle `PRAGMA foreign_keys = OFF` around every migration + run `PRAGMA foreign_key_check` post-commit, throwing if non-empty (see § 4 above). Toggle is connection-wide defense-in-depth; restoring prior value in `finally` keeps the migrator side-effect-free.

6. `test(db): TransactionRepository.saveBatch writes batch + hash — failing (Story 2.5)`
   Extend `tests/integration/infra/db/sqlite-transaction-repo.test.ts`:
   - (a) happy-path 3 outcomes → 3 header rows with `idempotency_hash = expected_for_each_item` + 6 entry rows (assert hash equality against `hashFn(canonicalize(item))`, not just non-null);
   - (b) outcome #2 violates Transaction invariant → entire batch rolled back (zero rows in either table);
   - (c) duplicate hash across the same batch → whole batch rolled back by the UNIQUE constraint;
   - (d) pre-existing hash in DB collides with a new outcome's hash → entire batch rolled back (UNIQUE index catches cross-batch collisions too);
   - (e) **`fast-check` property** (P3 #2 lock-in): for any `BuildOutcome[]` of size 1..20 with unique ids and unique hashes, after `saveBatch` every row's `idempotency_hash` equals the source outcome's `idempotencyHash` — i.e. the INSERT binds the hash column 1:1, not by position drift or placeholder. Uses `fc.uniqueArray` on ids/hashes to keep the arbitrary inside the UNIQUE-index envelope.
   No `saveBatch` method exists yet — all five fail.

7. `feat(db): saveBatch persists batch + hash in one SQL transaction — minimal green (Story 2.5)`
   Add `saveBatch` to the port + implementation. New prepared statement `insertHeaderWithHash`. Body is `const write = db.transaction(() => { for const o of outcomes: insertHeader.run(o.transaction.id, o.transaction.occurredAt, o.transaction.description, o.idempotencyHash); for const e of o.transaction.entries: insertEntry.run(...); })`. Same `try/catch → Result.fail(String(err))` pattern as existing `save`.

8. `test(infra): SnapshotService round-trip + symlink-safety + chmod — failing (Story 2.5)`
   New `tests/integration/infra/db/node-sqlite-snapshot-service.test.ts`:
   - round-trip: seed DB (2 tx) → `create` → write 2 more → `restore` → assert only original 2 → `remove` → file gone;
   - `remove` on absent file = no-op `Result.ok`;
   - (POSIX) the snapshot file was mode 0o600 at creation time;
   - **symlink pre-planted at path** — pre-create `/tmp/sentinel-target` with content "SENTINEL"; pre-create a symlink at `snapshotPath` → `/tmp/sentinel-target`; call `create`; assert `fs.lstatSync(snapshotPath).isSymbolicLink() === false` (symlink replaced by regular file); assert snapshot content starts with SQLite magic `"SQLite format 3"`; assert `/tmp/sentinel-target` still reads "SENTINEL" (attack-target untouched). This proves the atomic-rename-from-randomised-tmp pattern (P3 #3) — not a lstat-then-write check which would have a TOCTOU race.
   - **overwrite-on-create** — pre-create a regular file at the snapshot path; `create` overwrites (Plan-agent Decision 4 lock-in — second-failed-run semantics);
   - **tmp cleanup on backup failure** — simulate `db.backup` rejection (e.g. provide a snapshotPath under a non-existent parent dir and a pre-existing tmp dir we control); assert no `${snapshotPath}.tmp.*` files remain.

9. `feat(infra): NodeSqliteSnapshotService using db.backup + atomic-rename + chmod — minimal green (Story 2.5)`
   Add port + adapter. Constructor takes the open `Database` (no re-open). `create` implementation (per § 2 spec):
   1. compute `tmpPath = ${snapshotPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}` (same-dir so rename is atomic on POSIX; randomised suffix means tmp path is not guessable);
   2. `await this.db.backup(tmpPath)` — on rejection: best-effort `fs.unlinkSync(tmpPath)` (guarded by existsSync) then `Result.fail(String(err))`;
   3. on POSIX (`process.platform !== 'win32'`), `fs.chmodSync(tmpPath, 0o600)` with an inline comment *"Windows has no POSIX permission model — the chmod skip is intentional, not a bug"*;
   4. `fs.renameSync(tmpPath, snapshotPath)` — atomic; unlinks any pre-existing file or symlink at target *by name* without following it;
   5. any thrown step → unlink tmp if present, return `Result.fail`. No path leak beyond "snapshot failed".

   `restore` = `fs.copyFileSync(snapshotPath, dbPath)` wrapped in Promise. `remove` = `unlinkSync if existsSync` wrapped in Promise.

10. `test(cli): commitBatch + ingest-command terminal flow — failing (Story 2.5)`
    Update `tests/unit/cli/commands/ingest-command.test.ts` (+ flags test) with new deps (`transactionRepository`, `snapshotService`, `dbPath`) and five new scenarios:
    - (a) happy path → `create` / `saveBatch` / `remove` called in order, exit 0, stderr contains "N transaction(s) committed";
    - (b) `saveBatch` fails → `remove` NOT called, stderr "rolled back" + "Snapshot retained at", exit 4;
    - (c) `create` fails → `saveBatch` NOT called, exit 3;
    - (d) `remove` fails after successful `saveBatch` → exit 0 (non-fatal warning);
    - (e) `--non-interactive` path does NOT call `saveBatch`/`create`/`remove` (dry-run semantics preserved from Story 2.4).
    Also add `tests/integration/cli/ingest-commit.test.ts` running the whole chain against a real temp-file DB with one CSV fixture — asserts `.bak` absent after success, row count correct, hashes are the canonical ones.

11. `feat(cli): commitBatch helper + wire snapshot + saveBatch into runIngestCommand — minimal green (Story 2.5)`
    Extract `commitBatch(outcomes, deps)` per § 5. Note: this extraction is **line-neutral for `runIngestCommand`** (swaps one log line for one call). `runIngestCommand` stays at its current 97 LOC — slice 13's `loadAndParse` extraction is the one that finally brings it under the 60-LOC Story-2.3-retro trigger. Construct `SqliteTransactionRepository` + `NodeSqliteSnapshotService` in `program.ts`; pass `resolvedDb` as `dbPath`.

12. `test(perf) + feat(perf): 1000-tx end-to-end throughput <3s on tmpdir DB (Story 2.5)` (closes #27)
    New `tests/perf/ingest-throughput.test.ts` under a `perf` describe-tag. Use `fast-check` to synth a 1000-row BPCE CSV in memory. Call the full pipeline through `runIngestCommand` against an **on-disk tmpdir DB** (`fs.mkdtempSync` + `path.join(tmp, 'perf.db')` — NOT `:memory:`, since the WAL fsync path is the one that matters for the NFR).
    - Assert (i) wall-clock `performance.now()` delta < 3000 ms (2000 ms local target + 1.5× CI headroom; document measured local value in the test comment), (ii) `COUNT(*) FROM transactions = 1000`, (iii) `COUNT(idempotency_hash IS NULL) = 0`.
    - **Explicit `afterAll` cleanup** (P3 #5): capture the tmpdir path in a closure and `fs.rmSync(tmp, { recursive: true, force: true })` so repeated local runs don't accumulate `.db`, `.db-wal`, `.db-shm`, `.bak` detritus in `/tmp`. `close()` the `Database` handle first.
    - Add `"test:perf": "vitest run tests/perf/"` to `package.json` scripts. Expected green-on-landing if slice 11 already works — acceptable per Plan-agent slice-concern; ship in one commit rather than separate test/feat pair.

13. `refactor(cli): extract loadAndParse — bring runIngestCommand under 60 LOC (Story 2.5)` — **mandatory, not empty** (P3 finding #1).
    Story 2.4 retro logged `runIngestCommand` at 97 LOC against the 60-LOC Story-2.3-retro trigger; slice 11's `commitBatch` extraction is line-neutral (one log → one call). This slice is the one that closes the gap by extracting the parse-stage plumbing into a dedicated helper.
    - **Shape:**
      ```ts
      async function loadAndParse(
        opts: IngestCommandOptions,
        deps: Pick<IngestCommandDeps, 'configService' | 'csvParser' | 'pickSourceAccount' | 'readFile' | 'stderr' | 'exitCode'>,
      ): Promise<{ config: AppConfig; account: AccountConfig; parseOutcome: ParseOutcome } | null>
      ```
      Takes over [ingest-command.ts:42–82](src/cli/commands/ingest-command.ts:42) (config load → pickSourceAccount → readFile → csvParser.parse → parse-error stderr print). Returns `null` *after* writing stderr + calling `exitCode(n)` on any failure branch — semantically identical to the existing inline flow, just factored out.
    - **Behaviour-preserving contract:** every stderr line and every exitCode value stays byte-identical to the pre-extraction behaviour. The five existing error-path unit tests in `ingest-command.test.ts` (config-fail, account-fail, readFile-fail, parseResult-fail, parse-errors-printed) re-exercise the extracted helper transparently — no new tests needed.
    - **Target:** `runIngestCommand` ≤ 55 LOC post-extraction (loadAndParse call + null check + idempotencyResult + buildResult + buildFailed print + summary print + branch to non-interactive or interactive+commitBatch).
    - **Out-of-scope sweeps:** dead `save()` on the repo (only used by findById round-trip tests) — note for a future cleanup story but keep here. Do NOT also refactor `runNonInteractive` or `runInteractiveLoop` in this slice — they are already under 50 LOC each and further shuffling blows the behaviour-preserving contract.
    - Verification: `npm test -- ingest-command` all green; `wc -l` on the `runIngestCommand` function body confirms ≤ 55 LOC.

14. `chore(retro): Story 2.5 retrospective + CLAUDE.md updates (Story 2.5)`
    Final retrospective file at `docs/retrospectives/story-2.5.md`. Also refresh CLAUDE.md § 1 "Current position" line to reflect Epic 2 complete.

**Estimated 10–12 commits delivered.** Slices 2+3 land as compile-red → minimal-green (documented). Slice 12 ships as a single test+feat pair (the Plan-agent's "slice 13 was waste" adjustment).

### Deps pre-authorised

None. All runtime + test deps (`better-sqlite3`, `fast-check`, `vitest`) are already present.

### Verification (end-to-end, pre-merge)

- `npm run lint && npm run build && npm test` — all green.
- `npm test -- tests/perf/` — throughput passes <2 s.
- **Manual smoke test (local only, not committed):** `./bin/accounting migrate --db-path /tmp/s25.db && ./bin/accounting ingest -f ~/Downloads/<real-bpce-file>.csv --db-path /tmp/s25.db` — choose "save batch" at the prompt; inspect `/tmp/s25.db` with `sqlite3` (`SELECT COUNT(*), COUNT(idempotency_hash IS NULL) FROM transactions;`); re-run ingest on the same file → assert "0 new transactions, N duplicates"; assert `.bak` is absent after a clean run. **Do not commit the smoke DB or real data.**
- Branch coverage: 100% of `src/core/ingest/` and the new snapshot port (Core coverage gate).
- After merge: close #27 (perf benchmark) + #29 (NOT NULL tightening) in the PR body. Update CLAUDE.md § 1 current position ("Next story: Epic 3 planning / retro / product decision").

## Risks & deferrals (to log at Plan review)

- **Issue #21 (dbPath path-traversal validation)** — trigger went live in Story 2.4 and the `.bak` path doubles the surface. Deferred from Story 2.5 scope to keep this story at its AC (7 Gherkin scenarios is already wide). **Action:** leave #21 open with a comment linking this PR; next Epic-3 planning session re-evaluates whether to schedule it as a dedicated security pass or fold into the first Epic-3 story.
- **`save(transaction)` remains on the repo API** — unused by production paths after Story 2.5 (CLI uses `saveBatch`). Candidate for a future cleanup story once we're sure no test path relies on it. **Not filed as an issue** — genuine dead-code removal; will be noticed and trimmed naturally.
- **Migration 004 + pre-existing rows with NULL hash** — pre-Story-2.5 DBs have zero transactions, so the rebuild is a schema swap. If a user somehow has orphaned NULL rows (shouldn't happen; documented in the PR body), the migration will fail atomically with `NOT NULL constraint failed` and the DB remains at version 3. Safe: no data loss, surfaces the inconsistency loudly.
- **`--non-interactive` still writes nothing (dry-run semantics)** — consistent with Story 2.4's interpretation. File a follow-up issue if user asks for CI-mode commit (likely Epic 3).
- **Snapshot file permissions** — the `.bak` inherits default umask on POSIX, which may be `0o644`. The live DB is chmod'd to `0o600` in [sqlite-client.ts:15](src/infra/db/sqlite-client.ts). The `.bak` should match — `fs.chmodSync(snapshotPath, 0o600)` after `db.backup`. Added to the `create` implementation spec (§ 2 adapter).
- **Throughput benchmark environment fragility** — CI hardware varies. Threshold set at 3000 ms (2000 ms local target + 1.5× headroom per Plan-agent Decision 5). `test:perf` wired as a separate `package.json` script so the benchmark has a stable invocation; CI can opt-in by running `npm run test:perf`. If the threshold still flakes on ARM runners, revise in a follow-up rather than in this PR.
- **`.bak` semantics are single-slot, not historical** — if two runs fail in a row, the second run's snapshot overwrites the first's. This is documented as "the `.bak` reflects the DB state immediately before the *most recent* ingest attempt; it is not a long-term backup". Timestamped multi-slot retention (`.bak.<epoch>`) is a valid future evolution but out of Story 2.5 scope. Plan-agent Decision 4 documentation item.
- **Symlink-safety at the snapshot path** — narrow mitigation for the new write/remove TOCTOU pair. Full #21 `dbPath` traversal validation still deferred.
- **FK pragma dance applies to every migration** — the migrator toggle wraps *every* migration, not just the rebuild. Earlier migrations 001–003 don't need it, but the overhead is a single PRAGMA per migration start/end — negligible. Benefit: makes the pattern uniform so future migrations can't reintroduce Decision 3's silent cascade-delete bug.
- **Snapshot behaviour on `:memory:` DB** — `db.backup` against an in-memory DB works (backs up to a file). Tests may want to exercise both paths. Noted.
