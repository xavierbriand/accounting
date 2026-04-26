# Architecture Decisions

> **See also**
> - [prd.md](prd.md) — functional & non-functional requirements this architecture serves.
> - [epics.md](epics.md) — roadmap; which architectural pieces land in which epic.
> - [quality-assurance.md](quality-assurance.md) — product QA invariants (P2 review).
> - [engineering-standards.md](engineering-standards.md) — how we build (P3 review). **Naming, DI, testing tiers, style, and refactor policy live there, not here.** This document records architectural *decisions*; engineering-standards captures the *patterns* applied across them.
> - [security-checklist.md](security-checklist.md) — attack surface (part of P3).

## Project Context

### Requirements summary

**Functional core:** An "Ingest → Tag → Predict → Settle" loop.
- **Input:** High-variability CSVs from banks.
- **Processing:** Deterministic, integer-based math engine.
- **Output:** Immutable ledger entries (SQLite) and human-readable text (CLI).

**Non-functional constraints:**
- **Local-only** — no cloud services; strict local backup/recovery responsibilities.
- **Performance** — <500ms startup for read commands rules out heavy framework init.
- **Precision** — Dinero.js mandatory for all currency ops; zero float math.

**Domain:** CLI / Fintech. Algorithmic complexity > infrastructure complexity.

**Estimated architectural components:** 5 — CLI Layer, Ingestion Engine, Core Math/Logic, Ledger/DB, Config Manager.

### Technical dependencies

- **Runtime:** Node.js 20+
- **Database:** SQLite (local file, `better-sqlite3`)
- **CLI:** `commander`
- **Math:** `dinero.js`
- **Validation:** `zod`
- **CSV:** `csv-parse`

### Cross-cutting concerns

1. **Auditability.** Every user action results in a traceable ledger event.
2. **Versioning.** Configuration rules (split ratios, buffer targets) are versioned by date to support historical recalculation.
3. **Resilience.** Snapshot mechanism is atomic and fail-safe.

## Core architectural decisions

### Money storage — dual column

- **Decision:** two columns per monetary amount — `INTEGER NOT NULL` cents + `TEXT NOT NULL` ISO 4217 currency code.
- **Rationale:** enforces currency correctness at the storage layer; allows fast SQL aggregations; makes floating-point money bugs physically impossible.

### Versioning for rules — validity window pattern

- **Decision:** rules with a start date (`validFrom`); each window's end is implicit — defined by the next window's `validFrom`, last window is open-ended. Queries resolve the active rule for any given transaction date by selecting the window whose `validFrom <= date` with the latest `validFrom`. (Story 3.1 chose the implicit-`validTo` shape; the original design considered an explicit `valid_from`/`valid_to` pair but the implicit-end form has no overlap-or-gap class of bug by construction.)
- **Rationale:** allows historical recalculation ("time travel") without the complexity of full event sourcing. Simple SQL resolves the active rule for any transaction date.

### Command execution — use case pattern

- **Decision:** CLI commands call Use Cases in Core; Core has no awareness of the CLI.
- **Rationale:** decouples interface adapter from business logic. Core logic is testable without mocking the CLI.

### Database migrations — custom lightweight runner

- **Decision:** numbered `.sql` files under `src/infra/db/migrations/`, executed by a custom runner using `PRAGMA user_version` for idempotency.
- **Rationale:** keeps dependencies low (aligns with local-only). Avoids heavy ORM migration tools that slow startup.

### Ledger — append-only

- **Decision:** no `UPDATE`/`DELETE` on ledger tables. Corrections are recorded as reversal + new correction entries.
- **Rationale:** immutability is a non-negotiable accounting invariant. The "Soft Edit" CLI command handles this transparently for the user.

### Data integrity — double-entry invariant

- **Decision:** `sum(debits) == sum(credits)` is checked in Core at construction time, before the transaction reaches the repository.
- **Rationale:** the rule lives in the domain, not the database. A repository should never receive an unbalanced transaction.

## Project structure

Target shape — directories materialise as stories implement them. This tree is the intended destination, not a snapshot of the current filesystem.

```text
accounting/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── vitest.config.js
├── src/
│   ├── core/                  # PURE DOMAIN (no external deps)
│   │   ├── ingest/
│   │   │   ├── ingest-use-case.ts
│   │   │   └── types.ts
│   │   ├── ledger/
│   │   │   ├── ledger-service.ts
│   │   │   └── transaction.ts
│   │   ├── shared/
│   │   │   ├── result.ts      # Result pattern
│   │   │   └── money.ts       # Dinero wrapper
│   │   └── ports/             # interfaces for Infra
│   │       ├── transaction-repository.ts
│   │       ├── csv-parser.ts
│   │       └── config-service.ts
│   ├── infra/                 # IMPLEMENTATION DETAILS
│   │   ├── db/
│   │   │   ├── sqlite-client.ts
│   │   │   ├── migrations/    # numbered .sql files, copied to dist/ during build
│   │   │   └── repositories/
│   │   │       └── sqlite-transaction-repo.ts
│   │   ├── csv/
│   │   │   └── node-csv-parser.ts
│   │   ├── fs/
│   │   │   └── file-system.ts
│   │   └── config/
│   │       └── config-service.ts  # XDG_CONFIG_HOME resolution
│   └── cli/                   # INTERFACE ADAPTERS
│       ├── commands/
│       │   ├── ingest-command.ts
│       │   └── report-command.ts
│       ├── utils/
│       │   ├── printer.ts     # chalk helpers
│       │   └── spinner.ts     # ora wrappers
│       └── program.ts         # entry point
├── tests/
│   ├── fixtures/              # CSV samples (valid + malformed)
│   ├── features/              # Gherkin acceptance scenarios + step defs
│   ├── unit/                  # pure Core tests (mirror of src/core/)
│   └── integration/           # DB/Infra tests against real SQLite
└── data/                      # local dev data (gitignored)
    └── ledger.db
```

### The dependency rule

- **CLI** depends on **Core**.
- **Infra** depends on **Core** (via Ports).
- **Core** depends on **nothing** (pure TypeScript + Dinero).

### Data boundaries

- **SQL boundary:** `Infra/Repositories` map SQL rows (snake_case) to domain entities (camelCase).
- **Core boundary:** domain entities use `Money` / `Dinero<number>` for money; they never see raw integers or currency strings from the DB.

### Build process

- `tsc` compiles `.ts` to `.js` in `dist/`.
- The build script also copies `src/infra/db/migrations/*.sql` to `dist/infra/db/migrations/` so the runtime can find them when running from `dist/`. Without this step, migrations would fail in any non-`tsx` execution.

### Feature to structure mapping

- **Ingestion** → `src/core/ingest/` (logic) + `src/infra/csv/` (parsing).
- **Ledger** → `src/core/ledger/` (state) + `src/infra/db/` (storage).
- **Liquidity engine** → `src/core/` (math + predictions; exact folder named during story planning).
- **Configuration** → `src/infra/config/` (location resolution, YAML parse).
- **Error handling** → `src/core/shared/result.ts`.
- **Logging / output** → `src/cli/utils/printer.ts`.
