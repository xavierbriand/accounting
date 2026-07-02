# Retrospective — story-h3: Harness Module 2 — Claude Code primitives, by niche

**Date:** 2026-05-13  
**Format:** Keep / Change / Try

> **Branch/story-id note:** originally planned and committed as `story-h2`; renamed to `story-h3` after discovering `story-h2` was already taken by the merged drift-scan hard-exit cleanup ([PR #125](https://github.com/xavierbriand/accounting/pull/125), closes [#120](https://github.com/xavierbriand/accounting/issues/120)). See [docs/plans/story-h3.md](../plans/story-h3.md) for the full note. Quoted commit-era details below (file paths, counts) reflect what actually happened under the old id where noted.

---

## Keep

- **Parallel Phase 2 sub-agents.** Running `plan-reviewer` and `sibling-overlap` in a single message (two Agent tool calls) worked cleanly. No cross-contamination between findings, no budget pressure from sequential loading. First documented parallel-agent use in this workflow — the pattern should become the default for Phase 2.

- **Harness-only story pattern.** No `src/` changes, no test TDD cycle — the `harness/` exemption from coverage rules is correct. Configuration primitives do not belong in the domain test budget.

- **One commit per primitive.** Each of the 8 commits maps to exactly one primitive with its niche justification in the subject. The `git log --oneline` for this story reads like the niche table, which was the goal.

- **Plan explicitly called out R13 vs R16.** Adding the disambiguation section to the plan prevented a scope-collapse question at Phase 3. Pattern worth keeping for any harness story that ships new observable behaviours.

---

## Change

- **Statusline config is user-level, not project-level.** The statusline is configured via `/statusline` interactive command, writing to `~/.claude/settings.json` — not the repo-tracked `.claude/settings.json`. Future harness stories that touch statusline should document this distinction in the plan *before* Phase 3, not discover it during implementation. Added to `docs/plans/story-h3.md § Statusline config note`.

- **R3 scope is ambiguous for ephemeral `npx` MCP packages.** R3 says "Tool-bundle import audit when a new framework/library enters the deps" — but `@modelcontextprotocol/server-github` never enters `package.json` (it runs via `npx -y`). The current R3 rule does not catch this. A future CLAUDE.md edit should clarify: R3 applies to `package.json` runtime deps; ephemeral `npx` MCP servers are acknowledged separately in the plan's Risks section.

---

## Try

- **R22 *(pending)*: Parallel Phase 2 as the default pattern.** The first parallel Phase 2 demonstration (story-h3) went smoothly. Evaluate after 2–3 more stories whether to codify this as a rule (R22): "Phase 2 always launches plan-reviewer and sibling-overlap in a single message." Defer to next planning session.

- **Pin `npx -y` MCP versions.** `npx -y @modelcontextprotocol/server-github` is unlocked (no version pin). Supply-chain risk is low for a curriculum primitive, but a future maintenance story should add version pinning to `.mcp.json`. Track via GitHub issue post-merge.

- **Drift-scan check for `.mcp.json`.** The drift-scan currently watches `docs/retrospectives/`, `docs/plans/`, and `CLAUDE.md`. As `.mcp.json` becomes load-bearing harness config, consider whether drift-scan should assert its presence or schema. Candidate for Module 3 (right-sizing) discussion.

---

## Loop metrics

- **Commits:** 10 (1 preparatory P0 + 8 change-body + 1 drift-scan fixup for *(pending)* marker). Target: 6–10 (R13). Within budget.
- **Files new:** 7 (`.claude/commands/story-status.md`, `.claude/commands/new-story-preflight.md`, `.claude/agents/sibling-overlap.md`, `.mcp.json`, `.claude/.last-lint-result` [gitignored], `docs/plans/story-h3.md`, `docs/status.d/2026-05-13-story-h3.md`)
- **Files modified:** 5 (`.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `docs/learning/harness-engineering.md`, `docs/templates/maintenance-sub-loop.md`)
- **Parallel Phase 2:** yes — plan-reviewer + sibling-overlap in single message, 2026-05-12.
- **No `src/` changes:** confirmed. `grep -r "from.*harness" src/ tests/` → empty.

---

## Code-review findings (Phase 4, 2026-05-13)

9 findings total (3 P1, 1 P2, 5 P3 of which 3 soft).

| Finding | Classification | Resolution |
|---------|---------------|------------|
| P1: R2 `.gitignore` missing from modified-files table | ACKNOWLEDGE | Planning artifact; correct implementation |
| P1: R2 status fragment date mismatch (`2026-05-12` in plan, `2026-05-13` actual) | ACKNOWLEDGE | Implementation ran next day; committed file is correct |
| P1: C4 commit labeled `feat:` but docs-only content | ACKNOWLEDGE | Not an empty slice per R20; mislabel is minor |
| P2: two DEFER entries lacked GitHub issue links | FIX-NOW | Created #131 (version pin) and #132 (R3 scope); plan suggestion log updated |
| P3: retro loop-metrics undercount (said 9, actual 10) | FIX-NOW | Corrected to 10 in this retro |
| P3: R22 tag collision between h1 and h3 retros (latent) | ACKNOWLEDGE | Updated post-rename: actually a 3-way collision — story-h1's "over-import trap", the real story-h2's (PR #125) "grep -rn audit on deletion", and this story's "parallel Phase 2 default" all propose R22. Resolves when one candidate is codified; the others get the next available tags |
| P3 soft: post-retro drift-scan fixup commit pattern | ACKNOWLEDGE | Workflow note: run drift-scan before committing retro next time |
| P3 soft: sibling-overlap spec uses broad Bash tool | ACKNOWLEDGE | Prompt-level constraint adequate; tighten in future if needed |
| P3 soft: new-story-preflight relies on convention not enforcement | ACKNOWLEDGE | Curriculum-appropriate limitation |
