---
description: Phase 4 of the product-dev-agent loop. Re-run P1/P2/P3 against the actual code diff, produce a refactor plan, and gate the merge checklist. Use after /implement returns, or when the user says "review the implementation", "post-impl review", or "/review-impl".
---

# /product-dev-agent:review-impl

You are running **Phase 4** of the product-dev-agent loop. Read `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Phase 4 — Code review on the implementation" before starting.

## Your job

Re-run **P1, P2, P3 against the actual diff** — not the plan. The plan is a hypothesis; the diff is reality. Findings split into:

- **Blockers.** Fix before merge. Delegate execution back to the sonnet-implementer.
- **Refactor candidates.** Same PR if cheap, otherwise file a deferred-suggestion issue.
- **Follow-ups.** Out-of-scope improvements; file as issues.

## P1 retro-check — Functional

- The acceptance scenarios + unit tests actually deliver the intent (not just any path).
- For each `this test fails if …` claim in PR sections, audit that the production path it guards is the real code, not a bystander.
- New behaviour matches the PRD/story, not the plan's interpretation of it.

## P2 retro-check — Product QA

Walk `${CLAUDE_PLUGIN_ROOT}/docs/quality-assurance-skeleton.md` + the consuming project's `docs/quality-assurance.md` against the diff.

**Mock diversity check.** When the diff includes structured output (JSON payloads, tables, machine-readable formats), spot-check that at least one test assertion runs against a non-default mock fixture. Example: a `--json` test must cover `duplicates: [item]`, not only `duplicates: []` — otherwise a hardcoded-default value silently passes a zero-mock test suite. This catches the "test passes but output is wrong" bug class.

**`this test fails if …` audit.** For every test the PR claims guards a specific production path, trace the path. If the test would still pass against a stripped-down implementation, the test is decorative, not protective.

## P3 retro-check — Engineering

Walk `${CLAUDE_PLUGIN_ROOT}/docs/engineering-standards.md` + `${CLAUDE_PLUGIN_ROOT}/docs/security-checklist.md` + the consuming project's `docs/architecture.md` against the diff.

Look for:
- Layer-boundary violations (Core importing Infra).
- New `any` / unchecked nulls / float-on-money / bare-`except` (per project's language rules).
- Coupling spikes — a Core file suddenly importing from elsewhere.
- Naming drift — the function name no longer describes what it does.
- Dead code, orphan TODOs, commented-out blocks.
- Over-abstraction — a single implementation behind an interface that "might grow".
- Premature concurrency or caching (YAGNI).
- Security-checklist boxes that the implementation invalidates (the plan-time review walked the plan; this walk validates the code).

## Deviations report cross-check

Read the agent's "Deviations from plan" section (PR section 8). For each:
- Was the deviation justified? (If not → blocker.)
- Was the alternative plausible? (If yes and the chosen path is worse → refactor candidate.)
- Does the deviation hide a tool/library substitution that should have been flagged earlier? (If yes → write it up as a refactor candidate and add a note to the suggestion log so future reviews catch the pattern.)

## Refactor plan

Produce one. Format:

```
## Blockers (must fix before merge)
- <finding> · <file:line> · <required change>

## Refactor candidates (this PR)
- <finding> · <required change>

## Follow-ups (file as issues)
- <finding> · <link to filed issue>
```

Delegate blocker + this-PR refactor execution back to the sonnet-implementer (re-invoke `/product-dev-agent:implement` with the refactor plan as the spec). Do not edit production code yourself.

## Exit gate (toward Definition of Done)

Phase 4 is done when:

- All blockers are fixed and green-suite is green again.
- All refactor-candidates resolved (done in PR or moved to follow-up).
- Suggestion log updated with any new findings.
- CI green.

Hand off to `/product-dev-agent:retro` next.

## Guardrails

- **Do not soften the standards because tests pass.** The whole point of Phase 4 is catching what tests miss (Phase 4 has historically caught real correctness bugs that 100%-passing test suites missed).
- **Do not edit production code.** Delegate.
- **Walk in full.** Cherry-picked reviews are not reviews.
