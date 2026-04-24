# Engineering Standards

How product-dev-agent expects code to be built. Authoritative reference for **P3** of `/product-dev-agent:review-plan` and the P3 retro-check of `/product-dev-agent:review-impl`. On conflict with a project-specific override, the consuming project's `docs/engineering-standards.md` (or CLAUDE.md loop-overlay) wins for that project.

The distinction from `quality-assurance-skeleton.md` and `security-checklist.md`: engineering is about *how the code is structured and defended*; quality is about *what it promises to users*; security is about *attack surface*. P3 reviewers walk this doc plus the security checklist.

## Architecture principles

- **Clean Architecture (or the project's equivalent layered architecture).** Core / Infra / Adapter (the consuming project may name layers differently — Domain/Application/Infrastructure, Hexagonal Inside/Outside, etc.). The point is a strict dependency rule: business logic depends on nothing outside itself; outside dependencies plug in via interfaces the business logic owns.
- **Ports & Adapters.** Every external dependency (database, filesystem, network, parsers, clock) is expressed as an abstraction the core owns and implemented as an adapter the core does not import. Core never imports from Infra.
- **`Result<T, E>` over exceptions** — or the language's idiomatic equivalent (Rust `Result`, Go `(T, error)`, F#/Scala `Either`, TypeScript `Result` types). Core methods return result values; exceptions only at the outermost interface boundary, for truly unexpected failures.
- **Constructor DI only.** Dependencies enter via the constructor (or the language's equivalent — function arguments, struct fields, etc.). No service locators, no DI containers — manual wiring at the entry point is fine for most projects.

## SOLID — applied pragmatically

Use SOLID where it concretely buys readability, testability, or flexibility actually needed. Violations are flagged in P3 only when they hurt something real. Ceremonial application (an interface per class, "just in case") is itself a violation of KISS.

- **SRP.** A class or module does one thing. If a reviewer needs "and" to describe its responsibility, split it.
- **OCP.** New behaviour preferably arrives as a new type implementing an existing abstraction, not as edits to existing core classes. Edit core only when the contract itself changes.
- **LSP.** Any implementation of an abstraction behaves in all the ways core relies on, including failure modes. An adapter that throws where the abstraction says "return failure" violates this.
- **ISP.** Abstractions are small and cohesive. A repository abstraction with methods for five unrelated queries is probably two or three abstractions wearing a trench coat.
- **DIP.** Core depends on abstractions, not on concretions. If core imports a concrete database driver, something is wrong.

## KISS

The simplest thing that makes the tests green is the default. If a reviewer can propose a simpler implementation that passes the same tests, the current version loses.

- No "just in case" abstractions.
- No frameworks the project doesn't need today.
- No configurability where a hard-coded value works and isn't a user-facing concern.

## YAGNI

Don't build for tomorrow's hypothetical requirement.

- No speculative features.
- No hooks, extension points, or plugin systems until at least two concrete callers exist.
- No generics, no overloads, no configuration flags without a present user.

## Minimizing attack surface

Every new external input, file path, query, or dependency is scrutinized at P3. Walk `${CLAUDE_PLUGIN_ROOT}/docs/security-checklist.md` in full during every P3. A new dependency is a non-trivial decision, not a reflex.

- Prefer parameterised queries / prepared statements. Never interpolate user input into query text.
- Validate every external input at the boundary; never inside core.
- Least-privilege file permissions on data the project owns.
- New runtime dependencies require a one-line rationale in the PR; dev dependencies have a lower bar than runtime.

## Testing tiers

Every project has at least four tiers, even if the runners differ:

| Tier | Purpose |
| --- | --- |
| Acceptance | One scenario per user-visible behaviour. Outside-in BDD: drives the design from the user's vantage. |
| Unit | AAA pattern. Mock all abstractions for core. Tests behaviour, not implementation. |
| Property | Invariants the domain must always satisfy (allocation conservation, associativity, ordering, etc.). |
| Integration | Exercise adapters against the real outside thing (real DB, real filesystem). |

The consuming project's CLAUDE.md loop-overlay names the specific runners (e.g., `vitest` + `quickpickle` + `fast-check` for a Node project; `pytest` + `behave` + `hypothesis` for Python; `cargo test` + `proptest` for Rust).

## Coverage

- **100% branch coverage on the project's domain core.** Non-negotiable. (The "core" is whatever the project's `docs/architecture.md` declares as its pure-business layer.)
- Adapters and interface layers lower, but every branch (happy path, error path) is still exercised with intent. No "covered by accident" lines.
- Coverage reports are advisory; the review looks at *which branches aren't covered*, not just the percentage.

## TDD rhythm

Outside-in, strict sequence:

1. Write the failing acceptance scenario first — `test:` commit.
2. Drop to failing unit tests for the first slice — `test:` commit.
3. Implement the minimum to go green at the unit level — `feat:` commit.
4. Work your way up until the acceptance scenario also goes green — more `feat:` commits as needed.
5. Refactor while all tests stay green — `refactor:` commit.

No "tests and implementation together" commits. No "write the tests after the code".

## Style

The consuming project's CLAUDE.md or its own engineering-standards override names the language-specific style rules (file naming, type naming, variable naming, comment policy, function-length budget). The plugin's universal rules:

- **No anti-patterns the project's standards forbid.** Examples by language: TypeScript `any`, Python bare `except`, Go ignored errors, Rust `unwrap()` in non-test code, JavaScript `==`, financial code's `+ - * /` on monetary values.
- **No comments** except when the *why* is non-obvious. Well-named identifiers are the documentation.
- **Functions under ~50 LOC**, pure where possible.
- **External-input validation at boundaries only**, never inside core.

## Refactor-during-green allowance

Obvious local cleanups — rename a variable, extract a tiny helper, collapse a duplicated literal — are allowed while tests are green, so long as behaviour is preserved and all tests still pass.

Anything structural is deferred to the post-review refactor phase:

- Introducing a new abstraction (interface, base class, factory).
- Cross-module moves.
- Touching more than ~20 LOC of existing (not newly-written) code.

When the implementation agent uses the allowance, it calls it out in the return report's "Deviations" section.

## Maintainability indicators used in P3

Reviewers actively look for these:

- **Duplication** that represents the same intent (DRY), not just coincidental resemblance.
- **Coupling spikes** — a new cross-layer import; a Core file suddenly importing from Infra.
- **Naming drift** — the name no longer describes what the code does after the change.
- **Dead code** — unused exports, commented-out blocks, orphan TODOs.
- **Over-abstraction** — a single implementation behind an interface that "might grow" (usually it won't; collapse it).
- **Premature concurrency or caching** (YAGNI).
