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
FR14: Epic 4 - Correction
FR15: Epic 2 - Double-Entry Consistency
FR16: Epic 1 - Multi-Currency Support
FR17: Epic 2 - Snapshot Safety
FR18: Epic 3 - Status View
FR19: Epic 4 - Conversational Explanations
FR20: Epic 4 - JSON Output (Global Requirement, primarily exposed here)
FR21: Epic 4 - Graceful Dissolution
FR22: Epic 3 - Deterministic Math
FR23: Epic 4 - Audit Trail
FR24: Epic 5 - Year-in-Review Analyzer
FR25: Epic 5 - Plan-File Iteration Loop
FR26: Epic 5 - Recurring Drift Detection
FR27: Epic 5 - Config Diff & Apply
FR28: Epic 5 - Agent Ritual Guidance

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
**Goal:** Solidify trust with human-readable explanations ("Conversational CFO"), allow for error correction (the `correct` command), and provide data portability/lifecycle management.
**User Value:** "I understand *why* the numbers are what they are, I can fix my mistakes, and I own my data."
**FRs covered:** FR14, FR19, FR20, FR21, FR23

### Epic 5: Year-in-Review & Annual Planner
**Goal:** Close the bootstrap gap in FR2 — replace hand-guessed buffer targets with evidence-derived ones. Reframed by the story-5.0 intent interview (2026-07-20/21): the annual ritual is an **agent-mediated planning conversation for the couple** — an LLM agent drives review → discuss → revise → apply in dialogue; the CLI stays the deterministic engine exposing evidence-rich `--json`. Trust comes from **coherence across time** — proposals tie visibly to last year's actuals and the couple's stated expectations — and the plan file doubles as a **durable record of intent** that next year's review opens against (plan-vs-actual). Primary tuning lever for the **Predictive Pre-Funding** innovation pattern (PRD § Detected Innovation Areas).
**User Value:** "We stop negotiating over Excel. The agent walks us from last year's evidence to numbers we both accept — and next year's review starts by showing how our intents played out."
**FRs covered:** FR24, FR25, FR26, FR27, FR28

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
**And** `accounting status` is read-only: no snapshot, and no DB writes **except** the sanctioned ambient audit observation — recording a detected `ConfigChanged` event and updating the last-seen config state (Story 4.5a amendment, user-approved 2026-07-17). It runs `assertMigrated` to fail fast on an unmigrated DB.
**And** invalid CLI input (bad date format, `from > to`, missing `accounting.yaml`) exits with POSIX code 2 and a path-cited message on stderr; unrecoverable runtime errors (DB read failure, currency mismatch) exit with code 1.
**And** the underlying upstream services remain pure: `runStatusCommand` injects `clock: () => string` (defaulting to `nodeClock`) so unit tests run without `Date.now()`.

## Epic 4: Trust, Transparency & Lifecycle

**Goal:** Solidify trust with human-readable explanations ("Conversational CFO"), allow for error correction (the `correct` command), and provide data portability/lifecycle management.
**FRs covered:** FR14, FR19, FR20, FR21, FR23

Story shapes converge from the Epic-4 defining model note ([docs/domain/model-notes/story-4.0.md](domain/model-notes/story-4.0.md), issue #156): corrections use **reverse-and-correct** (a reversal + a correcting entry), and every meaningful action is recorded as a plain **domain event** via the `DomainEventRecorder` port (#155).

**Sequencing:** 4.1 → 4.2, then 4.3 (independent of 4.2 since its 2026-07 reframe — see Story 4.3) with 4.4 parallel → 4.5. Story 4.1 ships the FR23 spine (the recorder port + append-only event store) that every later event depends on. **Epic-5 Story 5.4 dependency:** its `--apply` emits an audit-trail entry, so it needs the port (4.1) *and* the `ConfigChanged` event (4.5) before it can ship.

### Story 4.1: DomainEventRecorder Port & Append-Only Event Store

As a **System**,
I want a Core `DomainEventRecorder` port with an append-only Infra event store, wired first to the ingest path emitting a `TransactionIngested` event,
So that every meaningful action from here on can be recorded as an immutable, ordered audit trail (FR23) — starting with the simplest existing action to prove the pattern.

**Lane:** Full (touches `src/core/`). Model note derives from [story-4.0](domain/model-notes/story-4.0.md). Introduces the port (#155). Decides the recorder call-site (inside-service vs app-boundary — deferred from story-4.0). First because it unblocks every later event and Epic-5 Story 5.4.

### Story 4.2: Correction (Reverse-and-Correct)

As a **User**,
I want to correct a past transaction — via the `correct` command — that writes a reversal and a correcting entry without erasing the original,
So that I can fix mistakes (any field — amount, category/account, date, description) while the full history stays on the record.

**Lane:** Full. Carries the story-4.0 fork decisions: reverse-and-correct; original date on both new rows; **required** free-text reason; all three rows visible by default; no actor recorded; corrections may themselves be corrected (unlimited `correctsId` chain). `CorrectionService` (domain service), `correctsId` + `kind` on `Transaction`, emits `TransactionCorrected` via the 4.1 recorder. Depends on 4.1. Split 4.2a/4.2b if > 3 scenarios.

### Story 4.3: Settlement Variance Explanation (FR19)

As a **couple at the monthly settle ritual**,
we want an itemized, penny-perfect breakdown of how this month's suggested transfer differs from last month's — per cause and per partner — plus how last month's actual transfers compared to the suggestion,
So that both of us understand and trust the number without reconstructing it from memory.

**Lane:** Full (new Core module `src/core/settlement/` + `ContributionQuery` port + config extension). *Reframed by user interview 2026-07-07/08* (model note: [docs/domain/model-notes/story-4.3.md](domain/model-notes/story-4.3.md)): the original correction-narration reading ("increased due to a corrected heating bill") did not match the need — corrections fold into balances silently; a per-transaction correction-story view is deferred to its own issue. Movement diffs two `SafeTransferCalculation` windows; follow-through compares the ledger's actual settlement credits (Contributions) to the suggestion. No longer depends on 4.2. **Split: 4.3a (Core + Infra) / 4.3b (CLI `explain` command), 4.2 precedent.**

### Story 4.4: Global JSON Output (FR20)

As a **User**,
I want every command to support `--json`,
So that I can pipe results into external dashboards and scripts.

**Lane:** Reduced (CLI/Infra, `No model impact`). **Audit current `--json` coverage first** — `status` (3.5) and other commands already expose it; this story fills the gaps and documents the global contract (`Money` via `Money.toString()`). Parallel-able with 4.2/4.3.

### Story 4.5: Config-Change & Dissolution Events (FR21, FR23 completion)

As a **User**,
I want config changes and a graceful dissolution (export + secure wipe) recorded as domain events,
So that the audit trail is complete and I can port or wind down my data as a deliberate, recorded act.

**Lane:** Full for the events; dissolution export/wipe is Infra-heavy. Emits `ConfigChanged`, `DataExported`, and `DissolutionPerformed` via the 4.1 recorder (`DataExported` added at the Phase-0 model session — the two-act dissolution shape makes the standalone export its own recorded fact); promotes the reserved **Dissolution** glossary term. Depends on 4.1; precedes Epic-5 Story 5.4 (which consumes `ConfigChanged`). **Split: 4.5a (config-change detection + `ConfigChanged`) / 4.5b (export bundle + `DataExported`) / 4.5c (proof-gated wipe + receipt + `DissolutionPerformed`) — 4.2/4.3 precedent; the 4.5b/4.5c split of the two composed dissolution acts was decided at 4.5b planning (user-approved 2026-07-17).** Model note: [docs/domain/model-notes/story-4.5.md](domain/model-notes/story-4.5.md).

## Epic 5: Year-in-Review & Annual Planner

**Goal:** Close the bootstrap gap in FR2 (define buffers via YAML): replace hand-guessed buffer targets with evidence-derived ones. The annual ritual is an **agent-mediated planning conversation for the couple**: an LLM agent (FR28) drives review → discuss → revise → apply in dialogue with both partners; the CLI stays the deterministic engine — analyzer, revise recompute, recurring challenger, apply — exposing evidence-rich `--json` (the story-4.4 agents-are-the-consumer ruling applied at epic scale). Trust comes from **coherence across time**: every proposal ties visibly to last year's actuals and the couple's stated expectations for the coming year, and the plan file doubles as a **durable record of intent** that next year's review opens against (**plan-vs-actual**). Primary tuning lever for **Predictive Pre-Funding** (PRD § Detected Innovation Areas), serving the **Buffer Utilization > 90%** and **Fixed Cost Prediction < 5% variance** success criteria.
**FRs covered:** FR24, FR25, FR26, FR27, FR28

**Intent provenance (story-5.0, 2026-07-20/21).** Interview-refreshed per the story-4.3 lesson — supersedes the original December-solo-CFO-at-terminal framing. Rulings: (1) the analyzer assumes the ledger already holds the household's history — bootstrapping it (ingesting ~a year of bank exports through the normal Epic-2 pipeline, helped by #105) is *not* Epic-5 scope; (2) **one file does both jobs** — the plan file is the loop's working state *and* the kept intent record; (3) Epic 5 owns agent enablement (FR28 / Story 5.5); (4) year-1 coherence means "vs raw history" — the design stores what year-2 plan-vs-actual needs, but multi-year analytics is not a deliverable. The pain being killed: **agreeing on next year's numbers** (today: Excel).

**Scope guard — established-ledger ritual.** Assumes the ledger holds the household's history. Below 12 ingested months the analyzer degrades gracefully (states the window, widens caveats) — it never refuses. Still not part of the < 7-day Time-to-Trust onboarding metric (PRD § Measurable Outcomes).

**Currency scope.** Single-currency MVP throughout, mirroring Epic 3 (3.2, 3.4, 3.5). Forex deferred.

**Sequencing.** Fully unblocked — 5.4's audit-trail dependency shipped in Epic 4 (4.1 `DomainEventRecorder`; 4.5a `ConfigChanged` with origin `'external' | 'applied'`, the `'applied'` arm reserved for 5.4 to emit). Order: 5.1 → 5.2a → 5.2b → 5.3 → 5.4 → 5.5; 5.3's detection core can start after 5.1, but its proposals land in the 5.2a plan file.

**CLI surface.** Unchanged from the original frame: a subcommand under the existing `config` verb (preserves PRD § CLI Tool Specific Requirements verb count) — `accounting config plan --review` · `--revise <plan-file>` · `--apply <plan-file>`; `--json` + `--non-interactive` everywhere (PRD § Dual Output, § Mode Separation). The agent narrates; the engine proves.

**Story texts are cards, not contracts (story-4.0 precedent).** Each story runs its own Phase-1 interview + (where marked) Phase-0 model session; the pre-reframe detailed ACs (git history, pre-story-5.0 `epics.md`) remain input material for per-story planning.

### Story 5.1: Year-in-Review Analyzer (read-only)

As **the couple, in conversation with our agent**,
we want `accounting config plan --review` to turn the ledger into an evidence-linked year-in-review — opening with plan-vs-actual when a prior year's plan exists,
So that the negotiation over next year's numbers starts from shared evidence, not memory.

**Lane:** Full. **Carries forward from the pre-reframe AC set:** read-only on ledger and live config (only the scratch plan file is written); trailing-12-months default window (`--from --to` / `--window` overrides); occurrences covered by an active `recurring:` rule excluded via the Story 2.2 idempotency-hash matcher; per-candidate `proposedTarget` (90th-percentile monthly spend) with `worstCaseTarget` (max-month × 1.2) alongside for informed override, plus `proposedCap` / `proposedFillMonths` / `firstExpectedOccurrence`; every depletion event classified **Model Failure** vs **User Spending** in Mea-Culpa voice (PRD Innovation #1, Journey 3) — retained as supporting evidence inside the coherence story, no longer the headline; report sections **Window summary** · **Existing buffers** · **New candidates** · **One-offs** (no default; decided in the revise round) · **Annual split contribution** (`getSplitsAsOf(today)`); side-emits `plan-<year>.yaml` with every proposal under `proposed:` plus empty decision blocks; `--json` single-object + `--non-interactive` parity; pure under clock injection; POSIX 2 invalid input / 1 runtime; the category→bucket grouping heuristic stays a **Phase-1 research spike** converged with the user before implementation.

**New per story-5.0:** optional prior-plan input adds a leading **Plan-vs-actual** section (per recorded intent: expected → actual → gap); partial windows (< 12 months) degrade gracefully — state the window, widen caveats, never refuse; single-currency `Result.fail` unchanged.

### Story 5.2a: Plan-File Schema & Parser

As **the couple**,
we want one strictly-typed plan file that is both the revise loop's working state and the year's kept **intent record**,
So that hand or agent edits parse with path-cited errors — and the file still reads honestly a year later.

**Lane:** Full. **Carries forward:** Zod schema over `proposed:` (read-only echo, ignored on revise) · `userOverrides:` (per-bucket `target` / `cap` / `rename` / `drop` / `add`) · `lifeEvents:` (`multiplier` ∈ [0.1, 10], optional `fromMonth` ∈ [1, 12], free-text `note`) · `inflation:` (global ∈ [0%, 50%] or per-bucket map) · `oneOffDecisions:` (`dedicate-buffer | exclude | recurring`) · `recurringProposals:` (`accepted: bool`); unrecognized keys and type/range violations fail path-cited (no PII echoed), same convention as `accounting.yaml` loading; an empty plan parses as a no-op; parser pure (no side effects, no DB, no clock).

**New per story-5.0:** every decision block accepts an optional free-text `why` (intent capture — `lifeEvents.note` generalized); kept-artifact conventions (canonical path, naming, prior-year discovery for 5.1's plan-vs-actual) are modeled here. **Phase-0 model session** for the Plan/Intent domain shape; new glossary vocabulary proposed for user sign-off in the same PR.

### Story 5.2b: Revise Loop & Validation

As **the couple's agent**,
I want `accounting config plan --revise plan-<year>.yaml` to recompute deterministically and return structured `previous → current` deltas plus floor/ceiling warnings,
So that each conversational round lands on checkable numbers and the loop converges instead of getting stuck.

**Lane:** Full. **Carries forward:** re-runs the analyzer with overrides + life events + inflation applied, emitting per-bucket `previous → current` deltas and an updated scratch file; effective target = `proposedTarget × inflation × lifeEvent.multiplier` (in that order), user override replaces the result; validation warns in Conversational-CFO voice, never errors (cases: target below worst-case month, cap below target, `targetDate` later than `firstExpectedOccurrence`, `fromMonth` out of range, life event on a spend-free category); idempotent — an unchanged plan yields all-zero deltas; `--json` `{ window, deltas, warnings, currentReport, planFilePath }` + `--non-interactive` parity; read-only on ledger and live config; pure under clock injection.

**New per story-5.0:** the `--json` deltas and warnings are agent-first — structured, machine-checkable fields the agent narrates to the couple (prose secondary).

### Story 5.3: Recurring Challenger

As **the couple**,
we want the planner to challenge our `recurring:` rules against the ledger — with confidence scores and inline evidence,
So that drift (price changes, dropped subscriptions, missed amendments) and unrecorded patterns surface alongside the buffer plan — directly serving the **Fixed Cost Prediction < 5% variance** success criterion.

**Lane:** Full. **Substance unchanged by the reframe:** the `--review`/`--revise` report gains a **Recurring drift** section — **Amend** (rule charged a different amount than its latest amount/amendment for ≥2 consecutive occurrences → propose new amendment with `validFrom`) · **Remove** (zero matching entries for ≥3 consecutive cadence steps → propose `validTo` at last-seen month) · **Add** (ledger pattern matching monthly/quarterly/annual cadence within ±1 day / ±5% for ≥6 occurrences, not covered by an existing rule → propose new rule); every proposal carries confidence ∈ [0, 1] + supporting occurrence dates/amounts; proposals land in `recurringProposals:` for per-item accept/reject in the next revise round; the "covered" matcher reuses the Story 2.2 idempotency-hash logic (single source of truth); `--json` `recurringDrift: { amend, remove, add }` + `--non-interactive` parity; read-only; pure under clock injection.

### Story 5.4: Apply Diff to Config

As **the couple**, confirmed by a human at the gate,
we want `accounting config plan --apply plan-<year>.yaml` to write the converged plan to `accounting.yaml` via a previewed, snapshotted, comment-preserving diff — and to keep the plan as the year's intent record,
So that the live config reflects what we agreed with surgical precision, and "why did the config change?" has an answer months later.

**Lane:** Full. **Carries forward:** unified diff scoped to `buffers:` + `recurring:` sections only, every other section byte-identical, presented in Conversational-CFO voice; confirmation `y` / `n` / `--yes` (`--non-interactive` without `--yes` exits POSIX 2, path-cited); snapshot to immutable `accounting.yaml.bak.<ISO-timestamp>` before write (append-only principle, never overwritten); comment-preserving round-trip YAML patch; new buffers' `targetDate` from `firstExpectedOccurrence` (life-event buckets with no ledger trace default to plan-year `12-31`, flagged "user-supplied baseline"); post-write end-to-end re-load (Zod + validity windows + buffer constraints) with restore-from-snapshot and non-zero exit on failure — live config never left invalid; the only Epic-5 command that mutates the live config, never the ledger; `--json` `{ snapshotPath, diff, auditEntryId, applied: true }` (or `applied: false, reason`).

**New per story-5.0:** emits `ConfigChanged` with origin **`applied`** via the 4.1 recorder — the second arm of the 4.5a discriminator, first emitted here — audit entry `{ when, planFilePath, snapshotPath, diffHash, acceptedItemCount }`, bucket names under the system-wide redaction policy (PRD § Compliance & Data Privacy); on success the plan file is finalized at the 5.2a kept-artifact path as the year's **intent record**.

### Story 5.5: Agent Ritual Guidance (FR28)

As **an LLM agent driving the ritual**,
I want the repo to teach me the loop — command sequence, JSON fields, exit-code branching, confirmation gates,
So that any capable agent can mediate the annual conversation without reverse-engineering the CLI.

**Lane:** Reduced (ships agent-facing spec material — R26). **Scope:** extend [docs/cli-json-contract.md](cli-json-contract.md) with the **plan-loop flow** (review → revise → apply sequence, envelope fields per command, exit-code branching); ship the ritual playbook (in-repo skill vs agent-facing doc — surface decided at Phase 1) covering: run `--review`, narrate evidence and plan-vs-actual, capture the couple's answers as plan-file edits with `why` notes, re-run `--revise` until converged, present the diff, **apply only on explicit human confirmation**; guardrails: never edit `accounting.yaml` directly, never touch the ledger. Depends on the 5.1–5.4 surfaces being real; last in sequence.
