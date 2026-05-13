# Story h2: Harness Module 2 — Claude Code primitives, by niche

## Context

Module 1 (story-h1, PR #115) shipped `harness/drift-scan/` and established the `harness/` tree (tsconfig.harness.json, vitest.harness.config.ts, npm run test:harness). Module 2 builds fluency with Claude Code's primitives by adding **one of each**, choosing examples that demonstrate the *niche* of each — the moment when each primitive and only it solves the problem.

The six primitives: slash command, skill, hook, statusline, sub-agent parallelism, and MCP server. Each is wired to a real workflow need in this repo so the exercise is load-bearing, not synthetic.

This story also **demonstrates parallel Phase 2 sub-agents for the first time**: plan-reviewer and sibling-overlap audit ran concurrently during planning.

Tracked by: GitHub issue #96. Epic: #94.

---

## Maintenance sub-loop (§ 6.7) — 2026-05-12

- **Sibling work:** 5 open dependabot PRs (#123, #126, #127, #128, #129) — all patch/minor, no harness overlap. 25 open issues; none conflict with story-h2 scope.
- **Working tree:** clean, `main` up to date with `origin/main`.
- **story-h2 branch:** does not exist yet.
- **npm audit:** 0 high-severity vulnerabilities.
- **Proceed:** yes — no blockers.

---

## Story

As a developer running this repo, I want one working example of each Claude Code primitive committed to the project with a clear niche justification, so I can distinguish when to reach for each one and the curriculum niche table is grounded in real additions I shipped.

---

## Selected solution

### Primitive 1: Slash command `/story-status`

**Niche:** A reusable invocation a *human* types explicitly. Self-contained. No silent triggering.

**File:** `.claude/commands/story-status.md`

**Content (the prompt):**
```
Read every file in docs/status.d/ sorted by filename (newest last) and run:
  gh pr list --state open --json number,title,headRefName,isDraft
For each story with a status fragment and/or open PR, output one line:
  `<story-id> · <branch> · <what it is doing> · PR #N (draft|open|none)`
Sort by most-recent status fragment date. If no stories are in flight, say "No stories in flight."
```

**Why slash command, not skill:** The user explicitly asks for this report; the model should not produce it silently when context hints at it.

---

### Primitive 2: Skill — `new-story-preflight`

**Niche:** Domain knowledge the *model* loads when the topic is relevant. Triggered by context, not explicit command.

**File:** `.claude/commands/new-story-preflight.md`

**Implementation note:** Claude Code stores project-level slash commands and skills in the same `.claude/commands/` directory. The primitive distinction is enforced by a `WHEN_TO_USE` header in the file and a CLAUDE.md instruction that Opus should load this file automatically when planning starts — without the user typing anything.

**Content:**
```markdown
WHEN_TO_USE: Load this automatically when the user says "let's do story X", "start planning",
"open a new story", or similar. Do NOT wait to be asked.

## New-story preflight checklist

1. Run maintenance sub-loop (docs/templates/maintenance-sub-loop.md) — confirm no sibling
   overlap, clean tree, no high vulns. Record result in plan Context section.
2. Create story worktree:
     git worktree add ../accounting-<story-id> -b story-<story-id>
3. Initialize plan template: copy docs/templates/plan-template.md to
   docs/plans/story-<id>.md, then fill Context and Story sections before calling ExitPlanMode.
```

**Why skill, not slash command:** The user should not have to remember to type this. The model should apply the checklist whenever planning opens.

---

### Primitive 3: Stop hook — lint on changed TypeScript files

**Niche:** An *automated* response to a tool event. Side-effects on the harness without user action.

**Location:** `.claude/settings.json` under `hooks.Stop`

**Hook command** (use `npm run lint` — the multi-stage `xargs npx eslint` form introduces shell injection risk via file-path interpolation and is rejected):
```bash
result=$(npm run lint 2>&1 | tail -3); if npm run lint > /dev/null 2>&1; then echo "lint: pass"; else echo "lint: FAIL — $result"; fi > .claude/.last-lint-result
```

**`.claude/.last-lint-result`** is a runtime artifact. It must be in `.gitignore` (not committed). The C3 commit creates an empty placeholder so statusline has content before the first hook fires.

**Why hook, not slash command:** The user should never have to remember to run lint after Claude edits files. The Stop event fires automatically.

---

### Primitive 4: Statusline — `branch · lint-status · story-id`

**Niche:** Persistent state the user wants visible *between* turns (not just in one response).

**Configuration:** Invoke the `statusline-setup` skill during implementation to wire the statusline. The target display is:

```
story-h2 · lint: pass · h2
```

Where:
- `branch` → `git branch --show-current`
- `lint-status` → content of `.claude/.last-lint-result` (written by Stop hook above)
- `story-id` → branch name stripped of `story-` prefix

**Note:** Statusline config may be user-level (`~/.claude/settings.json`) rather than project-level. The implementation should document the exact config location in the retro.

**Why statusline, not hook:** A hook fires on specific events; the statusline is always visible. The lint result should persist between turns, not only appear when Claude edits files.

---

### Primitive 5: Sub-agent parallelism — Phase 2 plan-reviewer + sibling-overlap audit

**Niche:** A *context-budget* tool. Spin up when work would pollute the parent's context with intermediate results.

**New file:** `.claude/agents/sibling-overlap.md`

**Spec content:**
```markdown
---
name: sibling-overlap
description: Read-only agent that checks open PRs and issues for scope overlap with a given story plan.
tools: Read, Glob, Grep, Bash
---

You are a sibling-overlap auditor. Given a story plan file path:
1. Read the plan's Context and Story sections to understand scope.
2. Run: gh pr list --state open --json number,title,headRefName,body
3. Run: gh issue list --state open --limit 50 --json number,title,body,labels
4. For each open PR/issue, determine whether its scope overlaps this story.
5. Return a structured report listing any overlapping PRs/issues with one-line explanation.
   If none overlap, return: "no sibling overlap detected."

Never modify files. Never file issues. Read-only only.
```

**CLAUDE.md Phase 2 update:** Change the Phase 2 paragraph to read:
> "invoke `plan-reviewer` sub-agent AND `sibling-overlap` sub-agent **in parallel** (single message, two Agent tool calls); consume both structured findings; tag each finding adopted/deferred/rejected in the suggestion log."

**Demonstration:** This story's Phase 2 launched both agents in a single message — the first documented use of parallel sub-agents in this workflow.

**Why sub-agent, not slash command or hook:** Loading a full plan + running gh queries inside the parent context displaces the planning budget. Parallel sub-agents give independent analysis without cross-contamination.

---

### Primitive 6: MCP server — read-only GitHub

**Niche:** An *external system* you want exposed as native typed tools, not shell subprocesses.

**File:** `.mcp.json` at repo root

**Content:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**Token sourcing:** `export GITHUB_TOKEN=$(gh auth token)` populates it from the already-authenticated gh CLI. This one-liner belongs in `docs/templates/maintenance-sub-loop.md` as a setup note.

**Maintenance-sub-loop update:** `docs/templates/maintenance-sub-loop.md` — add a note on checks 1 and 4 that the GitHub MCP tools (`list_pull_requests`, `list_issues`, `get_issue`) can substitute for the `gh pr list` / `gh issue list` bash calls when the MCP server is active.

**Why MCP, not bash:** The maintenance sub-loop calls `gh` repeatedly. MCP exposes structured tool calls returning typed JSON directly in the model's tool-use flow — no subprocess, no parsing, schema-checked.

**Package name risk:** `@modelcontextprotocol/server-github` is the expected npm name. Implementer should run `npm info @modelcontextprotocol/server-github` before wiring; fallback candidate: `@github/mcp-server-github`.

---

## Production-code surface (R2)

No `src/` files touched. No migrations. No schema changes. Harness-only.

**New files (7):**

| File | Type | Purpose |
|------|------|---------|
| `.claude/commands/story-status.md` | Slash command | `/project:story-status` prompt |
| `.claude/commands/new-story-preflight.md` | Skill | Model-loaded story kickoff checklist |
| `.claude/agents/sibling-overlap.md` | Agent spec | Parallel Phase 2 overlap audit |
| `.mcp.json` | MCP config | GitHub read-only server |
| `.claude/.last-lint-result` | Runtime artifact | Stop hook → statusline bridge |
| `docs/plans/story-h2.md` | Plan | R1 |
| `docs/status.d/2026-05-12-story-h2.md` | Status fragment | R17 |

**Modified files (4):**

| File | Change |
|------|--------|
| `.claude/settings.json` | Add Stop hook; add Bash permission for lint write |
| `CLAUDE.md` | Phase 2: parallel sub-agent invocation; reference new sibling-overlap agent |
| `docs/learning/harness-engineering.md` | Populate niche table with shipped examples |
| `docs/templates/maintenance-sub-loop.md` | Add MCP alternative note for gh calls |

---

## Acceptance scenarios

These primitives are Claude Code configuration, not domain logic. Acceptance is behavioral/manual, with integration tests where automation is feasible.

**Scenario A — Slash command**
```
Given docs/status.d/ contains the story-h1 fragment
When the user invokes /project:story-status
Then Claude outputs one line per in-flight story with ID and status
fails if: command file missing or malformed; Claude cannot locate it
```

**Scenario B — Skill trigger**
```
Given .claude/commands/new-story-preflight.md exists with WHEN_TO_USE header
When the user opens a new session and says "let's do story h3"
Then Claude applies the preflight checklist without explicit invocation
fails if: WHEN_TO_USE header absent; model does not trigger on "let's do story X"
```

**Scenario C — Stop hook**
```
Given Claude has edited a .ts file during the session
When Claude's turn ends (Stop event fires)
Then npm run lint executes on changed files
And .claude/.last-lint-result contains pass/fail content
fails if: Stop hook entry malformed; hook does not fire on Stop event
```

**Scenario D — MCP server**
```
Given .mcp.json configures the GitHub MCP server
And GITHUB_TOKEN is set in the environment
When the user asks "what is issue #96 about?"
Then Claude uses the MCP tool call (not Bash gh) to return issue data
fails if: .mcp.json missing or token absent; MCP server fails to start
```

**Scenario E — Parallel Phase 2**
```
Given this plan exists at docs/plans/story-h2.md
When Phase 2 runs
Then plan-reviewer and sibling-overlap agents launched in a single message
And both findings are consumed before the suggestion log is written
fails if: agents run sequentially; only one agent invoked per message
```

---

## Slice plan (R13: target 6–10 commits)

Preparatory (before Phase 3; not counted per R16):
- **P0:** `chore(docs): story-h2 plan + parallel Phase 2 review [story-h2]`

Change-body commits:
1. **C1:** `feat(harness): slash command /story-status — niche: reusable human-typed invocation [story-h2]`  
   Files: `.claude/commands/story-status.md`

2. **C2:** `feat(harness): skill new-story-preflight — niche: model-loaded domain knowledge on topic match [story-h2]`  
   Files: `.claude/commands/new-story-preflight.md`

3. **C3:** `feat(harness): Stop hook for post-turn lint check — niche: automated tool-event side-effect [story-h2]`  
   Files: `.claude/settings.json` (Stop hook), `.claude/.last-lint-result` (placeholder)

4. **C4:** `feat(harness): statusline branch·lint·story — niche: persistent state visible between turns [story-h2]`  
   Files: statusline config (location TBD by implementer during C4)

5. **C5:** `feat(harness): sibling-overlap agent + parallel Phase 2 in CLAUDE.md — niche: context-budget parallelism [story-h2]`  
   Files: `.claude/agents/sibling-overlap.md`, `CLAUDE.md`

6. **C6:** `feat(harness): GitHub MCP server in .mcp.json — niche: external system as native typed tools [story-h2]`  
   Files: `.mcp.json`, `docs/templates/maintenance-sub-loop.md`

7. **C7:** `chore(docs): niche table populated from story-h2 shipped primitives [story-h2]`  
   Files: `docs/learning/harness-engineering.md`

8. **C8:** `chore(retro): story-h2 retrospective + status fragment [story-h2]`  
   Files: `docs/retrospectives/story-h2.md`, `docs/status.d/2026-05-12-story-h2.md`

**Total: 8 change-body + 1 preparatory = 9 commits.** Within R13 (6–10).

---

## R13 vs R16 — why R13 applies

R16 collapses to 4 commits for "zero-behaviour-change" stories (process refresh, doc refresh, parallel-safety). Story-h2 adds 6 *new harness behaviours*: a hook that fires on Stop events, an MCP server that serves tool calls, a slash command that runs, a skill that triggers, a statusline that updates. These are new observable system behaviours, not zero-behaviour-change. R13 (6–10 commits) applies; R16 does not.

---

## Risks & deferred items

| Risk | Mitigation |
|------|-----------|
| `@modelcontextprotocol/server-github` package name may differ | Run `npm info @modelcontextprotocol/server-github` before wiring; fallback: `@github/mcp-server-github` |
| `${GITHUB_TOKEN}` env-var syntax in `.mcp.json` may differ from MCP runtime expectation | Verify when wiring; check server README for env-var format |
| `npx -y` MCP invocation is unlocked (supply-chain risk) | **Defer:** file GitHub issue post-story to pin version; acceptable for curriculum primitive |
| Statusline config may be user-level, not project-level | Use `statusline-setup` skill; document exact file in retro |
| `.claude/.last-lint-result` must be gitignored | Add to `.gitignore` in C3; create empty placeholder so statusline has content before first hook fires |
| Skill vs slash command distinction relies on behavioral trigger | Acceptable: enforced via WHEN_TO_USE header + CLAUDE.md instruction, not technical mechanism |

---

## Verification plan

1. **Slash command:** `/project:story-status` in CLI → output lists story-h1 with status.
2. **Skill:** fresh session → say "let's open story h3" → Claude applies preflight unprompted.
3. **Stop hook:** edit any `.ts` file, complete turn → `.claude/.last-lint-result` contains content.
4. **Statusline:** between turns, statusline shows `<branch> · lint: <status> · <story-id>`.
5. **Parallel Phase 2:** retro fragment confirms plan-reviewer + sibling-overlap launched in single message.
6. **MCP:** `export GITHUB_TOKEN=$(gh auth token)` → ask "look up issue #96" → Claude uses MCP tool, not Bash.
7. **No cross-tree import:** `grep -r "from.*harness" src/ tests/` → empty.
8. **Drift-scan:** `npx tsx harness/drift-scan/drift-scan.ts --all` → exit 0, no hard findings.
9. **Build + test + lint:** `npm run lint && npm run build && npm test` → green.
10. **Niche table:** each row in harness-engineering.md Module 2 niche table links to a shipped file.

---

## DoR checklist

- [x] Phase 1 (exploration) complete
- [x] Phase 2 (plan-reviewer + sibling-overlap in parallel) — complete 2026-05-12; parallel agents demonstrated
- [ ] Phase 3 (Sonnet implementation) — pending
- [ ] Phase 4 (code review + refactor) — pending
- [ ] Phase 5 (retrospective) — pending

---

## Suggestion log

**Phase 2 — plan-reviewer findings (Sonnet, 2026-05-12)**

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| P1-1 | R1: plan at `~/.claude/plans/` not `docs/plans/story-h2.md` | ACKNOWLEDGE | Session file is working artifact; `docs/plans/story-h2.md` created in preparatory commit P0 |
| P1-2 | R2: "Modified files (3)" header lists 4 rows | ADOPT | Fixed to "(4)" in this plan |
| P1-3 | R3: no import audit for `@modelcontextprotocol/server-github` via `npx` | DEFER | R3 targets `package.json` deps; ephemeral `npx` MCP server never enters lock file. Retro will clarify R3 scope for MCP packages. |
| P1-4 | R6/R7: all `fails if` clauses present and correctly scoped | ACKNOWLEDGE | Pass |
| P1-5 | Scenario E Given references file not yet existing at Phase 2 | ACKNOWLEDGE | Scenario E is a workflow observation, not an automated test invariant; forward-looking Given is acceptable |
| P2-1 | `.claude/.last-lint-result` gitignore not specified | ADOPT | Added to risks + C3 description |
| P2-2 | First network-capable primitive in harness | ACKNOWLEDGE | MCP calls GitHub API, not ledger data; QA invariant holds |
| P2-3 | `${GITHUB_TOKEN}` syntax not verified | ADOPT | Added to risks; verify during C6 implementation |
| P3-1 | R13 vs R16 — no explicit rationale | ADOPT | Added "R13 vs R16" section to plan |
| P3-2 | Stop hook multi-stage form has shell injection risk | ADOPT | Dropped multi-stage form; plan specifies `npm run lint` wrapper only |
| P3-3 | `npx -y` MCP invocation is unlocked (supply chain) | DEFER | File GitHub issue post-story to pin version |
| P3-4 | C4 statusline file location TBD | ACKNOWLEDGE | Implementation-time decision; retro documents exact path |
| P3-5 | R21: no new R-tag proposed for parallel Phase 2 pattern | ACKNOWLEDGE | Evaluate in retro whether pattern warrants R22 |
| P3-6 | Skill/slash-command substrate note | ACKNOWLEDGE | Design choice; niche distinction is conceptual and documented |

**Phase 2 — sibling-overlap audit (parallel, 2026-05-12)**

No sibling overlap detected. All 5 open PRs are Dependabot patch/minor bumps. 25 open issues include harness curriculum modules #94–#100 but none conflict with story-h2's specific primitive implementations.

---

## Statusline config note

The statusline is configured via the interactive `/statusline` command inside a running Claude Code session. It is **not** a committed project file — the configuration is written to the user-level settings at `~/.claude/settings.json` under a key such as `statusCommand` (exact key name may vary by Claude Code version; inspect the diff to `~/.claude/settings.json` after running `/statusline` to confirm).

**To configure:** start Claude Code in the story worktree and run:
```
/statusline
```
Then enter the desired statusline script. The target script for this project:
```bash
branch=$(git branch --show-current 2>/dev/null || echo "no-branch")
lint=$(cat .claude/.last-lint-result 2>/dev/null || echo "lint: -")
story_id=$(echo "$branch" | sed 's/^story-//')
echo "$branch · $lint · $story_id"
```

This produces output like: `story-h2 · lint: pass · h2`

**Config location confirmed (story-h2 implementation):** user-level `~/.claude/settings.json`. Project-level `.claude/settings.json` does not support `statusCommand`. The statusline is per-developer, not per-repo — this is expected and acceptable for a harness primitive. Future harness stories that touch statusline should document this distinction upfront.
