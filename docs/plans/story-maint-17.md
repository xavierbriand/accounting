# Story maint-17 — Fix `idempotency_hash` UNIQUE collision on in-batch duplicates

## Context

Reporter ran `accounting ingest <BPCE-csv>` on a fresh DB. After interactive categorization and confirmation, the commit failed:

```
✔ Commit these N transactions? Yes
Commit failed (batch rolled back): SqliteError: UNIQUE constraint failed: transactions.idempotency_hash
Snapshot retained at <data-dir>/ledger.db.bak for recovery.
```

**Cause.** The canonical hash input is
`(sourceAccount, occurredAt, direction, amount.cents, currency, normalizedDescription)`
— see [canonicalize.ts:37-44](../../src/core/ingest/canonicalize.ts). BPCE's `Date operation` is day-only (`DD/MM/YYYY` → local midnight, [node-csv-parser.ts:105](../../src/infra/csv/node-csv-parser.ts)), so two real-world transactions with the same payee, the same amount, and the same direction on the same day produce **identical canonical strings → identical SHA-256 hashes**.

[`IdempotencyService.filterNew()`](../../src/core/ingest/idempotency-service.ts) only deduplicates against the **DB** — it does **not** dedup within the input batch. On a fresh DB both occurrences fall into `fresh[]`, both build into `BuildOutcome`s, and [`saveBatch()`](../../src/infra/db/repositories/sqlite-transaction-repo.ts) trips the UNIQUE index on the second insert; the wrapping `db.transaction()` rolls everything back.

The reporter's BPCE export contains a small handful of in-batch collision groups (multiple rows per group, a few extra rows beyond the first) — all of which are legitimate repeat transactions on the same day (same payee, same amount), not data corruption. Concrete counts/dates/amounts are intentionally omitted from this plan and tests per the [privacy rule](../../CLAUDE.md#3-money--precision-most-forgotten-rules) (extended in this story to cover sums, calendar dates, and filenames embedding account ids).

This is a regression-class hidden assumption rather than a recent break: the design has always assumed real-world uniqueness on `(date, account, payee, amount)` per source, which day-granular date sources (BPCE) make false. No prior reporter has hit it because earlier ingests didn't include same-day repeats. No FR is at risk; AC3 (re-ingest idempotency) is preserved by the chosen approach.

**Maintenance sub-loop (§ 6.7) run 2026-04-30 pre-planning** — copy-pasted from [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md):

- [x] **Sibling work check.** `gh pr list --state open` → empty. `gh issue list --state open` → 25 open: 8 deferred-suggestions, 1 unrelated ingest bug (#103, low-confidence row re-classification), the rest enhancements/harness curriculum. None addresses in-batch idempotency collision.
- [x] **Working tree clean.** `git status` clean; on `fix/ingest-batch-collision` branched from `origin/main` (`8f57423`).
- [x] **Open issues.** Triaged above; no blockers.
- [x] **Open PRs.** None.
- [x] **`npm audit --audit-level=high`** — `found 0 vulnerabilities`.
- [x] **Proceed-to-planning.**

## Story

> As a user ingesting a BPCE statement that contains legitimate same-day repeat transactions (two metro tickets, two equal incoming transfers, etc.), I want every input row to commit on a fresh DB and re-ingesting the same file to be a no-op, so that ingest doesn't roll back an entire batch on the second occurrence of an indistinguishable canonical key.

Behavioural change. AC tied to FR7 (idempotent re-ingest) and the parse/commit policy in [docs/quality-assurance.md](../quality-assurance.md). Targets ~5 commits per § 6.6 (single-behaviour, small surface).

## Selected solution — in-batch sequence tie-breaker

Inside `filterNew`, after canonicalizing each item, count occurrences of each canonical string in input order. For occurrence #1 hash the canonical string unchanged; for #2 and beyond, append `<US> + "#" + seq` before hashing (where `<US>` is ``, the existing field separator).

Properties:

- **Backward-compatible for non-colliding rows.** First (or only) occurrence of a canonical key hashes exactly as before, so every already-committed row keeps its existing hash. No migration needed.
- **Collision-free within a batch.** No two indices produce the same hash — the new tail (`<US>#N`) cannot occur in a non-disambiguated canonical. Justification: real canonicals contain exactly 5 `<US>` bytes (six fields joined by 5 separators in [canonicalize.ts:37-44](../../src/core/ingest/canonicalize.ts)). Of those six fields, four (`sourceAccount`, `occurredAt`, `direction`, `normalizedDescription`) are explicitly US-rejected by `checkField` ([canonicalize.ts:14-20](../../src/core/ingest/canonicalize.ts)); the remaining two cannot carry `<US>` by construction — `String(item.amount.amount)` is a base-10 integer string, and `item.amount.currency` is an ISO 4217 code validated by `Money.fromCents`. Disambiguated canonicals contain exactly 6 `<US>` bytes — distinguishable.
- **Idempotent on re-ingest** of the same CSV (input order is stable for a given BPCE export, so `#2` / `#3` assignment is reproducible).
- **No schema change.** Hash port (`HashFn: string → string`) is unchanged; column type and UNIQUE index stay as-is.

Acknowledged limitation, recorded in code comment + retro: if a future ingest reorders or splits the same logical rows across batches, sequence assignment may differ — the engine will then treat second-and-later occurrences as fresh. Not a regression (the old code could not commit them at all); just a documented edge.

### Alternatives rejected

- **Drop in-batch duplicates silently** (push to `duplicates[]`). Smallest fix but silently loses legitimately-distinct second occurrences (e.g. two metro tickets same day). User declined.
- **Hard-fail with diagnostic.** No silent loss but worst UX for large statements with several legitimate dupes.
- **Add a per-row line number to the hash input.** Forces a schema/migration redesign, breaks idempotency across re-exports that reorder lines. Out of scope.

## Production-code surface (R2)

| File | Change |
| --- | --- |
| [src/core/ingest/idempotency-service.ts](../../src/core/ingest/idempotency-service.ts) | `filterNew()` body adds an in-batch sequence map; sequence ≥2 produces a disambiguated canonical key before hashing. No type / signature changes. |
| [src/core/ingest/canonicalize.ts](../../src/core/ingest/canonicalize.ts) | **Unchanged.** Stays pure / single-item. |
| [src/infra/db/repositories/sqlite-transaction-repo.ts](../../src/infra/db/repositories/sqlite-transaction-repo.ts) | **Unchanged.** |
| Migrations / schema | **Unchanged.** |

No new public types, no new exports, no API changes.

## Tests

### Unit — [tests/unit/core/ingest/idempotency-service.test.ts](../../tests/unit/core/ingest/idempotency-service.test.ts)

Add to the existing `describe('IdempotencyService.filterNew', …)`:

1. **In-batch duplicates produce distinct hashes** — input `[A, A, A, B]`; expect 4 fresh items, 4 distinct hashes, **hash of the first occurrence of A equals the hash of a single-A input** (legacy compat — first occurrence keeps the unmodified canonical). *fails if* `filterNew` emits two `fresh[]` entries with the same `idempotencyHash` (would crash `saveBatch` on the UNIQUE index in [sqlite-transaction-repo.ts:64-91](../../src/infra/db/repositories/sqlite-transaction-repo.ts)).
2. **In-batch + DB duplicate, mixed with new occurrences** — DB knows the hash of a single-A. Input `[A, A]` → first occurrence goes to `duplicates[]` (matches stored A), second goes to `fresh[]` with a new `seq=2` hash. Also cover `[A, A, A]` against a DB that already knows both `seq=1` and `seq=2` hashes from a prior `[A, A]` batch → first two duplicates, third fresh as `seq=3`. *fails if* the second occurrence is classified as duplicate (data loss) or two fresh entries share a hash (`saveBatch` crash).
3. **Re-ingest after commit is idempotent** — first run inputs `[A, A, B]`, capture hashes, prime mock repo; second run with same input returns 3 duplicates and 0 fresh. *fails if* sequence assignment is non-deterministic (would break AC3 / FR7 — repeated `accounting ingest <file>` would commit duplicates to the ledger).
4. **Order independence within a non-colliding multiset** — input where no canonical repeats: hashes match the legacy single-pass output (regression guard for unrelated rows). *fails if* the sequence-aware path corrupts hashes for non-colliding rows (would invalidate every previously-committed row's hash, breaking re-ingest).
5. **Property test (`fast-check`)** — generate batches with controlled duplicates using an arbitrary like `fc.array(fc.constantFrom(makeItem(1), makeItem(2), makeItem(3)), { minLength: 2, maxLength: 12 })` so collisions are guaranteed (a naive `fc.array(makeItem)` with unique IDs would never exercise the sequence path). Assert: (a) all `fresh[].idempotencyHash` values are distinct, and (b) `fresh.length + duplicates.length === input.length`. *fails if* the `saveBatch` UNIQUE-index invariant is violated by `filterNew`'s output, or the partition no longer accounts for every input.

R6: every `fails if` annotation names the production path it guards.
R8 (mock diversity): unit tests already mock `HashFn` and `HashRepository`; these tests vary inputs (single, multi, sequence) but reuse one mock-repo strategy.

### Acceptance — [tests/features/ingest.feature](../../tests/features/ingest.feature)

Add scenario, written against the **existing** step library only ([tests/features/steps/ingest.steps.ts](../../tests/features/steps/ingest.steps.ts) — `Given a fresh migrated DB…`, `Given a BPCE CSV copied to that temp dir…`, `Given the CSV has been committed interactively`, `When I run ingest with…`, `Then the process exits with code…`, `Then stderr contains…`):

```gherkin
Scenario: Ingest commits a CSV that contains in-batch hash duplicates (story-maint-17)
  Given a fresh migrated DB and accounting.yaml at a temp dir
  And a BPCE CSV copied to that temp dir as "bpce-in-batch-dups.csv"
  When I run ingest with "--non-interactive --json"
  Then the process exits with code 0
  And stderr contains "transaction(s) committed"

Scenario: Re-ingest of a CSV with in-batch hash duplicates is a no-op (story-maint-17)
  Given a fresh migrated DB and accounting.yaml at a temp dir
  And a BPCE CSV copied to that temp dir as "bpce-in-batch-dups.csv"
  And the CSV has been committed interactively
  When I run ingest with "--non-interactive --json"
  Then the process exits with code 0
  And stderr contains "Found 0 new transactions"
```

The fixture CSV ([tests/features/_fixtures/bpce-in-batch-dups.csv](../../tests/features/_fixtures/bpce-in-batch-dups.csv) — new) uses synthetic accounts, paraphrased payees, and made-up amounts that intentionally produce **at least one in-batch canonical-key collision** (e.g. two rows with same date / direction / amount / payee). All values are invented per the privacy rule — no values copied from the reporter's real CSV. The CSV must be auto-tag-ruled in `accounting.yaml` to avoid a low-confidence prompt under `--non-interactive`. The fixture and any newly-imported `accounting.yaml` content for this scenario stay synthetic.

No new step definitions are needed; the scenario relies entirely on the existing harness (verified by reading the current step list).

### Test-mechanism honesty (R7)

In-process service unit tests only — no subprocess needed. The acceptance scenario runs through the existing CLI harness; this is the same scope as story-2.5's idempotency tests.

## Verification (DoD)

1. `npm run lint && npm run build && npm test` — green; 100% branch coverage on `src/core/ingest/idempotency-service.ts`.
2. With the fix in place, run on the reporter's CSV (path kept out of source control):

   ```sh
   rm -f data/ledger.db data/ledger.db.bak
   npm run migrate
   node dist/cli.js ingest <path-to-csv> --non-interactive
   ```

   Expect: every input row committed, zero batch rollback.
3. Re-run the same `ingest` command immediately. Expect: `0 fresh, all-rows duplicates skipped`, exit 0.
4. `sqlite3 data/ledger.db "SELECT COUNT(*) FROM transactions"` matches the input row count.

## Workflow

- One PR. **6 commits** (R13 lower bound for standard stories — 6–10 range). Slice plan:

  1. `chore(docs): plan + P1/P2/P3 review for story-maint-17` — this plan, the suggestion log, and the maintenance sub-loop record. No production / test code yet.
  2. `test(ingest): in-batch hash collision yields distinct hashes (story-maint-17) — failing` — unit tests 1–2, the failing acceptance scenario + fixture CSV, and the property test (test 5) all introduced at once. Tests 3 and 4 are added here too even though they may pass under current code (R10 green-on-landing covers them as siblings of the failing core tests).
  3. `feat(ingest): in-batch sequence tie-breaker for idempotency hash (story-maint-17) — minimal green` — the `filterNew()` change. Whole suite green.
  4. `test(ingest): re-ingest acceptance scenario for in-batch duplicates (story-maint-17) — green on landing` — second acceptance scenario (the re-ingest no-op) added separately to keep slices small and to verify FR7 against the new code.
  5. `refactor(ingest): document filterNew limitation + extract sequence helper if warranted (story-maint-17)` — cleanup pass. Empty refactor (R11) acceptable if no structural change is justified at green; the docstring clarifying the cross-batch limitation lands here.
  6. `chore(retro): story-maint-17 retrospective + privacy-scope note (story-maint-17)` — retro file, status fragment under `docs/status.d/`, and any CLAUDE.md § 8 rule additions surfaced by the retro.

- Suggestion log: see § "Suggestion log" below — every Phase-2 finding tagged `adopt` / `defer` / `reject` (DoR gate per § 6.1 phase 2).
- Retrospective: `docs/retrospectives/story-maint-17.md` after merge. Two entries to capture:
  1. Hash design assumed real-world uniqueness on `(date, account, payee, amount)` — fails for day-granular date sources; in-batch tie-breaker is the workaround. Document the assumption + the limitation around cross-batch reordering.
  2. **Privacy rule scope:** the existing "no real merchant strings" guidance was applied narrowly to payee text; in this session the user broadened it to *all* transaction-private data (vendor name, account number, monetary sums, calendar dates, file names containing account ids). Plan files, tests, fixtures, and commits must paraphrase or omit. Consider promoting to CLAUDE.md § 8 as a new rule (R20-candidate) — review during retro.

## Suggestion log (Phase-2 P1/P2/P3 review)

Source: `plan-reviewer` sub-agent run on this plan, 2026-04-30. Eight findings; all tagged below per CLAUDE.md § 6.1 phase 2 (DoR gate).

| # | Tag | Severity | Finding | Decision |
| --- | --- | --- | --- | --- |
| P1-1 | adopt-with-edit → **reject** | suggestion | Acceptance Gherkin scenario should carry a `fails if` annotation. | **Reject.** R6 (`fails if` identifies production path) is a unit-test convention in this repo; existing `tests/features/*.feature` files carry no `fails if` annotations on scenarios. Adding one to a new scenario would create inconsistency without precedent. R7 (test-mechanism honesty) already covers what each scenario meaningfully asserts. |
| P1-2 | **adopt** | blocker | Scenario step `And both transactions appear in the ledger` has no matching step definition. | Adopted. Plan now uses only existing steps (`stderr contains "transaction(s) committed"`, `Then the process exits with code 0`, etc.) and references the actual step library file. |
| P1-3 | **adopt** | nit | Test-1 description "hash of `A#1` equals hash of single-A" is ambiguous (could be misread as asserting that the suffix `#1` is appended). | Adopted. Description rewritten to "hash of the first occurrence of A equals the hash of a single-A input". |
| P1-4 | **adopt** | suggestion | Unforgeability claim doesn't explain why `amount.amount` and `amount.currency` are safe despite skipping `checkField`. | Adopted. Plan § "Selected solution" now explains that `String(amount.amount)` is base-10 integer (cannot contain `<US>`) and `currency` is ISO 4217-validated. |
| P2-* | — | — | None observed. | — |
| P3-1 | **adopt** | nit | R13 lower bound is 6, plan said ~5. | Adopted. Slice plan now lists 6 named commits. |
| P3-2 | **adopt** | suggestion | Workflow section had only a commit count, no slice plan; R12 / R13 not verifiable at plan stage. | Adopted. Slice plan with named subjects added. |
| P3-3 | **adopt** | suggestion | Property test arbitrary unspecified; naive `fc.array` of unique items would never trigger seq disambiguation. | Adopted. Plan now specifies `fc.array(fc.constantFrom(makeItem(1), makeItem(2), makeItem(3)), …)` shape. |
| P3-4 | **acknowledge** | nit | Cross-batch limitation comment placement (`comment + retro`) noted as correct. | No action. Already part of plan. |

DoR exit (§ 6.1 phase 2): all findings tagged. No deferred items → no GitHub issues to open.

## Out of scope

- Changing the BPCE parser to produce per-row line-numbered IDs.
- Adding a UI-level pre-commit duplicate warning.
- Re-hashing existing committed rows (none affected; first-occurrence hash is unchanged by design).
