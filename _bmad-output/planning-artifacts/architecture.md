---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: 'Tue Feb 03 2026'
---

# Architecture Decisions
<!-- This file records architectural decisions for the project -->
<!-- It is built incrementally through the collaborative architecture workflow -->

## Project Information

*   **Project Name:** accounting
*   **Date:** Tue Feb 03 2026
*   **Status:** In Progress

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The system requires a robust **State Machine** to handle the "Ingest -> Tag -> Predict -> Settle" loop.
*   **Input:** High-variability CSVs from banks.
*   **Processing:** Deterministic, Integer-based math engine.
*   **Output:** Immutable Ledger entries (SQLite) and Human-readable text (CLI).

**Non-Functional Requirements:**
*   **Local-Only:** No reliance on cloud services imposes strict local backup/recovery responsibilities on the app.
*   **Performance:** <500ms startup time rules out heavy framework initialization (e.g., NestJS might be too heavy, lightweight DI preferred).
*   **Precision:** Dinero.js is mandatory for all currency ops.

**Scale & Complexity:**
*   Primary domain: CLI / Fintech
*   Complexity level: High (Algorithmic complexity > Infrastructure complexity)
*   Estimated architectural components: 5 (CLI Layer, Ingestion Engine, Core Math/Logic, Ledger/DB, Config Manager)

### Technical Constraints & Dependencies
*   **Runtime:** Node.js 20+
*   **Database:** SQLite (local file)
*   **Libraries:** `dinero.js` (Math), `commander`/`oclif` (CLI), `better-sqlite3` (DB).

### Cross-Cutting Concerns Identified
1.  **Auditability:** Every user action must result in a traceable ledger event.
2.  **Versioning:** Configuration rules (Split Ratios) must be versioned by date to support historical recalculations.
3.  **Resilience:** The "Snapshot" mechanism must be atomic and fail-safe.

## Starter Template Evaluation

### Primary Technology Domain

Node.js CLI Tool (TypeScript)

### Starter Options Considered

1.  **Oclif:** Rejected. Too opinionated; heavy dependency tree risks "Local-Only" performance limits.
2.  **Microsoft TypeScript Starter:** Rejected. Often outdated; uses Jest (we require Vitest).
3.  **Custom Clean Architecture Scaffold:** **Selected.** precise control over dependencies.

### Selected Starter: Custom Clean Architecture Scaffold

**Rationale for Selection:**
Ensures zero bloat and perfect alignment with the "Pragmatic Clean Architecture" rule. Allows us to manually wire `commander` to the Domain Layer without framework abstraction leaks.
Agreed to use a **Factory Pattern** for command registration to avoid "spaghetti code" in the CLI entry point.

**Initialization Command:**

```bash
# Initialize Project
npm init -y
npm install typescript @types/node --save-dev
npx tsc --init

# Core Dependencies
npm install commander dinero.js zod csv-parse better-sqlite3 chalk ora

# Dev/Test Dependencies
npm install vitest fast-check tsx eslint prettier @types/better-sqlite3 --save-dev
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript 5.x (Strict Mode), Node.js 20+

**Styling Solution:**
Chalk (for CLI output colorization)

**Build Tooling:**
`tsc` for production, `tsx` for fast dev execution

**Testing Framework:**
Vitest (Unit) + fast-check (Property-based)

**Code Organization:**
*   `src/core`: Pure Domain Logic (No CLI/DB deps)
*   `src/cli`: Commander Interface & UI Logic
*   `src/infra`: Database & File System Adapters

**Development Experience:**
`tsx` for instant feedback loop; Prettier + ESLint for consistency.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
*   Data Modeling for Money (Dual Column)
*   Versioning Strategy (Validity Windows)
*   Command Execution Pattern (Use Cases)

**Important Decisions (Shape Architecture):**
*   Migration Strategy (Custom Lightweight)

### Data Architecture

**Money Storage Format:**
*   **Decision:** Dual Column (Amount INTEGER, Currency TEXT)
*   **Rationale:** Enforces currency correctness while allowing fast SQL aggregations. Prevents "floating point money" bugs at the storage layer.

**Versioning for Rules:**
*   **Decision:** Validity Window Pattern (`valid_from`, `valid_to`)
*   **Rationale:** Allows historical recalculation ("Time Travel") without the complexity of full Event Sourcing. Simple SQL queries can resolve the active rule for any transaction date.

### Application Patterns

**Command Execution:**
*   **Decision:** Use Case Pattern (Clean Architecture)
*   **Rationale:** Decouples the CLI (Interface Adapter) from the Business Logic (Entities/Use Cases). Makes the core logic testable without mocking the CLI.

### Infrastructure

**Database Migrations:**
*   **Decision:** Custom Lightweight Runner (SQL Files)
*   **Rationale:** Keeps dependencies low (aligns with Local-Only philosophy). Avoids heavy ORM migration tools that might slow down startup.

### Decision Impact Analysis

**Implementation Sequence:**
1.  Initialize Custom Scaffold.
2.  Implement `MigrationRunner` and Money Type definitions.
3.  Build `IngestUseCase` with validity window logic.

**Cross-Component Dependencies:**
*   The **Use Case Pattern** requires a strict Dependency Injection setup (manual or lightweight) to inject the **SQLite Repository** into the **Domain**.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
4 areas where AI agents could make different choices (Database Naming, File Naming, Error Handling, DI).

### Naming Patterns

**Database Naming Conventions:**
*   **Snake Case (`user_id`):** Standard for SQL tables and columns.
*   **Mapping:** Repositories MUST explicitly map `snake_case` DB columns to `camelCase` Domain objects.

**Code Naming Conventions:**
*   **File Names:** Kebab-case (`ingest-use-case.ts`, `transaction-repo.ts`).
*   **Class Names:** PascalCase (`IngestUseCase`, `TransactionRepo`).
*   **Interfaces:** PascalCase, no "I" prefix (`TransactionRepository`, not `ITransactionRepository`).

### Communication Patterns

**Error Handling Patterns:**
*   **Result Pattern:** Core/Domain methods MUST return a `Result<T, E>` object (or similar structure) instead of throwing.
*   **Explicit Handling:** The CLI layer MUST check `result.isFailure` and display a formatted error message to the user.

### Structure Patterns

**Dependency Injection:**
*   **Constructor Injection:** All dependencies (Repos, Services) must be passed via constructor.
*   **Rule:** NO `new Class()` instantiation inside business logic classes.

### Enforcement Guidelines

**All AI Agents MUST:**
1.  Use `kebab-case` for all new files.
2.  Return `Result` objects from Core logic; never throw.
3.  Inject dependencies via constructor.

**Anti-Patterns:**
*   Using `float` or `double` types in SQL.
*   Calling `process.exit()` from inside the Core domain.
*   Importing `commander` or `fs` directly into `src/core`.

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
accounting/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── vitest.config.ts
├── src/
│   ├── core/                  # PURE DOMAIN (No external deps)
│   │   ├── ingest/
│   │   │   ├── ingest-use-case.ts
│   │   │   └── types.ts
│   │   ├── ledger/
│   │   │   ├── ledger-service.ts
│   │   │   └── transaction.ts
│   │   ├── shared/
│   │   │   ├── result.ts      # Result Pattern Monad
│   │   │   └── money.ts       # Dinero types
│   │   └── ports/             # Interfaces for Infra
│   │       ├── repository.interface.ts
│   │       ├── csv-parser.interface.ts
│   │       └── config-service.interface.ts
│   ├── infra/                 # IMPLEMENTATION DETAILS
│   │   ├── db/
│   │   │   ├── sqlite-client.ts
│   │   │   ├── migrations/    # .sql files (copy to dist/ in build)
│   │   │   └── repositories/
│   │   │       └── sqlite-transaction-repo.ts
│   │   ├── csv/
│   │   │   └── node-csv-parser.ts
│   │   ├── fs/
│   │   │   └── file-system.ts
│   │   └── config/
│   │       └── config-service.ts # XDG_CONFIG_HOME resolution
│   └── cli/                   # INTERFACE ADAPTERS
│       ├── commands/
│       │   ├── ingest-command.ts
│       │   └── report-command.ts
│       ├── utils/
│       │   ├── printer.ts     # Chalk helpers
│       │   └── spinner.ts     # Ora wrappers
│       └── program.ts         # Entry point (Command Factory)
├── tests/
│   ├── fixtures/              # CSV samples (valid, malformed)
│   ├── unit/                  # Pure Core tests
│   ├── integration/           # DB/Infra tests
│   └── e2e/                   # CLI full process tests
└── data/                      # Local dev data (gitignored)
    └── ledger.db
```

### Architectural Boundaries

**The Dependency Rule:**
*   **CLI** depends on **Core**
*   **Infra** depends on **Core** (via Ports)
*   **Core** depends on **NOTHING** (Pure TypeScript)

**Data Boundaries:**
*   **SQL Boundary:** `Infra/Repositories` map SQL rows (snake_case) to Domain Entities (camelCase).
*   **Core Boundary:** Domain Entities use `Dinero<number>` for money; they never see raw Integers or Strings from the DB.

### Requirements to Structure Mapping

**Feature Mapping:**
*   **Epic: Ingestion** → `src/core/ingest/` (Logic), `src/infra/csv/` (Parsing)
*   **Epic: Math Engine** → `src/core/math/` (Wrapper around Dinero)
*   **Epic: Ledger** → `src/core/ledger/` (State), `src/infra/db/` (Storage)

**Cross-Cutting Concerns:**
*   **Configuration** → `src/infra/config/` (Locating DB path)
*   **Error Handling** → `src/core/shared/result.ts` (Result Type)
*   **Logging/Output** → `src/cli/utils/printer.ts` (User feedback)

### File Organization Patterns

**Source Organization:**
*   **Features:** Grouped by folder in `Core` (`ingest`, `ledger`, `predict`).
*   **Ports:** All Interface definitions live in `src/core/ports/`.
*   **Adapters:** All Interface implementations live in `src/infra/`.

**Test Organization:**
*   **Unit:** Mirror the `src/core` structure. Mock all Ports.
*   **Integration:** Test `src/infra` implementations against real SQLite/FS.
*   **E2E:** Test the compiled CLI binary against `tests/fixtures`.

### Development Workflow Integration

**Build Process:**
*   `tsc` compiles `.ts` to `.js` in `dist/`.
*   **Critical:** Build script must copy `src/infra/db/migrations/*.sql` to `dist/infra/db/migrations/` so the runtime can find them.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
High compatibility. Node.js/TypeScript/SQLite/Commander is a standard, cohesive stack. The "Pragmatic Clean Architecture" fits the stack well, using manual dependency injection via constructors which avoids framework complexity while ensuring testability. The "Local-Only" constraint is well-supported by the choice of SQLite and file-system based configuration.

**Pattern Consistency:**
Patterns are consistent. Naming conventions (kebab-case files, PascalCase classes, snake_case DB) follow standard mappings. The Result pattern for error handling aligns with the "Functional Core" philosophy, ensuring errors are values, not exceptions.

**Structure Alignment:**
The directory structure explicitly supports the "Ports and Adapters" pattern via `src/core/ports` and `src/infra`. Integration points (CSV, DB, Config) have dedicated folders in `src/infra`, strictly isolating implementation details from the core.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
*   **Ingestion:** Fully covered by `src/core/ingest` (Logic) and `src/infra/csv` (Parsing).
*   **Math Engine:** Covered by `src/core/math` and the strict `Dinero.js` wrapper.
*   **Ledger:** Covered by `src/core/ledger` (State) and `src/infra/db` (Storage).
*   **CLI:** Covered by `src/cli` and `Commander` integration.
*   **Reporting:** Covered by `src/cli/commands/report-command.ts`.

**Functional Requirements Coverage:**
All functional requirements regarding state machine processing, input handling, and output generation are architecturally supported by the Core/Infra separation.

**Non-Functional Requirements Coverage:**
*   **Performance:** Lightweight stack (<500ms startup) supported by minimal dependencies.
*   **Precision:** Dinero.js mandate enforced in `src/core/shared/money.ts`.
*   **Resilience:** Atomic Transactions and Result Pattern ensure fail-safe operations.
*   **Auditability:** Immutable Ledger design (Append-Only) built into `TransactionRepo`.

### Implementation Readiness Validation ✅

**Decision Completeness:**
Critical decisions (Money format, Versioning, Error handling) are documented. The tech stack is finalized.

**Structure Completeness:**
A complete, specific file tree is provided. Boundaries are explicitly defined.

**Pattern Completeness:**
Naming, Error Handling, and Dependency Injection rules are clear.

### Gap Analysis Results

**Critical Gaps:**
*   **Migration Tool:** The decision for "Custom/Manual" migrations is made, but the specific implementation code is not yet written. This is the first blocker.

**Important Gaps:**
*   **Config Resolution:** `ConfigService` needs to implement specific XDG logic for cross-platform support.

### Validation Issues Addressed

*   **Migration Tool:** Acknowledged as the first implementation story.
*   **Config Service:** Identified as a testability risk; specific test case requirement noted.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
*   Clean separation of Core domain from Infrastructure.
*   Strict Money handling via Dinero.js.
*   Zero-bloat stack optimized for performance.

**Areas for Future Enhancement:**
*   Migration system could be replaced by a lightweight tool if complexity grows.
*   CLI could be upgraded to `oclif` later if plugin system is needed (unlikely).

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**
Initialize the Custom Clean Architecture Scaffold and implement the `MigrationRunner`.
