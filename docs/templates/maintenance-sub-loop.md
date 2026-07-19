# Maintenance sub-loop checklist

Run before opening every new story plan ([CLAUDE.md § 6.7](../../CLAUDE.md)). Copy this list into the plan's "Maintenance sub-loop" section and tick as you go.

This is the **runnable** form of the rule. The conceptual statement lives in CLAUDE.md § 6.7; if the *concept* changes, update CLAUDE.md. If the *steps* change (a new tool, a refined trigger, etc.), update this file.

## Checklist

- [ ] **Sibling work check.** `gh pr list --state open --draft --base main --json number,title,headRefName --limit 50` + `gh issue list --state open --json number,title,labels --limit 50` — for each open/draft PR or issue, confirm it isn't already addressing the same goal you're about to plan against. If overlap, defer or coordinate.
  - The `gh` bash forms above are the active path — the repo ships no `.mcp.json` (removed in story-maint-20). **If** a working GitHub MCP server is re-added later, its `list_pull_requests` / `list_issues` / `get_issue` tools can replace these calls (bound them via `per_page` for the same context-diet reason); verify it authenticates (`export GITHUB_TOKEN=$(gh auth token)` before launch, then confirm a live MCP call succeeds) before relying on it.
- [ ] **Story-id uniqueness.** Before picking a story id (e.g. `zz9`), confirm no `docs/plans/`, `docs/retrospectives/`, or `docs/status.d/` file for that id already exists on `origin/main`:
      `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i "story-zz9"`
      Also check open PR branch names (`gh pr list --state open --json headRefName --limit 50`) for the same id in flight. If taken, pick the next free id before branching. Curriculum-numbered tracks (e.g. `story-h<N>`) are especially exposed — a module number does not guarantee its id is unused; off-curriculum cleanups can consume ids out of sequence.
- [ ] **Working tree clean.** `git status` clean; story branch rebased on `origin/main`.
- [ ] **Open issues.** `gh issue list --state open --limit 50 --json number,title,labels` — re-prioritise, close stale, confirm `deferred-suggestion` items still relevant.
- [ ] **Backlog refinement.** Run `/refine-backlog` (or review the latest Backlog refinement report) for a deeper tracker-hygiene pass than the line above — aging items, label gaps, umbrella/checkbox drift, superseded duplicates, mis-armed tripwires. The `backlog-refiner` agent is propose-only; tag its proposed actions and execute the approved ones from the main session. Not required every sub-loop, but the recommended way to keep the tracker coordinating.
- [ ] **Open PRs.** `gh pr list --state open --json number,title,isDraft --limit 50` — Dependabot/draft state.
  - The `gh` bash forms are the active path (no `.mcp.json` ships — see the sibling-work check above). A re-added GitHub MCP server's `list_pull_requests` / `list_issues` tools could replace them once verified.
  - Routine bumps (patch or minor, any dep) → merge directly after CI + changelog check, no DoR/DoD/retro.
  - Major bumps of runtime deps, critical-path major bumps (`better-sqlite3`, `dinero.js`, `zod`, `commander`, `vitest`), or any breaking change flagged in a changelog → file an issue + plan as a full story.
  - Minor/patch bumps of critical-path deps still merge routinely, but with a closer changelog read (deprecations, removed exports, runtime-behaviour notes); escalate if non-trivial.
- [ ] **`npm audit --audit-level=high`** — `high`/`critical` → file an issue + fix before this story.
- [ ] **Drain.** Close or explicitly re-justify **≥1** deferred-suggestion/aging item this session
  (cite it in the plan's Context) — the loop must subtract process debt at the same rate it adds
  it (story-h13, #164).
- [ ] **Proceed-to-planning** decision recorded in the new plan file's Context section.

## Output

The plan file's Context section should contain a "Maintenance sub-loop (§ 6.7) run YYYY-MM-DD pre-planning" subsection summarising the result of each check above (one bullet each). Example: see [docs/plans/story-maint-12.md](../plans/story-maint-12.md).
