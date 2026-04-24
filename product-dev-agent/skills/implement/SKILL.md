---
description: Phase 3 of the product-dev-agent loop. Hand off the reviewed plan to the sonnet-implementer agent for outside-in BDD + unit TDD execution. Use after /review-plan passes its exit gate, or when the user says "implement", "hand off to sonnet", or "/implement".
---

# /product-dev-agent:implement

You are running **Phase 3** of the product-dev-agent loop. Read `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Phase 3 — Implement" before starting.

## Pre-flight check

Before invoking the agent, verify the **Definition of Ready** is met (from Phase 2):

1. Draft PR exists with sections 1–6 filled (no `TBD`).
2. Suggestion log (PR section 7) has no untagged rows.
3. Every `deferred` row links a GitHub issue.
4. Plan file at `docs/plans/story-<id>.md` is committed.

If any check fails, stop and tell the user which gate is open. Do not proceed.

## Your job

Invoke the `sonnet-implementer` agent (shipped at `${CLAUDE_PLUGIN_ROOT}/agents/sonnet-implementer.md`) via the `Agent` tool, with the PR as its full spec.

### Invocation

Preferred: `subagent_type: "sonnet-implementer"`.

Harness fallback: if the harness doesn't register custom plugin agents as `subagent_type` values (a known limitation observed in some Claude Code versions), fall back to:
- `subagent_type: "general-purpose"`
- `model: "sonnet"` override
- Inline the full content of `${CLAUDE_PLUGIN_ROOT}/agents/sonnet-implementer.md` § 1–6 into the agent prompt as the operating brief.

### Prompt template

```
You are the sonnet-implementer for product-dev-agent. Story id: <id>. PR: <url>.

Operating brief (read in full):
- ${CLAUDE_PLUGIN_ROOT}/agents/sonnet-implementer.md
- ${CLAUDE_PLUGIN_ROOT}/docs/workflow.md
- ${CLAUDE_PLUGIN_ROOT}/docs/engineering-standards.md
- ${CLAUDE_PLUGIN_ROOT}/docs/security-checklist.md
- The consuming project's CLAUDE.md (loop overlay + project-specific rules).

Your spec is PR sections 1–6 plus the plan file at docs/plans/story-<id>.md.

Stop conditions: see ${CLAUDE_PLUGIN_ROOT}/agents/sonnet-implementer.md § 5.

Return format: see ${CLAUDE_PLUGIN_ROOT}/agents/sonnet-implementer.md § 4. Emit it
verbatim, no preamble, no trailing commentary.
```

## After the agent returns

1. Capture the agent's structured return report verbatim.
2. Append it as PR section 8 (Sonnet's learnings).
3. Verify the agent's stop conditions held: green-suite passed, branch pushed, PR still draft.
4. Hand off to `/product-dev-agent:review-impl` next.

## Guardrails

- **Do not edit production code yourself.** Phase 3 is delegation. If you find yourself reaching for `Edit`, you've drifted into Phase 4.
- **Do not mark the PR ready.** That's a merge-checklist item, gated by Phase 4.
- **Do not summarise or rewrite the agent's return report.** Paste it verbatim into PR section 8 — the structure is the contract.
- **Block on missing DoR.** A missing suggestion-log row, an unfilled PR section, or an unlinked deferred issue means Phase 2 isn't done. Send the user back to `/review-plan`, don't paper over it.
