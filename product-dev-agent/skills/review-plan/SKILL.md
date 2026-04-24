---
description: Phase 2 of the product-dev-agent loop. Run the 3-pass critical review (P1 functional, P2 product QA, P3 engineering) on a draft plan before implementation. Use after /plan-story, or when the user says "review the plan", "P1/P2/P3", or "/review-plan".
---

# /product-dev-agent:review-plan

You are running **Phase 2** of the product-dev-agent loop. Read `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Phase 2 — Critical review on the plan" before starting.

`$ARGUMENTS` may contain a PR number to review. If empty, default to the current branch's draft PR.

## Your job

Walk the plan through **three independent passes**. Each pass produces suggestions tagged `adopted` / `deferred` / `rejected`. Phase 2 ends only when every suggestion has a non-empty resolution and every `deferred` row links a GitHub issue.

## The three passes

Run them in order. Do **not** combine them into one prose review — keep the suggestions distinct so the suggestion log stays auditable.

### P1 — Functional

Source of truth: the consuming project's PRD, epic/story doc, and the story's stated FR/NFR coverage.

Check:
- Plan satisfies the target FR/NFRs.
- Acceptance scenarios (Gherkin or equivalent) cover the user-visible behaviours.
- No scope drift — the plan doesn't sneak in unrelated work.
- Edge cases the PRD calls out are addressed (or explicitly deferred with reason).

### P2 — Product Quality / QA

Source of truth: `${CLAUDE_PLUGIN_ROOT}/docs/quality-assurance-skeleton.md` + the consuming project's `docs/quality-assurance.md` (domain invariants).

Walk every invariant in the QA doc against the plan. For accounting/financial domains: correctness, currency rules, allocation conservation, determinism, validity windows, no silent data loss. For other domains: domain-equivalent invariants. Privacy & data sovereignty. Coherence with the product brief. Observability of failures.

### P3 — Engineering

Source of truth: `${CLAUDE_PLUGIN_ROOT}/docs/engineering-standards.md` + `${CLAUDE_PLUGIN_ROOT}/docs/security-checklist.md` + the consuming project's `docs/architecture.md` and any project-specific security additions.

Walk:
- Architecture principles (layer boundaries respected; no Core importing from Infra).
- SOLID applied pragmatically (not ceremonially).
- KISS / YAGNI (no speculative abstractions, no "just in case" config).
- Testing tiers covered (acceptance + unit + property where invariants exist + integration where Infra is touched).
- Coverage expectations met (typically 100% branch on Core).
- TDD rhythm planned correctly (red → green → refactor commit sequence).
- Security checklist walked **in full**.
- Style cheat-sheet respected.

## Suggestion log mechanics

For each suggestion, append a row to PR section 7 (Suggestion log). Format:

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |

Resolution rules:
- `adopted` → rewrite the plan to incorporate the suggestion. Mark the row.
- `deferred` → file a GitHub issue using `${CLAUDE_PLUGIN_ROOT}/templates/deferred-suggestion-issue.md`. Link the issue in the row. Use the GitHub MCP tools.
- `rejected` → one-line reason in the row.

## Exit gate (Definition of Ready)

Phase 2 is done — and the story is **Ready** — when:

- Every suggestion-log row has a non-empty Resolution.
- Every `deferred` row links an open GitHub issue.
- The plan body has been rewritten to incorporate every `adopted` suggestion.
- No untagged items remain.

Hand off to `/product-dev-agent:implement` next.

## Guardrails

- **Do not implement during review.** This phase is words only.
- **Do not soften the rules.** A genuine engineering-standards violation is not a "deferred suggestion"; it's a plan revision. Defer is for legitimate scope-creep candidates only.
- **Walk the security checklist in full**, not just the items that look relevant. The checkbox discipline catches what cherry-picking misses.
