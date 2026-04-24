---
description: The product-dev-agent maintenance sub-loop. Triage open issues, review Dependabot PRs, and walk npm audit. Runs unconditionally before every new story's planning phase. Use when starting a new story or when the user says "maintenance", "/maintenance", or "before we plan the next story".
---

# /product-dev-agent:maintenance

You are running the **maintenance sub-loop** of the product-dev-agent loop. Read `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Maintenance sub-loop" before starting.

This sub-loop runs **unconditionally before the planning phase of every new story**. It is lighter than feature work; aggregate learnings surface at the next per-story retrospective.

## Three passes

### 1. Triage open issues

Use the GitHub MCP tools to list open issues on the consuming project's repo.

For each:
- **Re-prioritise.** Is it still relevant given recent stories?
- **Close stale.** Issues whose context has changed and are no longer valid → close with a reason.
- **Confirm `deferred-suggestion` issues.** Each was filed during a critical review. Is the suggestion still worth doing? If not → close. If yes → leave open, optionally add a comment with current relevance.

### 2. Review open Dependabot PRs

For each open Dependabot PR:

1. Check CI is green.
2. Read the diff.
3. Read the changelog of the bumped dep.
4. Apply the merge policy:
   - **Patch / minor of any dep** → merge directly after CI + changelog check. No DoR/DoD/retro.
   - **Patch / minor of a critical-path dep** → merge directly, but read the changelog more closely (deprecations, removed exports, runtime behaviour notes). Escalate if anything looks non-trivial.
   - **Major bump of any runtime dep** OR **major bump of a critical-path dep** OR **any breaking change flagged in changelog** → file an issue and run a full story through the main loop.

The consuming project's "critical-path deps" list lives in its `CLAUDE.md` loop-overlay. If unspecified, default to: testing framework, primary database driver, primary validation library, CLI framework.

### 3. `npm audit` (or language equivalent)

Run the consuming project's audit command. Default: `npm audit`.

- **`high` / `critical` advisories** → file an immediate issue. Fix before the next story starts.
- **`moderate`** → noted in the maintenance pass; not a blocker.
- **`low` / `info`** → ignored unless they cluster.

## Output

Produce a 5–10 line summary:

```
## Maintenance pass · <date>

Issues triaged: <n> closed, <n> re-prioritised, <n> left open.
Dependabot PRs: <n> merged, <n> escalated to story.
npm audit: <severity counts>. Action: <none | issue #X filed>.

Hand-off to /plan-story.
```

## Exit gate

Maintenance is done when:

- Open issues are walked.
- Open Dependabot PRs are walked.
- Audit is run.
- Summary is posted (PR comment, or chat message if no PR exists yet).

Hand off to `/product-dev-agent:plan-story` next.

## Guardrails

- **Do not skip a Dependabot PR because "it looks routine".** Read the changelog every time.
- **Do not auto-merge majors.** Even Dependabot for a major bump needs a story.
- **Do not let high/critical audits coexist with new feature work.** Fix-or-mitigate before planning the next story.
