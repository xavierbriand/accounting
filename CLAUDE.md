# CLAUDE.md

Instructions for Claude Code working on this repo. Read before changing code.

This file is an AI-facing cheat sheet. The authoritative canon lives under `docs/`:

- [docs/architecture.md](docs/architecture.md) — concrete design
- [docs/quality-assurance.md](docs/quality-assurance.md) — product-QA invariants (P2 review reference)
- [docs/engineering-standards.md](docs/engineering-standards.md) — how we build (P3 review reference)
- [docs/security-checklist.md](docs/security-checklist.md) — walkable attack-surface checklist (part of P3)
- [docs/prd.md](docs/prd.md) · [docs/epics.md](docs/epics.md) · [docs/product-brief-accounting-2026-02-02.md](docs/product-brief-accounting-2026-02-02.md)
- [docs/retrospectives/](docs/retrospectives/) — one Keep/Change/Try file per completed story

On conflict between this file and a `docs/` file, `docs/` wins. The retrospective phase reconciles drift.

## 1. Project

**Couples Expense Sharing App** — a local-first, CLI-based "predictive asset-based financial engine" for couples managing joint finances. Replaces reactive joint-account top-ups with a deterministic engine that predicts fair transfers, buffers volatility, and keeps an immutable ledger.

**Current position:** Epic 1 (Foundation). Stories 1.1 and 1.2 are done. **Next story: 1.3 — Ledger Schema & Repository.** *This line is refreshed by the retrospective phase of each story.*

**Stack:** Node.js 20, TypeScript (strict), SQLite via `better-sqlite3` (WAL mode), `dinero.js` for money, `commander` for CLI, `zod` for validation, `vitest` + `fast-check` + `quickpickle` (when BDD starts) for tests.

## 2. Architecture — Pragmatic Clean Architecture

Three layers with a strict dependency rule:

- `src/core/` — Pure domain. **Depends on nothing.** No `commander`, no `better-sqlite3`, no `process.exit()`. No Node APIs (`fs`, `path`, `os`, `crypto`, …). Only Dinero and pure TypeScript.
- `src/infra/` — Implementations of the ports declared in `src/core/ports/`. Talks to SQLite, the filesystem, and external libraries. Depends on Core via port interfaces only.
- `src/cli/` — Interface adapters. Wires Core + Infra, parses CLI args, formats output. Depends on both.

Rules:
- **Constructor DI only.** No `new SomeRepo()` inside Core. Dependencies come in through constructors.
- **Ports in `src/core/ports/`** as PascalCase interfaces without the `I` prefix (`TransactionRepository`, not `ITransactionRepository`).
- **Repositories map snake_case DB columns to camelCase domain fields** at the Infra boundary. Domain entities never see raw SQL shapes.
- **Result<T, E> in Core** — domain methods return `Result` values, never throw. The CLI layer is the only place that inspects `result.isFailure` and converts to user-facing output or process exit codes.
- **Append-only ledger.** No `UPDATE`/`DELETE` on ledger rows. Corrections are new balancing entries (reversal + correction).

## 3. Money & precision

> Full authoritative checklist: [docs/security-checklist.md](docs/security-checklist.md) and product invariants in [docs/quality-assurance.md](docs/quality-assurance.md). This section is the short version for quick reference.

- **Never** use `+ - * /` directly on monetary values. Go through `Money` / Dinero methods.
- **Banker's Rounding** (round-half-to-even) everywhere rounding is needed. Already implemented in [src/core/shared/money.ts](src/core/shared/money.ts).
- **DB storage:** two columns per monetary amount — integer cents (`INTEGER NOT NULL`) plus ISO 4217 currency code (`TEXT NOT NULL`). Never store a decimal.
- **Currency mismatch is a failure**, not a warning. `Money` ops across currencies return `Result.Fail`.
- **Allocations** (splits) must use Largest Remainder so `sum(parts) == total` holds to the cent. Property-test this with `fast-check`.
- **Dates:**
  - System events (migrations, audit log timestamps): UTC.
  - Transactions: ISO 8601 **with offset** (e.g. `2026-04-21T14:30:00+02:00`). Preserves "receipt truth" — the local wall clock when the transaction actually happened.
- **Versioned rules:** config/rules that change over time (split ratios, buffer targets) use the Validity Window pattern (`valid_from`, `valid_to`). No event sourcing. Queries resolve the active rule by date.
- **SQLite:** WAL mode enabled in [src/infra/db/sqlite-client.ts](src/infra/db/sqlite-client.ts). DB files **must** be created with `0600` permissions (rule — not yet enforced in code; wire this in when Story 1.4 lands). Migrations are numbered SQL files under `src/infra/db/migrations/`, run by the custom runner using `PRAGMA user_version`.
- **PII:** redact IBANs, names, and similar fields in logs by default.

## 4. Style

> Full authoritative standards: [docs/engineering-standards.md](docs/engineering-standards.md). This section is the short version.

- **File names:** kebab-case (`sqlite-transaction-repo.ts`, `ingest-use-case.ts`).
- **Types/classes:** PascalCase. Interfaces have no `I` prefix.
- **Variables/functions:** camelCase.
- **DB columns:** snake_case. Repositories translate at the boundary.
- **No `any`.** `strict: true` is mandatory. Explicit return types on exported functions.
- **No comments** except when the *why* is non-obvious. Well-named identifiers are the documentation.
- **Functions:** target under ~50 lines, pure where possible.
- **Imports:** use the `@core/*` path alias when reaching into Core from elsewhere; consistent relative imports within a layer.
- **Zod** at every input boundary (CLI args, file reads, config parsing). Not inside Core.

## 5. Testing

> Full standards: [docs/engineering-standards.md](docs/engineering-standards.md#testing-tiers). Product invariants to test for: [docs/quality-assurance.md](docs/quality-assurance.md).

- **Coverage:** 100% **branch coverage** on everything under `src/core/`. Infra and CLI lower.
- **Acceptance tests** live under `tests/features/*.feature` with step definitions in `tests/features/steps/*.ts`, run through `quickpickle` (vitest-native). Every user-visible behaviour must have an acceptance scenario written *before* implementation starts — see § 6 and § 7.
- **Unit tests** live under `tests/unit/<mirror-of-src>/**/*.test.ts`. Single canonical location, no colocation.
- **Property-based tests** via `fast-check` for every financial invariant: associativity, conservation of total under allocation, idempotence where claimed. Follow the pattern in [tests/unit/core/shared/money.test.ts](tests/unit/core/shared/money.test.ts).
- **Integration tests** under `tests/integration/` exercise Infra implementations against real SQLite (`tests/integration/` is created when the first integration test is written — does not exist yet).
- **Testing pattern:** AAA (Arrange-Act-Assert) for unit and integration tests. Given/When/Then via Gherkin step definitions for acceptance tests — see § 7.
- **Batch processing** (Epic 2+): partial success is allowed. Commit valid rows, surface the failing ones — don't fail the whole batch on a single bad row.

## 6. Development workflow

The loop has two formal gates:
- **Definition of Ready (DoR)** — met when phases 1 and 2 below are complete.
- **Definition of Done (DoD)** — met when phases 3, 4, 5, and the merge checklist are all complete.

### 6.1 Phases

Phases 1 and 2 together compose DoR. Phases 3 and 4, plus the merge checklist, compose DoD. Phase 5 is continuous-improvement and must complete before merge.

1. **Plan** (Opus): collect intent → diverge on solutions → converge on one → capture Gherkin behaviour → open draft PR → hand-off plan for Sonnet. *Exit:* draft PR exists with PR-template sections 1–6 filled.
2. **Critical review on the plan** (Opus, 3 passes before implementation):
   - **P1 — Functional.** Does the planned solution satisfy the target FR/NFRs in [docs/prd.md](docs/prd.md) and the story description in [docs/epics.md](docs/epics.md)? Is the Gherkin complete and unambiguous?
   - **P2 — Product Quality / QA.** Walk [docs/quality-assurance.md](docs/quality-assurance.md). Does the plan preserve accounting correctness, privacy compliance, and coherence with the product brief?
   - **P3 — Engineering.** Walk [docs/engineering-standards.md](docs/engineering-standards.md), [docs/architecture.md](docs/architecture.md), and [docs/security-checklist.md](docs/security-checklist.md). Is the plan structurally sound — clean architecture, SOLID where it buys something, KISS, YAGNI — and does it minimize attack surface?

   Each suggestion is tagged **adopted / deferred / rejected** in the PR's Suggestion Log (section 7 of the template). Deferred items **must** link a GitHub issue created from the `deferred-suggestion` template — no bare "deferred". Rejected items must carry a one-line reason.

   *Exit (the **DoR gate**):* no un-tagged suggestions; plan re-written to incorporate adopted items; every deferred item has a GitHub issue link.

3. **Implement** (Sonnet via `Task` with the `sonnet-implementer` agent): writes failing acceptance scenario first, drives down to failing unit tests, makes green, commits per state. Returns the structured report (see 6.3). *Exit:* all tests green, report delivered, branch pushed. (The PR is not marked ready yet.)

4. **Code review on the implementation + refactor plan** (Opus) — re-run P1/P2/P3 **against the actual code**, not the plan:
   - **P1 retro-check.** Do the green scenarios and unit tests actually deliver the intent? Any behavioural drift from the Gherkin?
   - **P2 retro-check.** Walk [docs/quality-assurance.md](docs/quality-assurance.md) against the diff. Any product invariant broken in practice? Any new PII path?
   - **P3 retro-check.** Walk [docs/engineering-standards.md](docs/engineering-standards.md) and [docs/security-checklist.md](docs/security-checklist.md) against the diff. Any SOLID/KISS/YAGNI violation, coupling spike, new attack-surface item?

   Produce a refactor plan covering every issue (blockers are fixed before merge, not deferred). Delegate execution to Sonnet. *Exit:* refactor merged back into the same branch, CI green, every retro-check passes.

5. **Retrospective.** Keep/Change/Try file at `docs/retrospectives/story-<id>.md`. Action items either land in the same PR (CLAUDE.md / `docs/` / template edits) or become follow-up GitHub issues. *Exit:* file committed, action items tagged. Merge is **user-gated** after this.

### 6.2 Model tier

- **Opus:** planning, 3-phase critical review, code review, refactor planning, retrospective synthesis.
- **Sonnet:** failing tests, implementation, refactor execution.
- **Haiku:** not used yet.

### 6.3 Sonnet return format

Fixed template Sonnet emits at end of a Task:

```
## What was built
## Red → green sequence (per test)
## Deviations from plan (with rationale)
## Unknowns encountered
## Proposed follow-ups
## Files touched
```

See [.claude/agents/sonnet-implementer.md](.claude/agents/sonnet-implementer.md) for the full agent spec.

### 6.4 Commit convention inside a story

Commits on state transitions. Story id in every subject (e.g. `(Story 1.3)`):

- `test(<scope>): <scenario> — failing` (red)
- `feat(<scope>): <scenario> — minimal green` (green)
- `refactor(<scope>): <what>` (behaviour-preserving cleanup)

Squash on merge is optional.

### 6.5 Refactor-during-green policy

Obvious local cleanups (rename, extract small helper, collapse a duplicated literal) are allowed while tests are green, so long as behaviour is preserved and all tests still pass. Anything structural — new abstraction, cross-module move, changes that touch more than ~20 LOC of existing code — is deferred to the post-review refactor phase. Sonnet must call this out in the return report when it uses this allowance.

### 6.6 Reference docs for review phases

Three authoritative docs; CLAUDE.md does not duplicate their contents.

- [docs/quality-assurance.md](docs/quality-assurance.md) — P2 reference.
- [docs/engineering-standards.md](docs/engineering-standards.md) — P3 reference (main).
- [docs/security-checklist.md](docs/security-checklist.md) — walkable attack-surface checklist, part of P3. Run in full at every P3 (plan) and P3 retro-check (post-implementation).

On conflict, `docs/` wins; the retrospective reconciles drift.

### 6.7 Story sizing

One PR per story. If a story has more than ~3 Gherkin scenarios or would plausibly exceed one Sonnet Task round, split into sub-stories before planning.

### 6.8 Maintenance sub-loop

Runs **before the planning phase of every new story**. Unconditional; not skipped.

- **Triage open issues:** re-prioritize, close stale, link duplicates, confirm `deferred-suggestion` items are still relevant.
- **Review open Dependabot PRs:** for each, check CI green + diff + changelog. Routine bumps (patch, minor dev-dep) → merge directly, no full DoR/DoD/retro. Breaking changes, major bumps, or bumps to critical-path deps (`better-sqlite3`, `dinero.js`, `zod`, `commander`, `vitest`) → open a GitHub issue and handle as a dedicated story through the main loop.
- **`npm audit`:** any `high`/`critical` → immediate issue, fix plan, runs before the next story.

Maintenance is **lighter** than feature work: no retrospective file for routine bumps. Aggregate learnings surface at the next per-story retrospective ("dependency X keeps breaking; consider pinning / replacing").

## 7. BDD & TDD rules

### 7.1 Runner

`quickpickle` for `.feature` files, running through vitest. Install is deferred until the first story that actually needs a `.feature` file. Layout when it arrives:

- `tests/features/*.feature` — scenarios
- `tests/features/steps/*.ts` — step definitions

### 7.2 Outside-in flow

Acceptance scenario fails (pending step) → unit tests fail → implementation goes green → unit tests pass → acceptance passes → refactor.

### 7.3 Coverage rule

Unchanged from § 5: 100% branch coverage on `src/core/` via unit tests. Acceptance tests complement, do not replace, unit coverage.

### 7.4 Property-based testing

`fast-check` remains the default for financial invariants. See [tests/unit/core/shared/money.test.ts](tests/unit/core/shared/money.test.ts) for the pattern.

## 8. Definition of Done

A story is merge-ready only when **all** of:

1. `npm run lint && npm run build && npm test` — all green on CI.
2. Migrations are idempotent (running twice on a fresh DB is a no-op after the first).
3. Every new invariant in Core has a property test.
4. No `any`, no TODO comments left behind, no dead code.
5. Commits follow the `test:` / `feat:` / `refactor:` rhythm of § 6.4. Each subject references the story id.
6. All 10 sections of the PR template are filled — no `TBD` at merge.
7. Suggestion log has no un-tagged items. Every `deferred` row links a GitHub issue.
8. P1 / P2 / P3 retro-checks (§ 6.1 phase 4) all pass.
9. Retrospective file committed at `docs/retrospectives/story-<id>.md`.
10. Any new rule or constraint that came out of the retrospective has landed in the same PR as a CLAUDE.md / `docs/` / template edit — nothing ships only in code comments.
11. User has ticked the merge checklist.
