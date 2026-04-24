---
description: Phase 5 of the product-dev-agent loop. Write the Keep/Change/Try retrospective for the just-finished story and fold any new rules into CLAUDE.md or docs/. Use after /review-impl is clean, or when the user says "write the retro", "retrospective", or "/retro".
---

# /product-dev-agent:retro

You are running **Phase 5** of the product-dev-agent loop. Read `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Phase 5 — Retrospective" + `${CLAUDE_PLUGIN_ROOT}/docs/retrospective-format.md` before starting.

`$ARGUMENTS` should contain the story id. If empty, infer it from the branch or ask.

## Your job

Produce a **Keep / Change / Try** retrospective that:

1. Documents what worked, what didn't, and what to try next.
2. Surfaces concrete action items.
3. Folds any **new rule** into the loop's documentation in the same PR (no rule lives only in a retro file).

## Workflow

1. **Read the PR end-to-end.** Sections 1–8, the diff, the suggestion log, the agent's deviations and follow-ups.
2. **Read the previous retrospective** (if any) at `docs/retrospectives/`. Note any "Try" items from last story — did they prove out? They graduate to "Keep" + a CLAUDE.md/`docs/` rule, or sunset.
3. **Write the retro file** at `docs/retrospectives/story-<id>.md` using `${CLAUDE_PLUGIN_ROOT}/templates/retrospective-template.md`. Field guidance is in `${CLAUDE_PLUGIN_ROOT}/docs/retrospective-format.md`.
4. **For each new rule** (a "Try" graduating to "Keep", or a finding from this story that codifies into a rule): edit the relevant file in the same PR. Most common targets:
   - The consuming project's `CLAUDE.md` (loop overlay or project-specific section).
   - The consuming project's `docs/engineering-standards.md` overrides.
   - A new follow-up issue against the plugin if the rule is generic and should ship in `${CLAUDE_PLUGIN_ROOT}/docs/`.
5. **Update the retrospectives index.** `docs/retrospectives/README.md` Index list — add this story.
6. **Commit.** `chore(retro): Story <id>` (and the rule edits in the same commit, per "no rule lives only in a retro" principle).
7. **Update PR section 9.** Paste the 3-line Keep/Change/Try summary; link the full file.

## Exit gate (Definition of Done)

Phase 5 is done when:

- `docs/retrospectives/story-<id>.md` is committed.
- Any new rule has landed in CLAUDE.md / `docs/` / a templates file in the same PR.
- Retrospectives index updated.
- PR section 9 filled.
- PR section 10 (Merge checklist) ready for the user to tick.

After this, the user reviews the merge checklist and merges. Phase 5 does not merge.

## Guardrails

- **Be specific.** "The plan under-specified the migration rollback path" beats "better planning". A "Change" without a concrete next-time action is just venting.
- **Try ≠ commit forever.** A "Try" is an experiment for the *next* story only. If it works, it graduates to "Keep" and a rule edit. If it doesn't, it sunsets.
- **No rule in retro only.** The retrospective file is history; the rule must live where future-you will read it (CLAUDE.md, engineering-standards, etc.).
- **Carryover loop.** If last story had a "Try", this retro must report whether it worked.
