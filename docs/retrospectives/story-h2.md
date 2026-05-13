# Retrospective — story-h2: Harness Module 2 — Claude Code primitives, by niche

**Date:** 2026-05-13  
**Format:** Keep / Change / Try

---

## Keep

- **Parallel Phase 2 sub-agents.** Running `plan-reviewer` and `sibling-overlap` in a single message (two Agent tool calls) worked cleanly. No cross-contamination between findings, no budget pressure from sequential loading. First documented parallel-agent use in this workflow — the pattern should become the default for Phase 2.

- **Harness-only story pattern.** No `src/` changes, no test TDD cycle — the `harness/` exemption from coverage rules is correct. Configuration primitives do not belong in the domain test budget.

- **One commit per primitive.** Each of the 8 commits maps to exactly one primitive with its niche justification in the subject. The `git log --oneline` for this story reads like the niche table, which was the goal.

- **Plan explicitly called out R13 vs R16.** Adding the disambiguation section to the plan prevented a scope-collapse question at Phase 3. Pattern worth keeping for any harness story that ships new observable behaviours.

---

## Change

- **Statusline config is user-level, not project-level.** The statusline is configured via `/statusline` interactive command, writing to `~/.claude/settings.json` — not the repo-tracked `.claude/settings.json`. Future harness stories that touch statusline should document this distinction in the plan *before* Phase 3, not discover it during implementation. Added to `docs/plans/story-h2.md § Statusline config note`.

- **R3 scope is ambiguous for ephemeral `npx` MCP packages.** R3 says "Tool-bundle import audit when a new framework/library enters the deps" — but `@modelcontextprotocol/server-github` never enters `package.json` (it runs via `npx -y`). The current R3 rule does not catch this. A future CLAUDE.md edit should clarify: R3 applies to `package.json` runtime deps; ephemeral `npx` MCP servers are acknowledged separately in the plan's Risks section.

---

## Try

- **R22: Parallel Phase 2 as the default pattern.** The first parallel Phase 2 demonstration (story-h2) went smoothly. Evaluate after 2–3 more stories whether to codify this as a rule (R22): "Phase 2 always launches plan-reviewer and sibling-overlap in a single message." Defer to next planning session.

- **Pin `npx -y` MCP versions.** `npx -y @modelcontextprotocol/server-github` is unlocked (no version pin). Supply-chain risk is low for a curriculum primitive, but a future maintenance story should add version pinning to `.mcp.json`. Track via GitHub issue post-merge.

- **Drift-scan check for `.mcp.json`.** The drift-scan currently watches `docs/retrospectives/`, `docs/plans/`, and `CLAUDE.md`. As `.mcp.json` becomes load-bearing harness config, consider whether drift-scan should assert its presence or schema. Candidate for Module 3 (right-sizing) discussion.

---

## Loop metrics

- **Commits:** 9 (1 preparatory P0 + 8 change-body). Target: 6–10 (R13). Within budget.
- **Files new:** 7 (`.claude/commands/story-status.md`, `.claude/commands/new-story-preflight.md`, `.claude/agents/sibling-overlap.md`, `.mcp.json`, `.claude/.last-lint-result` [gitignored], `docs/plans/story-h2.md`, `docs/status.d/2026-05-13-story-h2.md`)
- **Files modified:** 5 (`.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `docs/learning/harness-engineering.md`, `docs/templates/maintenance-sub-loop.md`)
- **Parallel Phase 2:** yes — plan-reviewer + sibling-overlap in single message, 2026-05-12.
- **No `src/` changes:** confirmed. `grep -r "from.*harness" src/ tests/` → empty.
