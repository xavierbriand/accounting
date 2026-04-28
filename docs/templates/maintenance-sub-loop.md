# Maintenance sub-loop checklist

Run before opening every new story plan ([CLAUDE.md § 6.7](../../CLAUDE.md)). Copy this list into the plan's "Maintenance sub-loop" section and tick as you go.

This is the **runnable** form of the rule. The conceptual statement lives in CLAUDE.md § 6.7; if the *concept* changes, update CLAUDE.md. If the *steps* change (a new tool, a refined trigger, etc.), update this file.

## Checklist

- [ ] **Sibling work check.** `gh pr list --state open --draft --base main` + `gh issue list --state open` — for each open/draft PR or issue, confirm it isn't already addressing the same goal you're about to plan against. If overlap, defer or coordinate.
- [ ] **Working tree clean.** `git status` clean; story branch rebased on `origin/main`.
- [ ] **Open issues.** `gh issue list --state open --limit 50` — re-prioritise, close stale, confirm `deferred-suggestion` items still relevant.
- [ ] **Open PRs.** `gh pr list --state open` — Dependabot/draft state.
  - Routine bumps (patch or minor, any dep) → merge directly after CI + changelog check, no DoR/DoD/retro.
  - Major bumps of runtime deps, critical-path major bumps (`better-sqlite3`, `dinero.js`, `zod`, `commander`, `vitest`), or any breaking change flagged in a changelog → file an issue + plan as a full story.
  - Minor/patch bumps of critical-path deps still merge routinely, but with a closer changelog read (deprecations, removed exports, runtime-behaviour notes); escalate if non-trivial.
- [ ] **`npm audit --audit-level=high`** — `high`/`critical` → file an issue + fix before this story.
- [ ] **Proceed-to-planning** decision recorded in the new plan file's Context section.

## Output

The plan file's Context section should contain a "Maintenance sub-loop (§ 6.7) run YYYY-MM-DD pre-planning" subsection summarising the result of each check above (one bullet each). Example: see [docs/plans/story-maint-12.md](../plans/story-maint-12.md).
