# product-dev-agent — Workflow

The authoritative reference for the loop. All skills (`/product-dev-agent:*`) defer to this document on any question of phases, gates, model tiers, or commit conventions. Consuming projects override only what their `CLAUDE.md` loop-overlay explicitly names.

## Loop overview

Two formal gates:

- **Definition of Ready (DoR)** — met when phases 1 and 2 below are complete.
- **Definition of Done (DoD)** — met when phases 3, 4, 5, and the merge checklist are all complete (see § "Definition of Done").

## Phases

Phases 1 and 2 compose DoR. Phases 3 and 4 drive to DoD. Phase 5 must complete before merge.

### Phase 1 — Plan

Driven by `/product-dev-agent:plan-story <id>`. Run by the planning model (typically Opus).

- Collect intent (2–4 questions to the user).
- Diverge on at least 3 solutions.
- Converge on one with explicit rationale.
- Capture acceptance behaviour (Gherkin or project equivalent).
- Open draft PR with sections 1–6 of the PR template filled.
- Commit plan file at `docs/plans/story-<id>.md` mirroring the PR plus a "Plan for Sonnet" subsection.

**Exit:** draft PR exists with template sections 1–6 filled.

### Phase 2 — Critical review on the plan

Driven by `/product-dev-agent:review-plan`. Run by the planning model. Three independent passes before implementation:

- **P1 — Functional.** Plan satisfies target FR/NFRs in the consuming project's PRD; acceptance scenarios complete and unambiguous.
- **P2 — Product Quality / QA.** Walk `${CLAUDE_PLUGIN_ROOT}/docs/quality-assurance-skeleton.md` + the project's domain QA doc.
- **P3 — Engineering.** Walk `${CLAUDE_PLUGIN_ROOT}/docs/engineering-standards.md` + `${CLAUDE_PLUGIN_ROOT}/docs/security-checklist.md` + the project's `docs/architecture.md`.

Each suggestion tagged `adopted` / `deferred` / `rejected` in the Suggestion Log (PR section 7). `deferred` items must link a GitHub issue from the deferred-suggestion template. `rejected` items carry a one-line reason.

**Exit (DoR gate):** no un-tagged suggestions; plan rewritten to incorporate every `adopted`; every `deferred` has an issue link.

### Phase 3 — Implement

Driven by `/product-dev-agent:implement`. Hands off to the `sonnet-implementer` agent (executed by the implementation model, typically Sonnet).

The agent writes a failing acceptance scenario first, drives down to failing unit tests, makes green, commits per state. Returns the structured report (see `${CLAUDE_PLUGIN_ROOT}/agents/sonnet-implementer.md` § 4).

**Exit:** all tests green, report delivered, branch pushed. PR not yet marked ready.

### Phase 4 — Code review on the implementation

Driven by `/product-dev-agent:review-impl`. Run by the planning model. Re-run P1/P2/P3 **against the actual code** (not the plan):

- **P1 retro-check** — acceptance scenarios + unit tests actually deliver the intent. Audit each `this test fails if …` claim against the production path it guards, not just any path.
- **P2 retro-check** — walk QA doc against the diff. **Mock diversity check:** when the diff includes structured output (JSON, tables, machine-readable formats), spot-check at least one assertion against a non-default mock fixture.
- **P3 retro-check** — walk engineering-standards + security-checklist against the diff.

Produce a refactor plan; blockers are fixed before merge, not deferred. Delegate execution back to the implementation agent.

**Exit:** refactor merged back into the branch, CI green.

### Phase 5 — Retrospective

Driven by `/product-dev-agent:retro <id>`. Keep/Change/Try at `docs/retrospectives/story-<id>.md`. Action items either land in the same PR or become follow-up issues. New rules land in CLAUDE.md / `docs/` in the same PR — never in a retro file alone.

**Exit:** file committed; PR section 9 filled; merge checklist (section 10) ready for the user. Merge is user-gated.

## Model tier

- **Planning model (default: Opus)** — planning, 3-phase critical review, code review, refactor planning, retrospective synthesis.
- **Implementation model (default: Sonnet)** — failing tests, implementation, refactor execution.
- **Cheaper tier (default: Haiku)** — not used in v0.

Consuming projects can override via their CLAUDE.md loop-overlay if budget or capability constraints differ.

## Commit convention inside a story

State transitions. Story id in every subject, e.g. `(Story 1.3)`.

- `test(<scope>): <scenario> — failing` (red)
- `feat(<scope>): <scenario> — minimal green` (green)
- `refactor(<scope>): <what>` (behaviour-preserving cleanup)

**Green-on-landing `test:` commits are acceptable** when the earlier `feat:` commit already covered the tested branches and the subsequent `test:` is adding coverage for a sibling condition. Call it out in the return report's "Deviations" — the TDD-by-intent invariant (the test *would* have failed against a stripped-down implementation) still holds.

**Empty `refactor:` commit with a justification message** is an acceptable pattern when the refactor slot has nothing to clean up. Keeps the commit sequence aligned with the plan and documents the review.

**Commit subjects: summary over enumeration.** Prefer a summary verb in the subject rather than listing every scenario the commit covers. Scenario details belong in the commit body, not the subject.

**Plan in slices, not tests-per-commit.** When drafting the TDD commit sequence, one slice = one behaviour + its tests + the minimal code to make them green (often one acceptance scenario). Over-decomposing into per-assertion commits invites green-on-landing collapses that divorce the plan from execution. Target 6–10 commits per story; only split further when a slice's failing test genuinely cannot turn green without an intermediate `feat:` step.

Squash on merge is optional.

## Refactor-during-green policy

Obvious local cleanups (rename, extract small helper, collapse a duplicated literal) are allowed while tests are green if behaviour is preserved. Structural changes — new abstractions, cross-module moves, touching >~20 LOC of existing code — defer to the refactor phase. The implementation agent calls this out in the return report.

## Story sizing

One PR per story. More than ~3 acceptance scenarios, or work likely to exceed one implementation round → split.

**Adapter stories need coarser slices, not finer.** For a bank-CSV adapter, file-format reader, export target, or any boundary adapter, the minimum-viable implementation *intrinsically* includes a bundle of behaviours — encoding tolerance, per-row isolation, header validation, delimiter handling, basic invariants. Planning a separate `test:` + `feat:` pair for each invites green-on-landing collapses, because the first `feat:` that satisfies the happy path already covers the others. Pattern: **one slice for the adapter's "obvious basics"** (happy path + the invariants any correct implementation satisfies) + **one slice per deliberately-counterintuitive rule** (e.g., a sign-inversion, a locale quirk, a boundary edge case). Target 5–7 commits for adapter stories; finer slicing is for stories with genuinely independent behaviours.

## Maintenance sub-loop

Driven by `/product-dev-agent:maintenance`. Runs **before the planning phase of every new story**. Unconditional.

- **Triage open issues:** re-prioritise, close stale, confirm `deferred-suggestion` items still relevant.
- **Review open Dependabot PRs:** CI + diff + changelog. Routine bumps (patch or minor, any dep) → merge directly after CI + changelog check, no DoR/DoD/retro. **Major bumps** of runtime deps, **critical-path major bumps**, or any **breaking change** flagged in a changelog → issue + full story through the main loop. Minor/patch bumps of critical-path deps still merge routinely, but with a slightly closer changelog read; if anything looks non-trivial, escalate.
- **Audit:** language-specific (e.g. `npm audit`). `high`/`critical` → immediate issue, fix before the next story.

Lighter than feature work. Aggregate learnings surface at the next per-story retrospective.

## Definition of Done

A story is merge-ready only when **all** of:

1. Consuming project's green-suite command — green on CI.
2. Migrations idempotent (where applicable).
3. Every new invariant in the project's domain core has a property test (or domain equivalent).
4. No language-specific anti-patterns left behind (the project's CLAUDE.md names them).
5. Commits follow the `test:` / `feat:` / `refactor:` rhythm. Each subject references the story id.
6. All 10 sections of the PR template are filled — no `TBD` at merge.
7. Suggestion log has no un-tagged items. Every `deferred` row links a GitHub issue.
8. P1 / P2 / P3 retro-checks (Phase 4) all pass.
9. Retrospective file committed at `docs/retrospectives/story-<id>.md`.
10. Any new rule or constraint from the retrospective lands in the same PR as a CLAUDE.md / `docs/` / template edit.
11. User has ticked the merge checklist.
