# CLAUDE.md

Instructions for Claude Code working on this repo. Read before changing code.

This file is an AI-facing cheat sheet. The authoritative canon lives under `docs/`:

- [docs/architecture.md](docs/architecture.md) — architectural decisions + target structure
- [docs/quality-assurance.md](docs/quality-assurance.md) — product-QA invariants (P2 review reference)
- [docs/engineering-standards.md](docs/engineering-standards.md) — how we build (P3 review reference)
- [docs/security-checklist.md](docs/security-checklist.md) — walkable attack-surface checklist (part of P3)
- [docs/prd.md](docs/prd.md) · [docs/epics.md](docs/epics.md) · [docs/product-brief.md](docs/product-brief.md)
- [docs/retrospectives/](docs/retrospectives/) — one Keep/Change/Try file per completed story

On conflict between this file and a `docs/` file, `docs/` wins. The retrospective phase reconciles drift.

## 1. Project

**Couples Expense Sharing App** — a local-first, CLI-based "predictive asset-based financial engine" for couples managing joint finances. Replaces reactive joint-account top-ups with a deterministic engine that predicts fair transfers, buffers volatility, and keeps an immutable ledger.

**Current position:** Epic 2 (Transaction Ingestion & Tagging) is **complete** — Stories 1.1–1.4 + 2.1–2.5 shipped. **Next: Epic 3 planning** (Predictive Transfer Engine — see [docs/epics.md](docs/epics.md)). *This line is refreshed by the retrospective phase of each story.*

**Stack:** Node.js 20, TypeScript (strict), SQLite via `better-sqlite3` (WAL), `dinero.js`, `commander`, `zod`, `vitest` + `fast-check`.

## 2. Architecture

Full decisions in [docs/architecture.md](docs/architecture.md). Quick reference:

- Three layers, strict dependency rule. `src/core/` depends on nothing (no Node APIs, no `better-sqlite3`, no `commander`, no `process.exit`); `src/infra/` talks to the outside world via ports in `src/core/ports/`; `src/cli/` wires them together.
- **Constructor DI only.** No `new SomeRepo()` inside Core.
- **`Result<T, E>` in Core** — domain methods return `Result` values, never throw. CLI is the only place that inspects `result.isFailure`.
- **Append-only ledger.** No `UPDATE`/`DELETE` on ledger rows — corrections are new balancing entries.
- Port interfaces are PascalCase without an `I` prefix (`TransactionRepository`). Repositories map snake_case DB columns to camelCase domain fields at the boundary.

## 3. Money & precision (most-forgotten rules)

Full checklist in [docs/security-checklist.md](docs/security-checklist.md); product invariants in [docs/quality-assurance.md](docs/quality-assurance.md).

- **Never** use `+ - * /` on monetary values. Go through `Money` / Dinero methods. Banker's rounding everywhere.
- **Two-column storage:** integer cents (`INTEGER NOT NULL`) + ISO 4217 code (`TEXT NOT NULL`). Never a decimal.
- **Currency mismatch is a failure, not a warning** — `Money` ops across currencies return `Result.fail`.
- **Allocations** use Largest Remainder so `sum(parts) == total` to the cent. Property-test with `fast-check`.
- **Dates:** system events UTC; **transactions ISO 8601 with offset** (`2026-04-21T14:30:00+02:00`) to preserve "receipt truth".
- **Versioned rules** (splits, buffer targets) use the Validity Window pattern (`valid_from`, `valid_to`).
- **PII** (IBANs, names, bank identifiers): redact in logs by default; never in test fixtures.

## 4. Style (cheat sheet → [engineering-standards.md](docs/engineering-standards.md))

- kebab-case files · PascalCase types (no `I` prefix) · camelCase vars · snake_case DB columns.
- **No `any`.** `strict: true`. Explicit return types on exports.
- **No comments** except non-obvious *why*. Names are the documentation.
- Functions under ~50 LOC, pure where possible. `@core/*` alias for cross-layer imports.
- Zod at every external boundary; never inside Core.

## 5. Testing (cheat sheet → [engineering-standards.md](docs/engineering-standards.md))

| Tier | Location | Purpose |
| --- | --- | --- |
| Acceptance | `tests/features/*.feature` + `steps/*.ts` | Outside-in BDD via `quickpickle` (installed when first `.feature` lands) |
| Unit | `tests/unit/<mirror-of-src>/**/*.test.ts` | AAA, mock all Ports for Core |
| Property | colocated with unit | `fast-check` for financial invariants |
| Integration | `tests/integration/` (created when first needed) | Real SQLite/FS |

- **100% branch coverage** on `src/core/`. Infra/CLI lower.
- **TDD rhythm (outside-in):** failing acceptance scenario → failing unit test(s) → minimal green → unit pass → acceptance pass → refactor. See § 6.4 for commits.
- **Batch ingestion — two stages.** *Parse:* malformed rows are skipped and reported individually; valid siblings proceed. *Commit:* the set of valid rows is written inside a single SQL transaction — all-or-nothing, rolled back on any DB-level failure. Authoritative policy in [docs/prd.md](docs/prd.md) and [docs/quality-assurance.md](docs/quality-assurance.md).

## 6. Development workflow

The loop has two formal gates:
- **Definition of Ready (DoR)** — met when phases 1 and 2 below are complete.
- **Definition of Done (DoD)** — met when phases 3, 4, 5, and the merge checklist are all complete (see § 7).

### 6.1 Phases

Phases 1 and 2 compose DoR. Phases 3 and 4 drive to DoD. Phase 5 must complete before merge.

1. **Plan** (Opus): collect intent → diverge on solutions → converge on one → capture Gherkin behaviour → open draft PR → hand-off plan for Sonnet. Plan file lives at `docs/plans/story-<id>.md` (committed alongside the code it plans — Story 2.2 retro finding, action A). *Exit:* draft PR exists with template sections 1–6 filled.
2. **Critical review on the plan** (Opus, 3 passes before implementation):
   - **P1 — Functional.** Plan satisfies target FR/NFRs in [docs/prd.md](docs/prd.md) and story in [docs/epics.md](docs/epics.md); Gherkin complete and unambiguous.
   - **P2 — Product Quality / QA.** Walk [docs/quality-assurance.md](docs/quality-assurance.md): accounting correctness, privacy compliance, coherence.
   - **P3 — Engineering.** Walk [docs/engineering-standards.md](docs/engineering-standards.md), [docs/architecture.md](docs/architecture.md), [docs/security-checklist.md](docs/security-checklist.md).

   Each suggestion tagged **adopted / deferred / rejected** in the Suggestion Log (template § 7). **Deferred items must link a GitHub issue** from the `deferred-suggestion` template. Rejected items carry a one-line reason. *Exit (DoR gate):* no un-tagged suggestions; plan rewritten; every `deferred` has an issue link.
3. **Implement** (Sonnet via `Task` with the `sonnet-implementer` agent): writes failing acceptance scenario first, drives down to failing unit tests, makes green, commits per state. Returns the structured report (see 6.3). *Exit:* all tests green, report delivered, branch pushed. PR not yet marked ready.
4. **Code review on the implementation + refactor plan** (Opus) — re-run P1/P2/P3 **against the actual code**:
   - P1 retro-check: acceptance scenarios + unit tests actually deliver the intent. Audit that each `this test fails if …` note identifies the production path it guards, not just any path (Story 1.3 retro action E validated on Story 2.2; codified here per Story 2.2 retro action B). **Gherkin-to-test mapping audit (Story 2.5 retro action C):** walk every Gherkin scenario in the plan against the integration/unit test suite and confirm each scenario has at least one corresponding test whose `fails if …` clause regresses when the scenario's production path breaks. Missing scenarios are P1 blockers — file them as in-PR fixes, not follow-up issues. Example: Story 2.5's "round-trip idempotency" scenario shipped without a test; P1 caught it only via this audit.
   - P2 retro-check: walk QA doc against the diff. **Mock diversity check (Story 2.4 retro action A):** when the diff includes structured output (JSON payloads, tables, machine-readable formats), spot-check that at least one test assertion runs against a non-default mock fixture — e.g. a `--json` test must cover `duplicates: [item]`, not only `duplicates: []`, to catch hardcoded-default regressions that pass a zero-mock test suite.
   - P3 retro-check: walk engineering-standards + security-checklist against the diff.

   Produce a refactor plan; blockers are fixed before merge, not deferred. Delegate execution to Sonnet, with one exception: **trivial inline fixes** (retro finding, story-maint-01) — Opus may execute the refactor directly when **all** of: diff is under 5 LOC, a single file, the fix coordinates are pre-specified in the retro-check finding, and no design question remains (no helper naming, no cross-module placement, no type-surface judgment). Anything larger delegates to Sonnet. *Exit:* refactor merged back into the branch, CI green.
5. **Retrospective.** Keep/Change/Try at `docs/retrospectives/story-<id>.md`. Action items either land in the same PR or become follow-up issues. *Exit:* file committed. Merge is user-gated.

### 6.2 Model tier

- **Opus:** planning, 3-phase critical review, code review, refactor planning, retrospective synthesis.
- **Sonnet:** failing tests, implementation, refactor execution.
- **Haiku:** not used yet.

### 6.3 Sonnet return format

Emit exactly these sections, in order:
```
## What was built
## Red → green sequence (per test)
## Deviations from plan (with rationale)
## Unknowns encountered
## Proposed follow-ups
## Files touched
```
Full agent spec: [.claude/agents/sonnet-implementer.md](.claude/agents/sonnet-implementer.md).

**Invocation note (updated, story-maint-01 retro finding):** the Claude Code harness now registers `.claude/agents/*.md` custom agents with the Task / Agent tool. Invoke directly with `subagent_type: "sonnet-implementer"` — no `model` override or inline brief needed; the agent spec file's frontmatter supplies both. Prior Story 1.3 retro guidance ("use `subagent_type: 'general-purpose'` + inline brief") is superseded. If a future harness regression removes custom-agent support, fall back to the general-purpose + inline-brief pattern.

### 6.4 Commit convention inside a story

State transitions. Story id in every subject, e.g. `(Story 1.3)`.

- `test(<scope>): <scenario> — failing` (red)
- `feat(<scope>): <scenario> — minimal green` (green)
- `refactor(<scope>): <what>` (behaviour-preserving cleanup)

**Green-on-landing `test:` commits are acceptable** when the earlier `feat:` commit already covered the tested branches and the subsequent `test:` is adding coverage for a sibling condition. Call it out in the return report's "Deviations" — the TDD-by-intent invariant (the test *would* have failed against a stripped-down implementation) still holds.

**Empty `refactor:` commit with a justification message** (e.g. `refactor(db): tidy prepared statements (Story 1.3)` with body *"No-op: all functions under 50 LOC, naming is clear, no duplication identified"*) is an acceptable pattern when the refactor slot has nothing to clean up. Keeps the commit sequence aligned with the plan and documents the review.

**Commit subjects: summary over enumeration (retro finding, Story 1.4).** Prefer a summary verb in the subject rather than listing every scenario the commit covers. `test(config): schema validation suite — failing (Story 1.4)` ages better than `test(config): rejects missing splits, non-ISO currency, ratio sum — failing (Story 1.4)` — the latter goes stale the moment an 11th assertion lands. Scenario details belong in the commit body, not the subject.

**Plan in slices, not tests-per-commit (retro finding, Story 1.4).** When drafting the TDD commit sequence in the plan-for-Sonnet section, one slice = one behaviour + its tests + the minimal code to make them green (often one Gherkin scenario). Over-decomposing into per-assertion commits invites green-on-landing collapses that divorce the plan from execution. Target 6–10 commits per story; only split further when a slice's failing test genuinely cannot turn green without an intermediate `feat:` step.

Squash on merge is optional.

### 6.5 Refactor-during-green policy

Obvious local cleanups (rename, extract small helper, collapse a duplicated literal) are allowed while tests are green if behaviour is preserved. Structural changes — new abstractions, cross-module moves, touching >~20 LOC of existing code — defer to the refactor phase. Sonnet calls this out in the return report.

### 6.6 Story sizing

One PR per story. More than ~3 Gherkin scenarios, or work likely to exceed one Sonnet Task round → split.

**Adapter stories need coarser slices, not finer (retro finding, Story 2.1).** For a bank-CSV adapter, file-format reader, export target, or any boundary adapter, the minimum-viable implementation *intrinsically* includes a bundle of behaviours — encoding tolerance, per-row isolation, header validation, delimiter handling, basic invariants. Planning a separate `test:` + `feat:` pair for each of those invites green-on-landing collapses, because the first `feat:` that satisfies the happy path already covers the others. Pattern: **one slice for the adapter's "obvious basics"** (happy path + the invariants any correct implementation satisfies) + **one slice per deliberately-counterintuitive rule** (e.g., a sign-inversion, a locale quirk, a bank-specific edge case). Target 5–7 commits for adapter stories; finer slicing is for stories with genuinely independent behaviours.

### 6.7 Maintenance sub-loop

Runs **before the planning phase of every new story**. Unconditional.

- **Triage open issues:** re-prioritize, close stale, confirm `deferred-suggestion` items still relevant.
- **Review open Dependabot PRs:** CI + diff + changelog. Routine bumps (patch or minor, any dep) → merge directly after CI + changelog check, no DoR/DoD/retro. **Major bumps** of runtime deps, **critical-path major bumps** (`better-sqlite3`, `dinero.js`, `zod`, `commander`, `vitest`), or any **breaking change** flagged in a changelog → issue + full story through the main loop. Minor/patch bumps of critical-path deps still merge routinely, but with a slightly closer changelog read (check for deprecations, removed exports, runtime-behaviour notes) — if anything looks non-trivial, escalate.
- **`npm audit`:** `high`/`critical` → immediate issue, fix before the next story.

Lighter than feature work. Aggregate learnings surface at the next per-story retrospective.

## 7. Definition of Done

A story is merge-ready only when **all** of:

1. `npm run lint && npm run build && npm test` — green on CI.
2. Migrations idempotent.
3. Every new invariant in Core has a property test.
4. No `any`, no TODO comments left behind, no dead code.
5. Commits follow the `test:` / `feat:` / `refactor:` rhythm of § 6.4. Each subject references the story id.
6. All 10 sections of the PR template are filled — no `TBD` at merge.
7. Suggestion log has no un-tagged items. Every `deferred` row links a GitHub issue.
8. P1 / P2 / P3 retro-checks (§ 6.1 phase 4) all pass.
9. Retrospective file committed at `docs/retrospectives/story-<id>.md`.
10. Any new rule or constraint from the retrospective lands in the same PR as a CLAUDE.md / `docs/` / template edit.
11. User has ticked the merge checklist.
