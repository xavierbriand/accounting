WHEN_TO_USE: Load this when starting Phase 0 (Model) for a story that adds or changes a Core
domain concept (CLAUDE.md § 6.1 phase 0, R24) — "let's model story X", "run a modeling
session", or when Epic-level planning needs new domain vocabulary before stories exist.

## Modeling session (Phase 0 co-design)

The dialogue happens HERE, in the main session — `ddd-modeler` is one-shot and cannot
converse. You (main-session Opus) facilitate; the user decides. The glossary and context
map are user-authored: propose deltas, never write those two files without explicit
user sign-off on the wording.

1. **Frame the domain question.** With the user, phrase what this story asks of the model
   in one plain-language sentence (glossary register, not code register). Read
   docs/domain/glossary.md and docs/domain/context-map.md; note which existing terms are
   in play.
2. **Fan out for candidates.** Invoke `ddd-modeler` (Mode A) with the story brief, the
   domain question, and the relevant `src/core/` paths. (Until the agent registers
   post-restart, invoke `general-purpose` with `.claude/agents/ddd-modeler.md` contents
   inline — CLAUDE.md § 6.3.)
3. **Converge in dialogue.** Present the 2–3 candidates to the user with trade-offs —
   one question at a time (AskUserQuestion) for the genuine forks the agent surfaced.
   The user picks, merges, or redirects; iterate with the agent if the shape is still
   contested.
4. **Write the model note** at docs/domain/model-notes/story-<id>.md from
   docs/templates/model-note.md: domain question, terms (glossary deltas), chosen model,
   invariants (each testable), events, rejected alternatives (one line each).
5. **User sign-off.** The user approves the note's Sign-off line AND the exact glossary /
   context-map wording. Only then apply the deltas to docs/domain/ — same branch, same PR
   (R25).
6. **Exit (feeds Phase 1).** Model note committed with the plan; the plan's
   `## Domain model` section derives from the note (R24).

Skip condition: story has no Core domain-concept impact → no session, no note; the plan
declares `No model impact — <reason>` in its Domain-model section.
