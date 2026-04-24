<!--
product-dev-agent PR template. Every section is required.
No section may be blank or left as `TBD` at merge.

- Sections 1–6 are filled during /product-dev-agent:plan-story.
- Section 7 (Suggestion log) is filled during /product-dev-agent:review-plan.
- Section 8 (Implementer's learnings) is pasted from the implementation agent's return.
- Section 9 (Retrospective) is written during /product-dev-agent:retro.
- Section 10 (Merge checklist) is the final gate — the user ticks it.

Full workflow: see ${CLAUDE_PLUGIN_ROOT}/docs/workflow.md
-->

## 1. Story

<!-- Link to the story entry in your project's epic doc. -->

## 2. Intent

<!-- 2–4 sentences. What problem, what outcome? -->

## 3. Alternatives considered

<!-- One line each. Why each was set aside. -->

-

## 4. Selected solution & rationale

<!-- What we're building. Why it beats the alternatives listed above. -->

## 5. Acceptance scenarios

<!-- Gherkin or your project's equivalent acceptance format. -->

```gherkin
Feature:

  Scenario:
    Given
    When
    Then
```

## 6. Plan for the implementer

<!--
Files to touch · tests to write first · slice-by-slice commit sequence ·
Definition of Done for this story. Self-contained: the implementation agent
should not have to ask clarifying questions to proceed.
-->

## 7. Suggestion log

<!--
Filled during the 3-pass critical review (P1 functional, P2 product QA, P3 engineering).
Resolution is one of `adopted` / `deferred` / `rejected`.
- `deferred` rows MUST link an open GitHub issue in Link/Reason.
- `rejected` rows MUST carry a one-line reason in Link/Reason.
- `adopted` rows mean the plan was rewritten to incorporate the suggestion.
DoR is not met until every row has a non-empty Resolution.
-->

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
|       |            |            |               |

## 8. Implementer's learnings

<!--
Pasted verbatim from the implementation agent's return report. Fixed structure:

## What was built
## Red → green sequence (per test)
## Deviations from plan (with rationale)
## Unknowns encountered
## Proposed follow-ups
## Files touched
-->

## 9. Retrospective

<!--
3-line summary (Keep / Change / Try). Full retro file committed at
docs/retrospectives/story-<id>.md — link here.
-->

- **Keep:**
- **Change:**
- **Try:**

Full retrospective: <!-- link to docs/retrospectives/story-<id>.md -->

## 10. Merge checklist

- [ ] Green-suite green on CI
- [ ] PR out of draft
- [ ] Retrospective file committed at `docs/retrospectives/story-<id>.md`
- [ ] All suggestion-log items resolved (no blank `Resolution` cells)
- [ ] All Phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)
- [ ] User approval
