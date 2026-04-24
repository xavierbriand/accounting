<!-- product-dev-agent:snippet -->
## Product development loop

This project uses the [`product-dev-agent`](https://github.com/xavierbriand/product-dev-agent) plugin for its development workflow.

**Authoritative loop reference:** `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` — phases, DoR/DoD, model tiers, commit conventions.

### Loop skills

Drive the loop with these slash commands (the `product-dev-agent:` prefix is required — Claude Code namespaces all plugin skills):

- `/product-dev-agent:maintenance` — triage issues, review Dependabot, audit. Run before every new story.
- `/product-dev-agent:plan-story <id>` — Phase 1: intent → alternatives → Gherkin → draft PR + plan file.
- `/product-dev-agent:review-plan` — Phase 2: P1/P2/P3 critical review of the plan. DoR gate.
- `/product-dev-agent:implement` — Phase 3: hand off to the `sonnet-implementer` agent.
- `/product-dev-agent:review-impl` — Phase 4: P1/P2/P3 retro-check against the diff. Refactor plan.
- `/product-dev-agent:retro <id>` — Phase 5: Keep/Change/Try retrospective. New rules land in same PR.
- `/product-dev-agent:bootstrap` — one-shot installer for templates + this snippet. Use `--check` to detect drift.

### Loop overlay (project-specific)

<!-- Fill in for this project. Examples below. -->

- **Green-suite command:** `<your project's lint+build+test command>` (e.g. `npm run lint && npm run build && npm test`).
- **Stack:** <language, runtime, primary frameworks>.
- **Critical-path deps:** <list — used by maintenance sub-loop's escalation policy>.
- **Audit command:** `<your project's vulnerability audit>` (e.g. `npm audit`).
- **Acceptance runner:** <e.g. quickpickle, behave, godog>.
- **Property runner:** <e.g. fast-check, hypothesis, proptest> — required wherever this project's domain has invariants (see `docs/quality-assurance.md`).

### Recommended `.claude/settings.json` permissions

To avoid permission prompts on every loop invocation, add to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test)",
      "Bash(npm run test:*)",
      "Bash(npm run build)",
      "Bash(npm run lint)",
      "Bash(npm audit)",
      "Bash(git status)",
      "Bash(git status:*)",
      "Bash(git diff)",
      "Bash(git diff:*)",
      "Bash(git log)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git branch)",
      "Bash(git branch:*)",
      "Bash(git fetch)",
      "Bash(git fetch:*)"
    ]
  }
}
```

Replace `npm` with your project's package manager / build tool.

### Project-specific rules

<!--
Below this line, document anything the loop's defaults don't cover for this project:
domain invariants, money precision, security additions, story tracker, etc.
-->
<!-- end product-dev-agent:snippet -->
