# Story 3.2 — Buffer State Reader

## Context

Epic 3 (Liquidity Engine & Settlement) needs to know how much liquidity sits in each configured buffer bucket before it can answer "what's the safe monthly transfer?" (Story 3.4) or render a CLI status view (Story 3.5). Today, buffers exist as *goals* in YAML (`{ name, target, cap? }`) and the ledger records double-entry rows on free-form `account` strings — but nothing connects the two.

Story 3.2 builds the **read side**: a pure domain service `BufferStateService` that, given an as-of date, returns the current balance + status (below / on-target / above-cap) for every configured buffer bucket. It is read-only — write-side semantics (filling/draining) are Story 3.4's problem; CLI rendering is Story 3.5's.

This story also establishes the **bucket→ledger-account convention**: an explicit `account: string` field on each `BufferBucket` in YAML, asserted unique at parse time. That convention will be reused by Stories 3.3–3.5 and any future settlement code.

### Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning
- ✓ Working tree clean; `main` synced
- ✓ Open issues (6 deferred suggestions): none block 3.2
- ✓ No open PRs (no Dependabot pending)
- ✓ `npm audit --audit-level=high` → 0 vulnerabilities
- → Proceed to planning

## Acceptance Criteria

**Given** an `accounting.yaml` config with one or more buffer buckets, each declaring a unique `account` string,
**When** `BufferStateService.getStateAsOf(date)` is called with an ISO 8601 date (`YYYY-MM-DD`),
**Then** it returns `Result.ok(BufferState[])` — one entry per configured bucket, in config order.

**And** each `BufferState` has shape `{ name, balance: Money, target: Money, cap?: Money, status: 'below' | 'on-target' | 'above-cap' }`.

**And** `balance` is the asset-balance sum of `transaction_entries` rows where `account = bucket.account` and `substr(transactions.occurred_at, 1, 10) <= asOfDate`, computed as `sum(debit cents) − sum(credit cents)` in `defaultCurrency`.

**And** status is derived deterministically:
- `balance.lessThan(target)` → `'below'`
- otherwise (`balance >= target`) and (no `cap` OR `balance.lessThanOrEqual(cap)`) → `'on-target'`
- otherwise (`balance > cap`) → `'above-cap'`

**And** if any ledger entry on a bucket account has a currency different from `defaultCurrency`, `getStateAsOf` returns `Result.fail` citing the offending account and currency.

**And** if `date` does not match `/^\d{4}-\d{2}-\d{2}$/`, `getStateAsOf` returns `Result.fail` with a clear message.

**And** if two buckets share the same `account` string, **config parse** fails with a path-cited Zod error (`buffers.<i>.account: duplicate of buffers.<j>.account`); the service is never constructed.

**And** `getStateAsOf` is pure: it never reads the system clock — re-running with the same `date` yields byte-identical output regardless of `Date.now()`.

**And** an empty `buffers: []` config is valid — `getStateAsOf` returns `Result.ok([])`.

## Production-code surface (R2)

New types / signatures introduced:

- `BufferBucket` (modified): adds `readonly account: string`.
- `BufferState` (new) at `src/core/buffers/buffer-state.ts`: `{ name, balance: Money, target: Money, cap?: Money, status: BufferStatus }`.
- `BufferStatus` (new): `'below' | 'on-target' | 'above-cap'`.
- `BufferLedgerQuery` (new) at `src/core/ports/buffer-ledger-query.ts`: `sumEntriesByAccount(account: string, asOfDate: string): Result<LedgerSums>`.
- `LedgerSums` (new): `{ debitCents: number; creditCents: number; currency: string }`. Adapter must fail if more than one currency appears for that account.
- `BufferStateService` (new) at `src/core/buffers/buffer-state-service.ts`: `getStateAsOf(date: string): Result<readonly BufferState[]>`.
- `Money` (extended) at `src/core/shared/money.ts`: `compare(other: Money): Result<number>`, `lessThan(other): Result<boolean>`, `lessThanOrEqual(other): Result<boolean>`.
- `SqliteBufferLedgerQuery` (new adapter) at `src/infra/db/repositories/sqlite-buffer-ledger-query.ts`.

YAML format change: every entry under `buffers:` must now declare `account:`. `accounting.example.yaml` updated; no migration script needed (config is read fresh each run).

No CLI changes; no schema migrations.

## Tool-bundle import audit (R3)

No new framework / library entering deps. Reuses: `dinero.js` (Money), `better-sqlite3` (adapter), `zod` (schema), `vitest` + `fast-check` (tests), `quickpickle` (BDD). N/A.

## Slicing — 8 commits (R13)

1. **`feat(buffers): add account field to BufferBucket — minimal green`** + paired `test`. Update `src/core/config/app-config.ts`, `src/infra/config/config-schema.ts` (add `account: z.string().min(1)`), `accounting.example.yaml`. Unit test: missing `account` → `buffers.0.account` path-cited error.

2. **`feat(buffers): reject duplicate buffer accounts at parse — minimal green`** + paired `test`. superRefine in `BuffersSchema` (mirror existing duplicate-name check). Path-cited error `buffers.<i>.account: duplicate of buffers.<j>.account`.

3. **`feat(money): ordering helpers compare/lessThan/lessThanOrEqual — minimal green`** + paired `test` (unit + fast-check). Trichotomy property; currency-mismatch returns `Result.fail`. Self-contained, unblocks slice 5.

4. **`test(buffers): buffer-status acceptance feature — failing`** (R10 green-on-landing acceptable for steps that exercise still-absent service via Result.fail "service not implemented"). Create `tests/features/buffer-status.feature` with all four scenarios (see below). Create `tests/features/steps/buffer-status.steps.ts` skeleton. Create the `BufferLedgerQuery` port file (interface only, no impl). Acceptance run RED.

5. **`feat(buffers): BufferStateService happy path — minimal green`**. Create `src/core/buffers/buffer-state.ts` (interfaces) and `src/core/buffers/buffer-state-service.ts` (~30 LOC, mirrors `SplitRulesService`). Service takes constructor deps: `(buffers: readonly BufferBucket[], defaultCurrency: string, ledger: BufferLedgerQuery)`. Unit tests for status branches + property test for status totality and order-independence. First two acceptance scenarios flip GREEN.

6. **`feat(buffers): asOf ISO-date validation + monotonicity — minimal green`** + paired `test`. ISO_DATE regex check (copy from `SplitRulesService`); fast-check property: monotonic in asOf for debit-only ledgers. Acceptance scenario "same-day asOf bound" flips GREEN.

7. **`feat(buffers): SqliteBufferLedgerQuery adapter — minimal green`** + paired integration `test`. SQL: parameterised `account = ?` and `substr(occurred_at, 1, 10) <= ?` predicate. Detect cross-currency on that account → `Result.fail` citing offending currency. Real in-memory SQLite + `runMigrations`; **no `vi.mock`** (R7 test-mechanism honesty).

8. **`refactor(buffers): cleanup`** — branch-coverage check on `src/core/buffers/`, run lint/build/test. May be empty (R11) if nothing surfaces.

Slices 1+2 may compress to one commit if the diff is small; review at execution time.

## Acceptance scenarios (Gherkin)

```gherkin
Feature: Buffer state reader (Story 3.2)

  Scenario: balances classify across below / on-target / above-cap
    Given a config with three buffers:
      | name  | account            | target | cap   |
      | Car   | assets:buffer:car  | 1000   |       |
      | House | assets:buffer:hous | 5000   | 10000 |
      | Vac   | assets:buffer:vac  | 500    | 1500  |
    And the ledger contains as of "2026-04-26":
      | account            | side   | amount |
      | assets:buffer:car  | debit  | 800    |
      | assets:buffer:hous | debit  | 6000   |
      | assets:buffer:vac  | debit  | 2000   |
    When I read buffer state as of "2026-04-26"
    Then the result is success
    And "Car"   has balance 800.00 EUR  and status "below"
    And "House" has balance 6000.00 EUR and status "on-target"
    And "Vac"   has balance 2000.00 EUR and status "above-cap"
    # fails if status thresholds invert, cap inclusivity wrong, or formatting drifts

  Scenario: same-day ledger entry is included by asOf bound (substr-based compare)
    Given a config with one buffer "Car" mapped to "assets:buffer:car" target 1000
    And the ledger has a debit of 500 on "assets:buffer:car" at "2026-04-21T14:30:00+02:00"
    When I read buffer state as of "2026-04-21"
    Then "Car" has balance 500.00 EUR
    # fails if SQL uses raw lexicographic compare (would exclude same-day rows)

  Scenario: duplicate buffer-account mapping rejected at config parse
    Given a config where two buffers share the account "assets:buffer:shared"
    When the configuration is loaded
    Then loading fails with an error citing "buffers.1.account"
    # fails if superRefine missing or path not cited

  Scenario: currency mismatch on a buffer account fails the read
    Given a config with default currency EUR and buffer "Car" on "assets:buffer:car"
    And the ledger has a USD entry on "assets:buffer:car"
    When I read buffer state as of "2026-04-26"
    Then the result is failure
    And the error cites "assets:buffer:car" and "USD"
    # fails if adapter silently coerces or service masks the mismatch
```

## Property tests (fast-check, DoD #3)

Co-located with unit tests in `tests/unit/core/buffers/buffer-state-service.test.ts` and `tests/unit/core/shared/money.test.ts`:

1. **Status totality** — ∀ (balance, target, cap?): exactly one of the three statuses.
2. **Boundary inclusivity** — `balance == target` ⇒ `'on-target'`; `balance == cap` ⇒ `'on-target'`.
3. **Order-independence on entries** — shuffled fake-ledger entries ⇒ identical `BufferState[]`.
4. **Monotonicity in asOf** — debit-only entries: `asOf₁ ≤ asOf₂` ⇒ `balance₁ ≤ balance₂`.
5. **Money trichotomy** — ∀ (a, b) same currency: exactly one of `a.lessThan(b)`, `a.equals(b)`, `b.lessThan(a)`.
6. **Money currency-mismatch on compare** — different currencies ⇒ `Result.fail`.
7. **Purity / no system clock** — source of `src/core/buffers/buffer-state-service.ts` MUST NOT contain `Date.now`, `new Date(`, or `performance.now`. Asserted via regex on the file contents (mirror Story 3.1 convention).

## Files touched

| Path | Change |
| --- | --- |
| [src/core/config/app-config.ts](src/core/config/app-config.ts) | add `account: string` to `BufferBucket` |
| [src/infra/config/config-schema.ts](src/infra/config/config-schema.ts) | Zod field + duplicate-account superRefine |
| [accounting.example.yaml](accounting.example.yaml) | example `account:` lines |
| [src/core/shared/money.ts](src/core/shared/money.ts) | `compare`, `lessThan`, `lessThanOrEqual` |
| `src/core/ports/buffer-ledger-query.ts` | NEW port |
| `src/core/buffers/buffer-state.ts` | NEW interfaces (`BufferState`, `BufferStatus`, `LedgerSums`) |
| `src/core/buffers/buffer-state-service.ts` | NEW service |
| `src/infra/db/repositories/sqlite-buffer-ledger-query.ts` | NEW adapter |
| `tests/features/buffer-status.feature` | NEW |
| `tests/features/steps/buffer-status.steps.ts` | NEW |
| `tests/unit/core/buffers/buffer-state-service.test.ts` | NEW |
| `tests/unit/core/shared/money.test.ts` | extend with ordering tests |
| `tests/integration/infra/db/sqlite-buffer-ledger-query.test.ts` | NEW |

No CLI / `program.ts` change → R4 (composition-root subprocess test) does not apply.

## Reuse map

- `SplitRulesService` ([src/core/splits/split-rules-service.ts](src/core/splits/split-rules-service.ts)) — direct template for service shape (constructor DI, ISO_DATE regex, lexicographic compare, no clock read).
- `parseRawConfig` superRefine for duplicate-name rejection ([src/infra/config/config-schema.ts](src/infra/config/config-schema.ts)) — same pattern for duplicate-account rejection.
- `Money.subtract` returning a Dinero v2 result that allows negative internal amounts — used to compute signed asset balance.
- `runMigrations` + in-memory `Database(':memory:')` — integration-test scaffold (already used in [tests/integration/infra/db/sqlite-transaction-repo.test.ts](tests/integration/infra/db/sqlite-transaction-repo.test.ts)).
- `Result.all` combinator (story-maint-11) — useful when mapping over buckets while threading failures.

## Verification (end-to-end)

1. `npm run lint && npm run build && npm run typecheck` — clean.
2. `npm test` — all unit + integration + acceptance green; fast-check runs ≥ 100 iterations on each property.
3. `npm run test -- tests/features/buffer-status.feature` — all four scenarios green.
4. Manual: edit `accounting.example.yaml` to copy/rename to `accounting.yaml`, add an `account:` field on a buffer, run a small migration + a few test inserts via `npm run migrate` + a sqlite shell, then write a one-off scratch script that constructs the service and prints `getStateAsOf('2026-04-26')`. Confirm output shape matches AC.
5. Branch coverage on `src/core/buffers/` = 100% (DoD #3 + § 5 cheat sheet).
6. Grep `src/core/buffers/` for `Date.now|new Date(` — must be empty (purity invariant).

## Blind spots (acknowledged)

- **target = 0 buckets.** With `balance == 0 == target` and no cap, status is `'on-target'` (since `balance >= target`). Allowed by Zod (`nonnegative`). Not tightened in this story; documented as accepted edge.
- **Negative balances.** `Money.subtract(debit, credit)` carries a negative amount when credits exceed debits on an asset account. `toString` renders `EUR -2.50`. Status falls through to `'below'` (target ≥ 0). Property-tested (#1 totality).
- **Account strings echoed in error messages.** Account ids are technical (`assets:buffer:car`), not PII — echoing is safe. Partner-name redaction precedent does NOT apply.
- **Adapter SQL injection surface.** All bindings parameterised (`?`); no string concatenation. Documented in slice-7 commit message.

## Out of scope

- CLI `status` command (Story 3.5).
- Buffer fill/drain on settlement (Story 3.4).
- Multi-currency per-bucket reporting (forex post-MVP per PRD).
- Migration of pre-existing `accounting.yaml` files: users must add `account:` lines manually; loader fails clearly if missing.
