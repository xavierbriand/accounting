# CLAUDE.md

Instructions for Claude Code working on this repo. Read before changing code.

## 1. Project

**Couples Expense Sharing App** — a local-first, CLI-based "predictive asset-based financial engine" for couples managing joint finances. Replaces reactive joint-account top-ups with a deterministic engine that predicts fair transfers, buffers volatility, and keeps an immutable ledger.

- Full product context: [docs/product-brief-accounting-2026-02-02.md](docs/product-brief-accounting-2026-02-02.md)
- Requirements & NFRs: [docs/prd.md](docs/prd.md)
- Architecture decisions: [docs/architecture.md](docs/architecture.md)
- Epics & stories roadmap: [docs/epics.md](docs/epics.md)

**Current position:** Epic 1 (Foundation). Stories 1.1 and 1.2 are done. **Next story: 1.3 — Ledger Schema & Repository.**

**Stack:** Node.js 20, TypeScript (strict), SQLite via `better-sqlite3` (WAL mode), `dinero.js` for money, `commander` for CLI, `zod` for validation, `vitest` + `fast-check` for tests.

## 2. Architecture — Pragmatic Clean Architecture

Three layers with a strict dependency rule:

- `src/core/` — Pure domain. **Depends on nothing.** No `commander`, no `fs`, no `better-sqlite3`, no `process.exit()`. Only Dinero and TypeScript stdlib.
- `src/infra/` — Implementations of the ports declared in `src/core/ports/`. Talks to SQLite, the filesystem, and external libraries. Depends on Core via port interfaces only.
- `src/cli/` — Interface adapters. Wires Core + Infra, parses CLI args, formats output. Depends on both.

Rules:
- **Constructor DI only.** No `new SomeRepo()` inside Core. Dependencies come in through constructors.
- **Ports in `src/core/ports/`** as PascalCase interfaces without the `I` prefix (`TransactionRepository`, not `ITransactionRepository`).
- **Repositories map snake_case DB columns to camelCase domain fields** at the Infra boundary. Domain entities never see raw SQL shapes.
- **Result<T, E> in Core** — domain methods return `Result` values, never throw. The CLI layer is the only place that inspects `result.isFailure` and converts to user-facing output or process exit codes.
- **Append-only ledger.** No `UPDATE`/`DELETE` on ledger rows. Corrections are new balancing entries (reversal + correction).

## 3. Money & precision

Money bugs are the highest-severity class in this project. Rules are non-negotiable.

- **Never** use `+ - * /` directly on monetary values. Go through `Money` / Dinero methods.
- **Banker's Rounding** (round-half-to-even) everywhere rounding is needed. Already implemented in [src/core/shared/money.ts](src/core/shared/money.ts).
- **DB storage:** two columns per monetary amount — integer cents (`INTEGER NOT NULL`) plus ISO 4217 currency code (`TEXT NOT NULL`). Never store a decimal.
- **Currency mismatch is a failure**, not a warning. `Money` ops across currencies return `Result.Fail`.
- **Allocations** (splits) must use Largest Remainder so `sum(parts) == total` holds to the cent. Property-test this with `fast-check`.
- **Dates:**
  - System events (migrations, audit log timestamps): UTC.
  - Transactions: ISO 8601 **with offset** (e.g. `2026-04-21T14:30:00+02:00`). Preserves "receipt truth" — the local wall clock when the transaction actually happened.
- **Versioned rules:** config/rules that change over time (split ratios, buffer targets) use the Validity Window pattern (`valid_from`, `valid_to`). No event sourcing. Queries resolve the active rule by date.
- **SQLite:** WAL mode enabled in `sqlite-client.ts`. DB files get `chmod 0600`. Migrations are numbered SQL files under `src/infra/db/migrations/`, run by the custom runner using `PRAGMA user_version`.
- **PII:** redact IBANs, names, and similar fields in logs by default.

## 4. Style

- **File names:** kebab-case (`sqlite-transaction-repo.ts`, `ingest-use-case.ts`).
- **Types/classes:** PascalCase. Interfaces have no `I` prefix.
- **Variables/functions:** camelCase.
- **DB columns:** snake_case. Repositories translate at the boundary.
- **No `any`.** `strict: true` is mandatory. Explicit return types on exported functions.
- **No comments** except when the *why* is non-obvious (subtle invariant, workaround for a specific bug, constraint a reader would otherwise miss). Well-named identifiers are the documentation.
- **Functions:** target under ~50 lines, pure where possible.
- **Imports:** use the `@core/*` path alias when reaching into Core from elsewhere; consistent relative imports within a layer.
- **Zod** at every input boundary (CLI args, file reads, config parsing). Not inside Core.

## 5. Testing & Definition of Done

- **Coverage:** 100% **branch coverage** on everything under `src/core/`. Infra and CLI lower.
- **Unit tests** live next to the code in `src/core/**/*.test.ts` or under `tests/unit/core/**` (current convention). AAA layout.
- **Property-based tests** via `fast-check` for every financial invariant: associativity, conservation of total under allocation, idempotence where claimed. Follow the pattern in [tests/unit/core/shared/money.test.ts](tests/unit/core/shared/money.test.ts).
- **Integration tests** under `tests/integration/` exercise Infra implementations (SQLite repos, migration runner) against real SQLite.
- **Batch processing** (Epic 2+): partial success is allowed. Commit valid rows, surface the failing ones — don't fail the whole batch on a single bad row.

**Definition of Done for any story:**

1. `npm run lint && npm run build && npm test` — all green.
2. Migrations are idempotent (running twice on a fresh DB is a no-op after the first).
3. Every new invariant in Core has a property test.
4. No `any`, no TODO comments left behind, no dead code.
5. Conventional Commit subject referencing the story, e.g. `feat(core): ledger schema & repo (Story 1.3)`. One logical story per commit where practical.
6. When the work adds a new rule or constraint that a future reader would miss, add a line to the relevant section of this file rather than leaving it only in code.
