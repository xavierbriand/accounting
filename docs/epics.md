# accounting - Epic Breakdown

## Overview

Roadmap for `accounting`. This document owns the epic / story decomposition; it does **not** restate requirements or architectural decisions.

- Functional and non-functional requirements — [prd.md](prd.md) §§ Functional Requirements / Non-Functional Requirements.
- Architectural decisions (money format, Result pattern, constructor DI, custom migration runner, Ports & Adapters, DB/testing choices) — [architecture.md](architecture.md).

## FR Coverage Map

FR1: Epic 1 - Config Split Rules
FR2: Epic 1 - Config Buffers
FR3: Epic 1 - Validate Config
FR4: Epic 2 - CSV Ingest
FR5: Epic 2 - Interactive Tagging
FR6: Epic 2 - Auto-Tagging
FR7: Epic 2 - Idempotency
FR8: Epic 3 - Safe Transfer Calc
FR9: Epic 1 - Integer Math
FR10: Epic 3 - Buffer Logic
FR11: Epic 3 - Fixed Cost Prediction
FR12: Epic 3 - Dynamic Splits
FR13: Epic 1 - Append-Only Ledger (Schema) / Epic 2 - Recording
FR14: Epic 4 - Soft Edit
FR15: Epic 2 - Double-Entry Consistency
FR16: Epic 1 - Multi-Currency Support
FR17: Epic 2 - Snapshot Safety
FR18: Epic 3 - Status View
FR19: Epic 4 - Conversational Explanations
FR20: Epic 4 - JSON Output (Global Requirement, primarily exposed here)
FR21: Epic 4 - Graceful Dissolution
FR22: Epic 3 - Deterministic Math
FR23: Epic 4 - Audit Trail

## Epic List

### Epic 1: Foundation & Core Ledger
**Goal:** Establish the "Safe Environment" where the user can install the tool, define their financial "Rules of Engagement" (Splits/Buffers), and verify the system is secure and mathematically precise. This Epic builds the immutable "Truth Store" first.
**User Value:** "I can configure the app with my partner's details and trust that the math engine is ready."
**FRs covered:** FR1, FR2, FR3, FR9, FR16, FR13 (Schema)

### Epic 2: Transaction Ingestion & Tagging
**Goal:** Enable the "Sunday Morning Audit" workflow. Users can import raw bank data, and the system turns it into a structured, double-entry ledger with smart tagging.
**User Value:** "I can feed my bank history into the system and categorize it without duplicates."
**FRs covered:** FR4, FR5, FR6, FR7, FR13 (Recording), FR15, FR17

### Epic 3: Liquidity Engine & Settlement
**Goal:** Activate the "Financial Brain." The system processes the tagged data to calculate fair transfers, manage buffer levels, and handle dynamic split changes over time.
**User Value:** "I know exactly how much to transfer to the joint account, and I can see my buffer levels."
**FRs covered:** FR8, FR10, FR11, FR12, FR18, FR22

### Epic 4: Trust, Transparency & Lifecycle
**Goal:** Solidify trust with human-readable explanations ("Conversational CFO"), allow for error correction (Soft Edits), and provide data portability/lifecycle management.
**User Value:** "I understand *why* the numbers are what they are, I can fix my mistakes, and I own my data."
**FRs covered:** FR14, FR19, FR20, FR21, FR23

## Epic 1: Foundation & Core Ledger

**Goal:** Establish the "Safe Environment" where the user can install the tool, define their financial "Rules of Engagement" (Splits/Buffers), and verify the system is secure and mathematically precise.
**FRs covered:** FR1, FR2, FR3, FR9, FR16, FR13 (Schema)

### Story 1.1: Project Scaffold & Migration Runner

As a Developer,
I want to initialize the project structure and a custom migration runner,
So that I have a clean architecture base and can version control database schema changes from Day 1.

**Acceptance Criteria:**

**Given** A fresh directory,
**When** I run the initialization scripts,
**Then** The folder structure (src/core, src/infra, src/cli) is created.
**And** `npm install` installs strict dependencies (better-sqlite3, commander, dinero.js).
**And** I can create a `.sql` file in `src/infra/db/migrations` and run `npm run migrate` to execute it against a local SQLite DB.
**And** The migration runner uses a simple `user_version` PRAGMA check to only run new files (Idempotency).

### Story 1.2: Money & Currency Domain Types

As a Developer,
I want to implement a strict `Money` value object using Dinero.js,
So that I can prevent floating-point errors and currency mismatches throughout the application.

**Acceptance Criteria:**

**Given** The `Money` value object,
**When** I attempt to add two Money objects with different currencies (e.g., USD + EUR),
**Then** The operation returns a failure Result (`Result.fail`) — no exception is thrown.
**And** All internal storage is verified to be in integers (cents).
**And** Formatting to string uses "Banker's Rounding" (Round Half to Even) to minimize cumulative error.
**And** I can run property-based tests (fast-check) proving associativity and distributivity of the Money operations.

### Story 1.3: Ledger Schema & Repository

As a System,
I want to initialize the core `transactions` table and its repository,
So that I can store financial events in an immutable, double-entry format.

**Acceptance Criteria:**

**Given** The `sqlite-transaction-repo`,
**When** I attempt to save a transaction batch where `Sum(Debits) != Sum(Credits)`,
**Then** The repository rejects the write with a "Invariant Violation" error.
**And** The database schema enforces `amount_cents` as INTEGER and `currency` as TEXT (3 chars).
**And** The repository interface exposes `save()` but DOES NOT expose `update()` or `delete()` (Append-Only Enforcement).
**And** Database is configured in WAL mode for concurrency.

### Story 1.4: Configuration Manager

As an Admin User,
I want to define my split rules and buffer targets in a `accounting.yaml` file,
So that the system knows how to process my finances without hardcoding values.

**Acceptance Criteria:**

**Given** A valid `accounting.yaml` file in the project root,
**When** I verify the config load,
**Then** The system parses it into a strictly typed Domain Object (using Zod).
**And** If the file is missing, it looks in `XDG_CONFIG_HOME/accounting/config.yaml`.
**And** If a required field (e.g., `splits`) is missing, it returns a human-readable validation error, not a stack trace.

## Epic 2: Transaction Ingestion & Tagging

**Goal:** Enable the "Sunday Morning Audit" workflow. Users can import raw bank data, and the system turns it into a structured, double-entry ledger with smart tagging.
**FRs covered:** FR4, FR5, FR6, FR7, FR13 (Recording), FR15, FR17

### Story 2.1: CSV Parsing & Normalization

As a User,
I want to import CSV files from different banks (e.g., Monzo, Chase),
So that I can normalize their disparate date/amount formats into a single system format.

**Acceptance Criteria:**

**Given** A CSV file from a supported bank,
**When** I invoke the CSV parser,
**Then** It returns a list of normalized `IngestItem` objects (Date, Description, MoneyAmount).
**And** It successfully handles positive/negative signs correctly (some banks use negative for credit, others for debit).
**And** During the **parse stage**, rows with malformed dates or non-numeric amounts are skipped and individually reported — valid sibling rows still proceed. (Commit-stage atomicity is governed by Story 2.5.)

### Story 2.2: Idempotency Service

As a User,
I want the system to recognize transactions I've already imported,
So that I can upload overlapping CSVs (e.g., Jan-March, then Feb-April) without creating duplicates.

**Acceptance Criteria:**

**Given** A list of normalized `IngestItem` objects,
**When** I pass them to the `IdempotencyService`,
**Then** It calculates a deterministic hash for each item (Date + Amount + Description).
**And** It queries the existing ledger to filter out hashes that already exist.
**And** It returns ONLY the new items to be processed.

### Story 2.3: Transaction Builder & Auto-Tagging Domain Service

As a System,
I want to auto-assign categories to transactions and convert them into balanced double-entry sets,
So that raw bank lines become valid accounting entries.

**Acceptance Criteria:**

**Given** A normalized `IngestItem` (e.g., "Uber" -$20.00),
**When** The `TransactionBuilder` processes it,
**Then** It matches "Uber" to the "Transport" bucket via regex rules.
**And** It creates a `Transaction` object with two splits: Debit "Expense:Transport" $20.00, Credit "Liabilities:CreditCard" $20.00.
**And** It verifies `Sum(Debits) == Sum(Credits)`.

### Story 2.4: Interactive Ingest Command (CLI)

As a User,
I want to interactively review and approve the tagged transactions in the terminal,
So that I can fix incorrect auto-tags before they are committed.

**Acceptance Criteria:**

**Given** A list of proposed transactions from the Builder,
**When** I run `accounting ingest`,
**Then** The CLI displays a summary table of "New Transactions Found".
**And** It iterates through low-confidence items asking me to confirm or change the tag.
**And** It supports keyboard navigation (arrows/enter) to select tags.
**And** It does NOT write to the DB until I explicitly confirm the final batch.

### Story 2.5: Atomic Commit with Snapshot

As a User,
I want the system to backup my database before saving new transactions,
So that I can undo the import if something goes wrong.

**Acceptance Criteria:**

**Given** A confirmed batch of transactions (already produced by the parse + idempotency + builder stages),
**When** The system begins the **commit stage**,
**Then** It first copies `ledger.db` to `ledger.db.bak` (Snapshot).
**And** It opens a single SQL transaction.
**And** It inserts all records.
**And** If any insert fails at the DB level, the ENTIRE batch is rolled back (ACID). Parse-stage skips are out of scope here — they were handled earlier in Story 2.1.

## Epic 3: Liquidity Engine & Settlement

**Goal:** Activate the "Financial Brain." The system processes the tagged data to calculate fair transfers, manage buffer levels, and handle dynamic split changes over time.
**FRs covered:** FR8, FR10, FR11, FR12, FR18, FR22

### Story 3.1: Versioned Split Rules

As a System,
I want split-rule ratios to carry effective dates,
So that historical transactions are settled with the rule that was active on their date — not today's rule.

**Acceptance Criteria:**

**Given** A YAML config with multiple split-rule windows (each with a `validFrom` date and a list of `partner: ratio` rules),
**When** I ask the `SplitRulesService` for the active ratios as of a given date,
**Then** It returns the rules from the latest window whose `validFrom` is on or before that date.
**And** Windows are half-open `[validFrom_k, validFrom_{k+1})`; the last extends to `+∞`.
**And** Windows are sorted strictly ascending by `validFrom`; out-of-order or duplicate `validFrom` is rejected at parse.
**And** Each window's ratios sum exactly to 1.0 (within a `±1e-9` tolerance).
**And** All windows declare the same partner set; loading rejects roster changes with a path-cited error (no PII echoed).
**And** `getSplitsAsOf` is pure: it never reads the system clock — re-running with the same `date` argument yields byte-identical output regardless of `Date.now()`.

### Story 3.2: Buffer State Reader

As a System,
I want to read the current balance and health status of every configured buffer bucket as of a given date,
So that the settlement engine and CLI can answer "how much sits in my Car / House / Vacation buffer right now, and is it below target, on target, or above cap?"

**Acceptance Criteria:**

**Given** an `accounting.yaml` config with one or more buffer buckets, each declaring a unique `account` string,
**When** I ask the `BufferStateService` for the state as of a given date,
**Then** it returns one `BufferState` per configured bucket, in config order, with `{ name, balance, target, cap?, status }`.
**And** `balance` is `sum(debit cents) − sum(credit cents)` over `transaction_entries` rows where `account` matches the bucket and `substr(transactions.occurred_at, 1, 10) <= asOfDate` (asset-balance sign convention; same-day rows included).
**And** `status` is derived deterministically: `balance < target` → `'below'`; `balance >= target` and (no `cap` OR `balance <= cap`) → `'on-target'`; `balance > cap` → `'above-cap'`.
**And** if any ledger entry on a bucket account has a currency different from `defaultCurrency`, the read returns `Result.fail` citing the offending account and currency (single-currency MVP; forex deferred).
**And** if `date` does not match `/^\d{4}-\d{2}-\d{2}$/`, the read returns `Result.fail` with a clear message.
**And** if two buckets share the same `account` string, **config parse** fails with a path-cited Zod error; the service is never constructed.
**And** `getStateAsOf` is pure: it never reads the system clock — re-running with the same `date` yields byte-identical output regardless of `Date.now()`.

### Story 3.3: Recurring Cost Forecast

As a System,
I want to forecast every recurring fixed-cost occurrence (rent, subscriptions, insurance premiums, utilities) within a given date window from configured rules,
So that the Safe Monthly Transfer Calculator (Story 3.4) can pre-fund the joint accounts for known liabilities and the buffer-fill engine can plan ahead.

**Acceptance Criteria:**

**Given** an `accounting.yaml` config with a `recurring:` section listing one or more rules — each with `name` (unique), `category`, `cadence` ∈ `{monthly, quarterly, annual}`, `amount` (positive), `validFrom` (ISO 8601 `YYYY-MM-DD`), optional `validTo`, optional `amendments: [{ validFrom, amount }]`,
**When** I call `RecurringForecastService.forecastBetween(from, to)` with two ISO 8601 dates and `from <= to`,
**Then** it returns one `ForecastOccurrence` per rule per scheduled cadence step whose date lies in the closed interval `[from, to]` AND in the rule's lifecycle `[validFrom, validTo]` (or `[validFrom, +∞)` if no `validTo`), shape `{ name, category, expectedDate, amount }`, sorted ascending by `expectedDate` (ties broken by config order).
**And** `expectedDate` is computed by stepping from `validFrom` (which is itself the first occurrence) by `+1 / +3 / +12` calendar months for monthly / quarterly / annual respectively, with day-of-month overflow **clamped to the last valid day of the target month without rebound** (`2024-01-31` monthly → `2024-02-29`, `2024-03-31`, `2024-04-30`, …; `2024-02-29` annual → `2025-02-28`, `2026-02-28`, `2027-02-28`, `2028-02-29`).
**And** `amount` for an occurrence dated `d` is the `amount` of the latest entry in `[{validFrom: rule.validFrom, amount: rule.amount}, ...rule.amendments]` whose `validFrom ≤ d` (amendments inclusive on their `validFrom`); all amounts in `defaultCurrency`.
**And** the YAML is rejected at parse with a path-cited Zod error if: two rules share the same `name`; `cadence` is not in the enum; any `amount` is not positive; `validTo < validFrom`; amendments are not strictly ascending by `validFrom`; the first amendment is not strictly after `rule.validFrom`; the last amendment is at or after `validTo`; or any date is not ISO 8601 `YYYY-MM-DD`.
**And** if `from > to`, or either is not ISO 8601 `YYYY-MM-DD`, `forecastBetween` returns `Result.fail` with a clear message.
**And** an empty `recurring: []` config (or omitted entirely) is valid — the forecast over any window returns `Result.ok([])`.
**And** `forecastBetween` is pure: it never reads the system clock — re-running with the same `(from, to)` yields byte-identical output regardless of `Date.now()`.

### Story 3.4: Safe Monthly Transfer Calculator

As a System,
I want to compute the gross transfer required from each partner over a given window — combining recurring-cost forecasts with date-driven buffer top-ups, applying split ratios per occurrence date — and return both an aggregate per partner and a flat list of line items,
So that the Status CLI (Story 3.5) and the "Conversational CFO" output can answer "how much should I transfer this month, and why?" with full traceability.

**Acceptance Criteria:**

**Given** an `accounting.yaml` config with valid splits (3.1), buffers with `targetDate` (3.2 + this story), and recurring rules (3.3),
**When** I call `SafeTransferCalculator.calculateForWindow(asOf, from, to)` with three ISO 8601 dates and `from <= to`,
**Then** it returns `Result.ok({ totalRequired, perPartner, lineItems })` where `lineItems` is a sorted-ascending-by-date list of `{ kind: 'forecast' | 'buffer-topup', date, category, description, gross: Money, perPartnerSplit: Map<string, Money> }`.
**And** for each `ForecastOccurrence` returned by `forecastBetween(from, to)`: a `'forecast'` line item is emitted with `gross.allocate(getSplitsAsOf(occurrence.expectedDate).rules.map(r => r.ratio))` providing the per-partner split (Largest Remainder Method ensures `sum(perPartnerSplit) === gross`).
**And** for each buffer with `balance < target` as of `asOf`: if `asOf >= targetDate`, the calculation fails with a path-cited error citing the bucket name, its targetDate, and instructing the user to set a new targetDate; otherwise `(target - balance)` is allocated across `monthsBetween(asOf, targetDate)` equal monthly fills, and one `'buffer-topup'` line item is emitted per first-of-month date in `[from, to]` (up to the targetDate cutoff), each split per its month's `getSplitsAsOf` ratios.
**And** `balance >= target` for a buffer produces no line items regardless of `targetDate` state.
**And** `totalRequired = sum(lineItem.gross)` and `perPartner.get(p) = sum(lineItem.perPartnerSplit.get(p))`; every partner declared in the splits roster appears in `perPartner` even with zero contribution.
**And** the YAML is rejected at parse with a path-cited Zod error if any `BufferBucket` is missing `targetDate` or the value is not ISO 8601 `YYYY-MM-DD`.
**And** if `from`, `to`, or `asOf` is not ISO 8601 `YYYY-MM-DD`, or `from > to`, the calculator returns `Result.fail` with a clear message.
**And** `calculateForWindow` is pure: it never reads the system clock — re-running with the same inputs yields byte-identical output regardless of `Date.now()`.

### Story 3.5: Status CLI Command

As a User,
I want a single `accounting status` command that shows my current buffer state, the safe monthly transfer for next month with its breakdown, and the upcoming forecast occurrences,
So that I can run one command on Sunday morning and answer "what's the picture?" — both for human reading at the terminal and for machine pipelines via `--json`.

**Acceptance Criteria:**

**Given** an `accounting.yaml` with valid splits, buffers (with `targetDate`), and recurring rules, plus a migrated SQLite ledger,
**When** I run `accounting status` (no flags),
**Then** the CLI prints three labeled sections to stdout: **Buffers** (table of name/balance/target/cap/status/targetDate per bucket), **Transfer** (totalRequired + per-partner contributions + line items grouped by category, prefaced by Conversational-CFO prose), **Forecast** (date/name/category/amount per upcoming recurring occurrence in the window).
**And** the default `asOf` is "today" derived from `Date.now()`, normalized to `YYYY-MM-DD` in the config's `timezone`; `--as-of <YYYY-MM-DD>` overrides for determinism.
**And** the default window is the next calendar month from `asOf` — `[first-of-next-month, last-of-that-month]`. `--from <YYYY-MM-DD> --to <YYYY-MM-DD>` overrides; both must be ISO 8601 and `from <= to`.
**And** `--json` switches output to a single-object JSON document matching the documented shape (`{ asOf, window, buffers, transfer, forecast }`); `Money` values serialize via `Money.toString()`.
**And** when `SafeTransferCalculator.calculateForWindow` fails (stale `targetDate`, `monthsRemaining=0`, etc.), the CLI renders **Buffers** normally, prints the calc error + a Suggested-action prose line in the **Transfer** section, and exits with code 0. JSON shape: `transfer: { error, suggestedAction }` (no `totalRequired`/`perPartner`/`lineItems` keys when failed).
**And** `accounting status` is read-only: no DB writes, no snapshot. It runs `assertMigrated` to fail fast on an unmigrated DB.
**And** invalid CLI input (bad date format, `from > to`, missing `accounting.yaml`) exits with POSIX code 2 and a path-cited message on stderr; unrecoverable runtime errors (DB read failure, currency mismatch) exit with code 1.
**And** the underlying upstream services remain pure: `runStatusCommand` injects `clock: () => string` (defaulting to `nodeClock`) so unit tests run without `Date.now()`.

## Epic 4: Trust, Transparency & Lifecycle

**Goal:** Solidify trust with human-readable explanations ("Conversational CFO"), allow for error correction (Soft Edits), and provide data portability/lifecycle management.
**FRs covered:** FR14, FR19, FR20, FR21, FR23

*Detailed stories to be defined during implementation.*
