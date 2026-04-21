# Engineering Standards

How we build. Authoritative reference for the **P3** critical review (plan) and the P3 retro-check (implementation) described in [CLAUDE.md § 6.1](../CLAUDE.md). On conflict with a summary elsewhere, this document wins.

The distinction from [quality-assurance.md](quality-assurance.md) and [security-checklist.md](security-checklist.md): engineering is about *how the code is structured and defended*; quality is about *what it promises to users*; security is about *attack surface*. P3 reviewers walk this doc plus the security checklist.

## Architecture principles

- **Clean Architecture.** Core / Infra / CLI with a strict dependency rule. Core depends on nothing; Infra depends on Core via Ports; CLI depends on both. See [architecture.md](architecture.md) for the concrete design.
- **Ports & Adapters.** Every Infra dependency (SQLite, filesystem, CSV parsers, clock) is expressed as a Port in `src/core/ports/` and implemented as an Adapter in `src/infra/`. Core never imports from Infra.
- **`Result<T, E>` over exceptions.** Core methods return `Result` values. Exceptions only at the outermost CLI boundary, for truly unexpected failures. No try/catch in Core logic.
- **Constructor DI only.** Dependencies enter via the constructor. No `new SomeRepo()` inside Core. No service locators, no DI containers — manual wiring in the CLI entry point is fine for a project this size.

## SOLID — applied pragmatically

We use SOLID where it concretely buys readability, testability, or flexibility we actually need. Violations are only flagged in P3 when they hurt something real. Ceremonial application (an interface per class, "just in case") is itself a violation of KISS.

- **SRP.** A class or module does one thing. If a reviewer needs "and" to describe its responsibility, split it.
- **OCP.** New behaviour preferably arrives as a new type implementing an existing Port, not as edits to existing Core classes. Edit Core only when the contract itself changes.
- **LSP.** Any implementation of a Port behaves in all the ways Core relies on, including failure modes. An adapter that throws where the Port says `Result.fail` violates this.
- **ISP.** Ports are small and cohesive. A repository Port with methods for five unrelated queries is probably two or three Ports wearing a trench coat.
- **DIP.** Core depends on abstractions (Ports), not on concretions. If Core imports `better-sqlite3`, something is wrong.

## KISS

The simplest thing that makes the tests green is the default. If a reviewer can propose a simpler implementation that passes the same tests, the current version loses.

- No "just in case" abstractions.
- No frameworks we don't need today.
- No configurability where a hard-coded value works and isn't a user-facing concern.

## YAGNI

We don't build for tomorrow's hypothetical requirement.

- No speculative features.
- No hooks, extension points, or plugin systems until at least two concrete callers exist.
- No generics, no overloads, no configuration flags without a present user.

## Minimizing attack surface

Every new external input, file path, SQL statement, or dependency is scrutinized at P3. Walk [security-checklist.md](security-checklist.md) in full during every P3. A new dependency is treated as a non-trivial decision, not a reflex.

- Prefer prepared statements (`better-sqlite3` enforces this).
- Zod schemas at every external boundary; never inside Core.
- Least-privilege file permissions (`0600` for DB and config).
- New dependencies require a one-line rationale in the PR; dev-deps have a lower bar than runtime deps.

## Testing tiers

| Tier | Location | Runner | Purpose |
| --- | --- | --- | --- |
| Acceptance | `tests/features/*.feature` + `tests/features/steps/*.ts` | `quickpickle` (vitest-native) | Outside-in BDD: one scenario per user-visible behaviour |
| Unit | `tests/unit/<mirror-of-src>/**/*.test.ts` | vitest | AAA pattern; mock all Ports for Core |
| Property | colocated with unit | vitest + `fast-check` | Financial invariants (allocation sum, associativity, etc.) |
| Integration | `tests/integration/` (created when first needed) | vitest | Exercise Infra implementations against real SQLite/FS |

## Coverage

- **100% branch coverage** on everything under `src/core/`. Non-negotiable.
- Infra and CLI lower, but every branch (happy path, error path) is still exercised with intent. No "covered by accident" lines.
- Coverage reports are advisory; the review looks at *which branches aren't covered*, not just the percentage.

## TDD rhythm

Outside-in, strict sequence:

1. Write the failing acceptance scenario first — `test:` commit.
2. Drop to failing unit tests for the first slice — `test:` commit.
3. Implement the minimum to go green at the unit level — `feat:` commit.
4. Work your way up until the acceptance scenario also goes green — more `feat:` commits as needed.
5. Refactor while all tests stay green — `refactor:` commit.

No "tests and implementation together" commits. No "write the tests after the code."

## Style

- **File names:** kebab-case (`sqlite-transaction-repo.ts`).
- **Types / classes:** PascalCase. No `I` prefix on interfaces.
- **Variables / functions:** camelCase.
- **DB columns:** snake_case. Repositories translate at the boundary.
- **No `any`.** `strict: true` is mandatory. Explicit return types on exported functions.
- **No comments** except when the *why* is non-obvious. Well-named identifiers are the documentation.
- **Functions under ~50 LOC**, pure where possible.
- **Imports:** `@core/*` alias when reaching into Core from elsewhere; consistent relative imports within a layer.
- **Zod** at external boundaries only; never inside Core.

## Refactor-during-green allowance

Obvious local cleanups — rename a variable, extract a tiny helper, collapse a duplicated literal into a constant — are allowed while tests are green, so long as behaviour is preserved and all tests still pass.

Anything structural is deferred to the post-review refactor phase:

- Introducing a new abstraction (interface, base class, factory).
- Cross-module moves.
- Touching more than ~20 LOC of existing (not newly-written) code.

When Sonnet uses the allowance, it calls it out in the return report's "Deviations" section.

## Maintainability indicators used in P3

Reviewers actively look for these:

- **Duplication** that represents the same intent (DRY), not just coincidental resemblance.
- **Coupling spikes** — a new cross-layer import, a Core file suddenly importing from Infra.
- **Naming drift** — the name no longer describes what the code does after the change.
- **Dead code** — unused exports, commented-out blocks, orphan TODOs.
- **Over-abstraction** — a single implementation behind an interface that "might grow" (usually it won't; collapse it).
- **Premature concurrency or caching** (YAGNI).
