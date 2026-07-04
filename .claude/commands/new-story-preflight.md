WHEN_TO_USE: Load this automatically when the user says "let's do story X", "start planning",
"open a new story", or similar. Do NOT wait to be asked.

## New-story preflight checklist

1. Run maintenance sub-loop (docs/templates/maintenance-sub-loop.md) — confirm no sibling
   overlap, clean tree, no high vulns. Record result in plan Context section.
2. Get onto the story branch (never work on `main`; one agent per branch — R18).
   If the harness already placed you on a session-assigned branch/worktree
   (e.g. `claude/<...>` — the common case), use it in place and record it in the
   plan's Context (see story-ddd-1 for the session-branch precedent). Otherwise cut
   a dedicated worktree from `origin/main`:
     git worktree add ../accounting-<story-id> -b story-<story-id>
3. Initialize plan template: copy docs/templates/plan-template.md to
   docs/plans/story-<id>.md, then fill Context and Story sections before calling ExitPlanMode.
