# Retrospective — story-maint-20 (remove unauthenticated github MCP server)

Plan: folded into the PR body (Light lane, CLAUDE.md § 6 "Risk-based lanes"). Lane: **Light** — repo tooling config, zero production-code surface (`src/` untouched).

The `github` server in `.mcp.json` interpolated `GITHUB_PERSONAL_ACCESS_TOKEN` from `${GITHUB_TOKEN}`, an environment variable that is never set on this machine. Every session the server booted with an empty token, 401'd on every call, and the loop fell back to `gh` CLI — surfacing a misleading "GitHub MCP token is stale" message on each fallback. The token was not stale; it was absent, and had never authenticated in this configuration. `gh` CLI is authenticated via keyring (scopes `repo, read:org, gist, admin:public_key`) and was already the de facto GitHub path. This story deletes the dead config.

## Loop metrics

- **Weight:** shipped diff_loc = 11 (one file deleted), no plan file (Light lane folds it into the PR). Nothing for `weight-ratio-heavy` to fire on.
- **Commit envelope:** **2 change commits + 1 retro commit** (the deletion, plus a Phase-4 fix slice that repaired the dependent specs — see below). R16's nominal shape is 4 change-body commits; padding beyond the real slices with empty `refactor:`/`feat:` commits would add noise, not traceability. R11/R20 sanction *acceptable* empty slices, not *mandatory* ones; the honest count is the number of real behaviours (2).
- **Phase 4 review:** `code-reviewer` only (Light lane). It caught the load-bearing miss (below); 3 fix-now edits landed in one follow-up slice.

## Keep

- **Diagnose the message, not the metaphor.** "Token is stale" implied a refresh/rotation problem; the actual cause was an unset env var, so no amount of re-authenticating would ever have fixed it. Checking `gh auth status` and the literal `.mcp.json` env interpolation before acting turned a recurring nuisance into a one-line deletion.
- **Prefer one authenticated path over two half-working ones.** Keeping a broken MCP server "just in case" bought nothing — it always fell back to `gh`. Removing it eliminates the fallback noise and the per-session startup cost.
- **`code-reviewer` earned its keep on a "trivial" delete.** The initial commit removed `.mcp.json` but left `.claude/agents/sibling-overlap.md:15` declaring that very file a *hard precondition* — and `sibling-overlap` is a **mandatory** Phase-2 agent (Full + Reduced lanes). Deleting a config without updating the one spec that requires it would have silently broken the dev-loop. Phase-4 caught it; the fix slice rewired `sibling-overlap.md` to `gh` CLI (it already had the Bash tool) and made the two now-inactive MCP branches in `maintenance-sub-loop.md` truthful. **A config deletion's blast radius is every doc that names the config — grep for it before calling the change atomic.**

## Change

- **A silent config default masqueraded as a runtime fault for months.** The empty-token boot produced a fallback message that read like a transient/expiring-credential issue, so the root cause (config referencing an unset var) went un-investigated. **Lesson:** when a "stale credential" message recurs every session rather than intermittently, suspect *absent/misconfigured* before *expired*.
- **This reverses the MCP setup [story-h3](../plans/story-h3.md) introduced.** That (landed) plan wired `.mcp.json` + `${GITHUB_TOKEN}` as the intended GitHub access path. It never authenticated in practice. The landed plan is left as-is (historical record — we don't rewrite shipped plans); this retro is the forward pointer that records the reversal.

## Try

- **Audit `.mcp.json` env interpolations against the actual environment when adding an MCP server.** A `${VAR}` that resolves to empty should fail loudly at setup, not degrade into a per-session fallback. If a correctly-configured GitHub MCP server is ever wanted, source the token explicitly (e.g. from `gh auth token`) and verify it authenticates before committing the config.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| (none) | — | — |
