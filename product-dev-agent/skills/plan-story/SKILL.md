---
description: Phase 1 of the product-dev-agent loop. Drive the planning of a single story from intent to a fully-specified plan ready for critical review. Use when the user says "let's plan story X", "/plan-story X", or kicks off a new feature.
---

# /product-dev-agent:plan-story

You are running **Phase 1** of the product-dev-agent loop. Read `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Phase 1 — Plan" before starting.

`$ARGUMENTS` should contain the story id (e.g. `2.4`, `M.1`). If empty, ask the user for it.

## Your job

Take the user from raw intent to a **fully-specified plan** that the next phase (`/product-dev-agent:review-plan`) can critique. Phase 1 ends when:

1. Intent is captured in 2–4 sentences.
2. **At least 3 alternatives** were considered, with one-line reasons each was set aside.
3. The selected approach is justified against the alternatives.
4. **Gherkin scenarios** (or the project's equivalent acceptance format) are written and unambiguous.
5. A **draft PR** exists on the consuming project's GitHub repo with sections 1–6 of `${CLAUDE_PLUGIN_ROOT}/templates/pull_request_template.md` filled in.
6. The plan file lives at `docs/plans/story-<id>.md` in the consuming repo, mirroring the PR sections 1–6 plus a "Plan for Sonnet" detailed enough that the implementation phase needs no clarifying questions.

## Workflow

1. **Run the maintenance sub-loop first.** Before planning a new story, invoke `/product-dev-agent:maintenance` (triage open issues, review Dependabot PRs, `npm audit`). This is unconditional per workflow.md § 6.7.
2. **Collect intent.** Ask the user 2–4 questions about the goal, the user pain, and any constraints.
3. **Diverge.** Generate at least 3 distinct technical approaches. For each: 1-line description + 1-line tradeoff.
4. **Converge.** Recommend one. State why it beats the others.
5. **Write Gherkin.** One scenario per user-visible behaviour. Story sizing: more than ~3 scenarios → split (per workflow.md § 6.6).
6. **Open draft PR.** Use the GitHub MCP tools. Title: `<scope>: <verb> <object> (Story <id>)`. Body uses `${CLAUDE_PLUGIN_ROOT}/templates/pull_request_template.md`; fill sections 1–6 only. Section 7 (Suggestion log) is filled by `/review-plan`. Mark as **draft**.
7. **Write the plan file.** `docs/plans/story-<id>.md` in the consuming repo. Include: same content as PR sections 1–6 + a "Plan for Sonnet" subsection covering files to touch, tests to write first, slice-by-slice commit sequence, and Definition of Done for this story. Commit it: `chore(docs): plan for Story <id>`.

## Exit gate

Phase 1 is done when the draft PR is open, sections 1–6 are filled (no `TBD`), the plan file is committed, and the user agrees the scope is right. Hand off to `/product-dev-agent:review-plan` next.

## Guardrails

- **Do not write production code in this phase.** Plans only.
- **Do not skip alternatives.** "I went straight to the obvious answer" is the most common planning failure — three alternatives forces real comparison.
- **Sizing.** Adapter stories (file-format readers, bank CSVs, export targets) need coarser slices, not finer — see workflow.md § 6.6.
- **Story id discipline.** Every commit subject in this story must end with `(Story <id>)`.
