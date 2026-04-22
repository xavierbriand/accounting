# Epic 2, Story 2.2 — Idempotency Service

## Context

Story 2.1 shipped a CSV parser producing `IngestItem { sourceAccount, occurredAt, description, direction, amount: Money }` objects. Story 2.2 adds duplicate detection so the user can re-import overlapping CSVs (Jan–Mar then Feb–Apr) without writing the February entries twice. Per CLAUDE.md § 6.6 (one PR per story), this plan covers **Story 2.2 only**. Stories 2.3 (TransactionBuilder + auto-tagger) and 2.5 (atomic commit with snapshot) will each land as their own PR.

**Problem.** Given a list of `IngestItem`s, compute a deterministic hash per item, query the ledger for hashes that already exist, return only the new items. No ledger writes yet — that's Story 2.5's job; we only populate the infrastructure (hash column + query path). First-run dedup returns everything unchanged because the ledger is empty; once Story 2.5 writes transactions with hashes, subsequent runs filter correctly.

**Problem (refined).** Story 2.1's retro explicitly flagged that the hash recipe must include `sourceAccount`, not just "Date + Amount + Description" as written in Story 2.2's AC. Rationale: the same merchant charging identical amounts to two different cards on the same day would collide otherwise. This plan bakes `sourceAccount` into the hash from commit 1.

**Maintenance sub-loop** (pre-planning, CLAUDE.md § 6.7): `npm audit` clean (0 vulns), zero open Dependabot PRs, 11 open issues (all `deferred-suggestion` / `dependencies` — none blocking). **One stale doc detected**: CLAUDE.md § 1 "Current position" still reads `Epic 1 ... Next story: 1.3` from Story 1.2 era; each retro is meant to refresh it and Story 2.1's missed it (logged as that retro's action item D). Fold the one-line refresh into this story's first commit (`chore(docs)`).

## Story (verbatim from [docs/epics.md:142–153](docs/epics.md))

> As a User, I want the system to recognize transactions I've already imported, so that I can upload overlapping CSVs (e.g., Jan-March, then Feb-April) without creating duplicates.
>
> **AC1 (deterministic hash):** calculates a deterministic hash for each item (Date + Amount + Description — refined per Story 2.1 retro to also include `sourceAccount` + `direction` + `currency`).
> **AC2 (ledger query):** queries the existing ledger to filter out hashes that already exist.
> **AC3 (returns only new):** returns ONLY the new items to be processed.

FR coverage: **FR7** (idempotency). Walks QA invariant "No silent data loss — ingesting the same CSV twice produces zero new transactions" ([quality-assurance.md:15](docs/quality-assurance.md)).

## Selected solution

One Core service + a pure Core canonicalizer + one Infra port + one Infra adapter + one migration.

- **Hash recipe** (canonical input string): six fields joined by `\u001F` (ASCII Unit Separator, literally designed for this purpose):
  `${sourceAccount}\u001F${occurredAt}\u001F${direction}\u001F${amount.cents}\u001F${amount.currency}\u001F${description}`. US has no legitimate meaning in any of these fields in any locale; the chance of a bank description containing it is effectively zero. If one ever does, the canonicalizer rejects the item (loud failure, not silent collision). This replaces the first draft's `|` delimiter per the Plan agent's pushback: US is exactly as simple but radically less likely to ever reject a real row.
- **Description normalization** (before canonicalization, per the Plan agent's P2 catch): Unicode NFC + trim + collapse internal whitespace runs to single spaces. Two CSV exports of the same transaction from different months can differ in trailing spaces, NBSPs (`\u00A0`), or decomposed accents — without normalization those would hash differently and the re-import would silently succeed (the exact silent-data-loss failure mode QA rules out). Normalization is pure and testable: a property test proves `hash(item) == hash(item with noisy whitespace / NBSP / decomposed accents)`.
- **Hash algorithm:** SHA-256 hex digest (64 chars). Node's built-in `crypto.createHash('sha256')`. No new deps.
- **Where the hash lives:** nullable `idempotency_hash TEXT UNIQUE` column on the existing `transactions` table via migration `003-idempotency-hash.sql`. SQLite's `UNIQUE` already allows multiple `NULL`s — no partial index, no empty-string sentinel, no future tightening migration needed. Once Story 2.5 populates the column on every write, the discipline is enforced by code; a later `ADD CHECK (idempotency_hash IS NOT NULL)` migration can lock it in permanently. (Revised per Plan agent pushback on the initial `DEFAULT '' + partial unique index` idiom, which would have silently allowed collisions on empty strings.)
- **Core canonicalizer (not a port — pure module):** `src/core/ingest/canonicalize.ts`. Pure function `canonicalize(item: IngestItem): Result<string>`. Handles NFC + whitespace normalization + US-delimiter join. Returns `Result.fail` if any field contains `\u001F` (the error's `reason` names the field but never echoes its content — PII safety). Direct import by `IdempotencyService`; no port, no DI — canonicalization is pure Core with no IO.
- **Core service:** `IdempotencyService` at `src/core/ingest/idempotency-service.ts`. Constructor DI on the two outside dependencies — the `HashFn` port (crypto) and the `HashRepository` port (DB). Single method: `filterNew(items: readonly IngestItem[]): Result<IdempotencyOutcome>` returning `{ fresh: readonly IngestItem[]; duplicates: readonly IngestItem[] }`. Pure orchestration: call `canonicalize` directly, pass canonical string to `hashFn`, call `repo.listKnownHashes`, split input by membership. Both output arrays preserve input order.
- **Core port — `HashFn`:** function type `(canonical: string) => string`. Takes a canonical string (already validated by `canonicalize`), returns a 64-hex-char SHA-256 digest. Cannot fail — crypto on a well-formed string never fails. This narrows the responsibility: canonicalization lives in Core (pure, testable without a port), the port exists solely to keep Node's `node:crypto` out of Core. Lives at `src/core/ports/hash-fn.ts`. Revised per Plan agent: originally conflated canonicalization + hashing; split is cleaner.
- **Core port — `HashRepository`:** single method `listKnownHashes(candidateHashes: readonly string[]): Result<ReadonlySet<string>>`. Narrow bounded query (see Rationale below). Lives at `src/core/ports/hash-repository.ts`.
- **Infra — `NodeHashFn`:** implements `HashFn` via `crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')`. Stateless, thin. Lives at `src/infra/crypto/node-hash-fn.ts`.
- **Infra — `SqliteHashRepository`:** implements `HashRepository`. Generates a single `SELECT idempotency_hash FROM transactions WHERE idempotency_hash IN (?, ?, …)` per call with `candidates.length` placeholders. No batching, no statement caching — SQLite compile-time for a `SELECT` this simple is microseconds; real-world `filterNew` calls will be 50–500 candidates from one CSV. The hard cap is SQLite's `SQLITE_MAX_VARIABLE_NUMBER` (32766 in current `better-sqlite3` builds, floor of 999 in older). Enforce the floor defensively: if `candidates.length > 999`, return `Result.fail` with a hint to split (future story can add real chunking when someone actually feels it). Mirrors the prepared-statement pattern from [sqlite-transaction-repo.ts](src/infra/db/repositories/sqlite-transaction-repo.ts). Revised per Plan agent: originally specified batching at 500 as "premature optimisation"; YAGNI. Lives at `src/infra/db/repositories/sqlite-hash-repository.ts`.

### Types

```ts
// src/core/ingest/types.ts — addition
export interface IdempotencyOutcome {
  readonly fresh: readonly IngestItem[];       // items not yet in the ledger, input order preserved
  readonly duplicates: readonly IngestItem[];  // items already in the ledger, input order preserved
}
```

### Port signatures

```ts
// src/core/ports/hash-fn.ts
export type HashFn = (canonical: string) => string;   // cannot fail — input is already validated

// src/core/ports/hash-repository.ts
export interface HashRepository {
  listKnownHashes(candidateHashes: readonly string[]): Result<ReadonlySet<string>>;
}
```

### Canonicalizer signature (pure Core, no port)

```ts
// src/core/ingest/canonicalize.ts
export function canonicalize(item: IngestItem): Result<string>;
// NFC + trim + collapse whitespace on description; US-joined; Result.fail if any field contains \u001F
// (error.reason names the field but never its content)
```

### IdempotencyService signature

```ts
// src/core/ingest/idempotency-service.ts
export class IdempotencyService {
  constructor(private readonly hash: HashFn, private readonly repo: HashRepository) {}
  filterNew(items: readonly IngestItem[]): Result<IdempotencyOutcome> { … }
}
```

### Migration

```sql
-- src/infra/db/migrations/003-idempotency-hash.sql
ALTER TABLE transactions ADD COLUMN idempotency_hash TEXT UNIQUE;
PRAGMA user_version = 3;
```

**Why nullable `UNIQUE`?** SQLite's `UNIQUE` constraint allows multiple `NULL` values. That's the standard idiom for "optional unique identifier" — no `NOT NULL DEFAULT ''` sentinel, no partial index, no future tightening needed. Story 2.5 will populate every write with a real hash; once every row has one, a later migration can `ADD CHECK (idempotency_hash IS NOT NULL)` to lock it in. For now, the empty ledger means all existing rows (zero of them) get `NULL`, and any future `NULL`s are legal.

**Migration-runner idempotency** is enforced by the `PRAGMA user_version = 3` step: the runner skips files whose target pragma ≤ current. An integration test in slice 6 re-runs the migrator on an already-migrated DB and asserts the ALTER doesn't fire twice (which SQLite would reject with "duplicate column name").

**Alternative rejected:** separate `transaction_hashes` table. Doesn't add flexibility today (1:1 with `transactions`, same lifetime), adds a JOIN to every lookup, and costs one more migration to remove if we regret it later.

**Alternative rejected:** recreate `transactions` table via create/copy/drop (SQLite's canonical constraint-change pattern). Our change is additive — no column type changes, no constraint alterations on existing columns — so `ADD COLUMN` is safe and simpler.

## Rationale (vs alternatives)

- **Canonicalizer as pure Core module + `HashFn` as a thin Infra port** vs a single `HashFn(item) → Result<string>` port. Plan agent caught this: canonicalization has no IO and doesn't need a port; only crypto does. Keeping canonicalization in Core as a plain function makes it unit-testable without mocks and keeps `HashFn` tiny (`(string) → string`). Revised during plan stress-test.
- **One port (`HashFn`) for crypto + one port (`HashRepository`) for DB.** ISP — pure-compute and IO are orthogonal. Mocking one without the other in unit tests is trivial.
- **Hash column on `transactions` via `ADD COLUMN ... UNIQUE` (nullable)** vs `NOT NULL DEFAULT '' + partial unique index` (original draft) vs separate `transaction_hashes` table. Nullable `UNIQUE` is SQLite's standard idiom — multiple NULLs allowed, real hashes uniquely enforced. The `DEFAULT ''` draft was fragile (silent empty-string collisions absent the partial index). Separate table is YAGNI (1:1, same lifetime). Revised during plan stress-test.
- **Narrow `listKnownHashes(candidates)` vs `listAllHashes()`.** Bounded query; returning the full ledger's hash set is O(ledger size) and scales badly as the ledger grows past typical in-memory sizes.
- **US (`\u001F`) delimiter + reject-on-collision** vs `|` (original draft) vs TLV/JSON encoding. US is designed for this purpose in the ASCII spec; it has no legitimate use in any of the canonicalized fields in any locale. Strictly less risk than `|` with zero code-complexity difference. JSON would introduce serialization-order concerns (key ordering, whitespace, number precision) that defeat determinism. Revised during plan stress-test.
- **NFC + trim + whitespace-collapse normalization of `description`** before canonicalization. Without this, the same real transaction imported in two separate CSV exports (different months, different encodings, different trailing-whitespace conventions) hashes differently and the re-import succeeds silently — the exact silent-data-loss failure mode QA § "No silent data loss" forbids. Added per Plan agent's P2 catch.
- **Canonicalizer rejection errors name the field but never echo content.** Otherwise a description containing US could appear verbatim in an error message the user sees — a PII leak. Same principle as Story 2.1's per-row error formatter.
- **SHA-256 vs SHA-1 vs xxhash.** SHA-256 is Node-built-in and collision-free for any realistic ledger size. SHA-1 is faster but signals a weaker stance. xxhash needs a dep. Not worth optimising until someone actually feels hash time at ingestion.
- **Include `sourceAccount`, `direction`, `currency` in the hash (not just Date + Amount + Description per Story 2.2's AC wording).** Retro finding from Story 2.1: same merchant charging identical amounts to two different cards same day collides without `sourceAccount`. Same amount inflow vs outflow (e.g., refund) collides without `direction`. Same integer cents in EUR vs USD collides without `currency`. These edge cases are rare but each is a silent-data-loss risk.
- **Preserve input order in `fresh` / `duplicates` arrays.** Downstream stories (2.3 TransactionBuilder, 2.4 CLI display) present items in their CSV order; a Set would destroy that. `filterNew` is O(n).
- **No batching / no statement caching today.** `filterNew` calls in practice come from a single-CSV import (50–500 candidates). SQLite prepared-statement compilation at that size is microseconds. The 999-variable floor is the hard cap — enforce it defensively with a `Result.fail` and split if-and-when someone actually hits it. Revised during plan stress-test (original draft batched at 500 as premature optimisation).

## Critical files to create / touch

| Path | Change |
| --- | --- |
| `CLAUDE.md` | **edit** — refresh § 1 "Current position" line to `Epic 2 ... Next story: 2.3 — Transaction Builder & Auto-Tagging Domain Service` (done as a `chore(docs)` commit at the top of the branch, per Story 2.1 retro action) |
| `src/infra/db/migrations/003-idempotency-hash.sql` | **new** — `ALTER TABLE` + partial unique index + `PRAGMA user_version = 3` |
| `src/core/ingest/types.ts` | **edit** — add `IdempotencyOutcome` |
| `src/core/ingest/canonicalize.ts` | **new** — pure canonicalizer: NFC + trim + whitespace-collapse + US-join; `Result.fail` with field-name-but-not-content on US-in-field |
| `src/core/ports/hash-fn.ts` | **new** — `HashFn` function type: `(canonical: string) => string` |
| `src/core/ports/hash-repository.ts` | **new** — `HashRepository` interface with `listKnownHashes` |
| `src/core/ingest/idempotency-service.ts` | **new** — `IdempotencyService` class; depends on canonicalizer (direct import) + `HashFn` port + `HashRepository` port |
| `src/infra/crypto/node-hash-fn.ts` | **new** — SHA-256 adapter (thin wrapper over `crypto.createHash`) |
| `src/infra/db/repositories/sqlite-hash-repository.ts` | **new** — single dynamic `IN (…)` query, defensive 999-variable cap |
| `tests/unit/core/ingest/canonicalize.test.ts` | **new** — normalization invariants (NBSP, NFC, whitespace), US-in-field rejection, PII-safety of error messages (property test: no field content appears in any error) |
| `tests/unit/core/ingest/idempotency-service.test.ts` | **new** — mocked ports; property tests for order preservation + re-ingest idempotency |
| `tests/unit/infra/crypto/node-hash-fn.test.ts` | **new** — real SHA-256; determinism; 64-hex-char output |
| `tests/integration/infra/db/sqlite-hash-repository.test.ts` | **new** — real SQLite; migration 003 idempotency (re-run no-op); 0 / 1 / 500 / 999 candidate sizes; 1000-candidate `Result.fail` on the defensive cap |

Reuses: `Result.ok/fail` ([src/core/shared/result.ts:36](src/core/shared/result.ts)), `IngestItem` + `Money` ([src/core/ingest/types.ts:11](src/core/ingest/types.ts)), the prepared-statement pattern from `sqlite-transaction-repo.ts`, and the migration-runner idempotency via `PRAGMA user_version`.

**Not in scope:** *no* hash writes (Story 2.5 owns that when transactions are actually committed), *no* CLI command (Story 2.4), *no* snapshot/atomic commit (Story 2.5), *no* auto-tagging (Story 2.3). The hash column exists and is queryable; it will be empty until Story 2.5 populates it.

## Gherkin scenarios

Story 2.2 has no CLI surface — scenarios map 1:1 to unit + integration tests. Each carries a "fails if …" note per Story 1.3 retro action E.

```gherkin
Feature: Idempotency filtering

  Scenario: AC1 — deterministic hash for an IngestItem
    Given an IngestItem with sourceAccount='main-1', occurredAt='2026-04-20T00:00:00+02:00',
      direction='outflow', amount=8550 EUR, description='SUPERMARCHE FICTIF'
    When I hash it twice
    Then both hashes are identical 64-hex-char strings
    # fails if: hash input omits any of sourceAccount / occurredAt / direction / cents / currency / description,
    # or if the algorithm is non-deterministic

  Scenario: AC1 — hash discriminates on every input field (property)
    Given two IngestItems that differ in exactly one field (sourceAccount | occurredAt | direction | cents | currency | description)
    When I hash both
    Then the two hashes are different
    # fails if: one of the fields is silently dropped from canonicalization (Story 2.1 retro's worry case)

  Scenario: canonicalizer normalizes description noise (NFC + trim + whitespace collapse)
    Given two IngestItems that differ only in: trailing whitespace on description, presence of NBSP (\u00A0),
      or decomposed vs composed accents (é as 'é' NFC vs 'e' + combining-acute NFD)
    When canonicalize runs on both
    Then both produce identical canonical strings, and therefore identical hashes
    # fails if: description is hashed raw — the same real transaction re-imported from a different CSV export
    # produces different hashes → silent data loss (QA § No silent data loss)

  Scenario: canonicalizer rejects a field containing the US delimiter
    Given an IngestItem whose description contains \u001F
    When canonicalize runs
    Then Result.fail with field='description' in the reason
    And the reason does NOT echo the description content (PII safety)
    # fails if: the canonicalizer silently escapes or concatenates (collision risk),
    # OR the error message includes the raw field content (PII leak)

  Scenario: AC2 — HashRepository returns only the subset of candidate hashes already in the ledger
    Given the ledger already contains 3 transactions with specific idempotency_hash values h1, h2, h3
    And I ask the repository for the known subset of {h1, h4, h5, h2, h6}
    When listKnownHashes runs
    Then the returned set is exactly {h1, h2}
    # fails if: the repository returns all hashes in the ledger regardless of query,
    # or returns hashes that do not exist, or omits a hash that does exist

  Scenario: AC3 — IdempotencyService returns only new items
    Given a list of 5 IngestItems where items at indices 1 and 3 match ledger hashes
    When filterNew runs
    Then outcome.fresh contains items at indices 0, 2, 4 in that order
    And outcome.duplicates contains items at indices 1 and 3 in that order
    # fails if: ordering is lost (Set-based), a duplicate leaks into fresh, or an item is double-counted in both arrays

  Scenario: same CSV ingested twice produces zero new items on the second run
    Given an empty ledger and 5 IngestItems
    When I call filterNew (first run) — result.fresh = all 5
    And I simulate their write by seeding the repository with their hashes
    And I call filterNew again (second run) with the same 5 IngestItems
    Then second-run outcome.fresh.length == 0
    And second-run outcome.duplicates.length == 5
    # fails if: re-ingest still returns items as fresh (violates FR7 / QA "no silent data loss on double import")

  Scenario: candidate-count at and beyond SQLite's 999-variable floor
    Given the ledger contains 250 transactions with known hashes
    When I ask listKnownHashes with 0, 1, 500, 999 candidates
    Then the result contains exactly the subset that actually exists
    And when I ask with 1000 candidates
    Then the repository returns Result.fail hinting at the 999-variable SQLite limit
    # fails if: we silently drop the 1000th candidate (silent data loss),
    # or mis-cap (999 works, 1000 should fail defensively)

  Scenario (property, Core unit): order preservation under arbitrary duplicates
    Given an arbitrary list of IngestItems of length N ≥ 0
    And an arbitrary subset H of their hashes marked as already-known
    When filterNew runs
    Then fresh.length + duplicates.length == N
    And fresh's items appear in the same relative order as in the input
    And duplicates' items appear in the same relative order as in the input
    # fails if: a Set-based implementation silently reorders, or the split miscounts
```

## Plan for Sonnet (commit slices — adapter-story sizing per CLAUDE.md § 6.6)

Per Story 2.1's retro action B, this story uses coarser slices: one "obvious basics" slice for the happy path + intrinsic invariants, then one dedicated slice per deliberately-counterintuitive rule. Target 6–8 commits. Every subject carries `(Story 2.2)`.

1. `chore(docs): refresh CLAUDE.md § 1 current-position line (Story 2.2 maintenance)`
   One-line edit: `Epic 2 ... Next story: 2.3 — Transaction Builder & Auto-Tagging Domain Service`. Resolves Story 2.1 retro action D.
2. `test(ingest): canonicalize + IdempotencyService contracts — failing (Story 2.2)`
   Create Core types/ports (`HashFn`, `HashRepository`, `IdempotencyOutcome`). Add unit tests for `canonicalize` (normalization invariants, US-rejection, PII safety of error) and `IdempotencyService.filterNew` (3 fresh + 2 duplicates order preserved, re-ingest property, field-discrimination property via a synthetic `HashFn` that returns the canonical string unchanged).
3. `feat(ingest): canonicalize + IdempotencyService minimal green (Story 2.2)`
   Implement `canonicalize.ts` (NFC + trim + whitespace-collapse + US-join), `HashFn` + `HashRepository` port files, and `IdempotencyService` class. All pure Core. Tests mock both ports.
4. `test(crypto): NodeHashFn SHA-256 determinism + discrimination — failing (Story 2.2)`
   Unit tests over real `crypto`. Deterministic 64-hex output; any field change → different hash (property).
5. `feat(crypto): NodeHashFn SHA-256 adapter minimal green (Story 2.2)`
   Thin wrapper over `crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')`.
6. `test(db): migration 003 idempotent + SqliteHashRepository correctness — failing (Story 2.2)`
   Integration test against real SQLite: migration runs once on fresh DB (user_version goes 2→3); re-running the migrator is a no-op (user_version stays 3, `ALTER TABLE` does not fire — would have rejected "duplicate column"); `listKnownHashes` returns exactly the subset for 0 / 1 / 500 / 999 candidates; 1000 candidates yields `Result.fail` with the 999-limit hint.
7. `feat(db): migration 003 + SqliteHashRepository minimal green (Story 2.2)`
   Add `.sql` migration (nullable `UNIQUE` column + pragma). Implement adapter with the single dynamic `IN (…)` query and the 999-variable defensive cap.
8. `refactor(ingest): tidy IdempotencyService (Story 2.2)` **or** empty-refactor per § 6.4 if nothing to clean.

Estimated 7–8 commits. Per § 6.6 adapter-story sizing: the core "obvious basics" land in slices 2+3; crypto and DB adapters each get their own pair because each has a distinct external concern (crypto library vs SQL). No speculative splitting into per-assertion slices.

### Deps pre-authorised

None. Node built-ins (`crypto`), `better-sqlite3`, `fast-check` are all present.

### Verification (end-to-end)

- `npm run lint && npm run build && npm test` all green.
- Each Gherkin scenario maps to at least one test in `tests/unit/core/ingest/idempotency-service.test.ts` or the integration suites.
- Branch coverage: 100% on `src/core/ingest/idempotency-service.ts` and the canonicalizer. Infra coverage exercises every branch with intent (happy path, batch boundary at 500, empty candidate list).
- **No manual smoke test required** — no user-facing surface yet (Story 2.4's `accounting ingest` will trigger the full pipeline for manual verification).

## Risks & deferrals

- **Nullable `UNIQUE` hash column is a temporary laxity** until Story 2.5 populates every write. Once all rows have a hash, a follow-up migration can `ADD CHECK (idempotency_hash IS NOT NULL)` to lock it in. File an issue at P3 review.
- **No hash writes in Story 2.2.** First-run dedup correctly returns everything as fresh; this story only exercises the READ path. Story 2.5 will wire the write path (hash column populated on every insert). Integration tests seed the DB directly via `INSERT` to simulate prior state.
- **999-variable defensive cap** in `SqliteHashRepository` is a floor, not the actual limit (modern `better-sqlite3` supports 32766). If throughput ever matters (issue #27), lift the cap and add batching. For now, 999 is safe on any SQLite build.
- **US (`\u001F`) appearing in a future bank's description** is vanishingly unlikely but possible. The canonicalizer's `Result.fail` would prevent silent hash-collision — loud failure, user sees a clear error. Not a deferral risk.
- **Description normalization is conservative** (NFC + trim + collapse whitespace, nothing else). Case-normalization was considered and rejected — some banks produce deliberately cased descriptions (proper names, acronyms) and lowercasing would create collisions across legitimately-distinct transactions. If a future format needs it, the canonicalizer is a pure function easy to extend.
- **Retro finding carry-forward.** Story 2.1's retro action C ("pre-return Sonnet question for tool/lib substitutions") was resolved in-spirit by Story 2.1 retro action A's explicit spec rule; no separate issue filed. Confirm at this story's retro.
