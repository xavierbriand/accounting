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

*Detailed stories to be defined during implementation.*

## Epic 4: Trust, Transparency & Lifecycle

**Goal:** Solidify trust with human-readable explanations ("Conversational CFO"), allow for error correction (Soft Edits), and provide data portability/lifecycle management.
**FRs covered:** FR14, FR19, FR20, FR21, FR23

*Detailed stories to be defined during implementation.*
