# product-dev-agent

A Claude Code plugin that ships an opinionated product-development loop: **a planning model designs the work, an implementation model executes it via outside-in BDD + unit TDD, with a 3-pass critical review on both the plan and the code, and a Keep/Change/Try retrospective that folds learnings back into the rules.**

The loop was extracted from a working accounting project after six end-to-end stories. It's the loop, not the accounting.

## What you get

- **One agent** — `sonnet-implementer`: outside-in BDD + unit TDD, returns a structured report, never opens or merges PRs.
- **Seven skills** drive the phases:
  - `/product-dev-agent:maintenance` — triage issues, review Dependabot, audit. Run before every new story.
  - `/product-dev-agent:plan-story <id>` — Phase 1: intent → 3 alternatives → acceptance scenarios → draft PR + plan file.
  - `/product-dev-agent:review-plan` — Phase 2: P1/P2/P3 critical review on the plan. DoR gate.
  - `/product-dev-agent:implement` — Phase 3: hand off to `sonnet-implementer`.
  - `/product-dev-agent:review-impl` — Phase 4: P1/P2/P3 retro-check against the actual diff. Refactor plan.
  - `/product-dev-agent:retro <id>` — Phase 5: Keep/Change/Try retrospective. New rules land in same PR.
  - `/product-dev-agent:bootstrap` — installs templates + the CLAUDE.md snippet. `--check` reports drift.
- **Five docs** — the loop's authoritative reference (`docs/workflow.md`, `engineering-standards.md`, `security-checklist.md`, `quality-assurance-skeleton.md`, `retrospective-format.md`).
- **Four templates** — PR template (10 sections), deferred-suggestion issue, retrospective skeleton, CLAUDE.md snippet.

## Install

```bash
# Add as a marketplace
/plugin marketplace add xavierbriand/product-dev-agent

# Install
/plugin install product-dev-agent@xavierbriand-product-dev-agent
```

For local development of the plugin itself:

```bash
/plugin marketplace add /path/to/local/product-dev-agent
```

## First-time setup in a consuming repo

```text
/product-dev-agent:bootstrap
```

The bootstrap:
- Copies `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/deferred-suggestion.md` (GitHub reads these from your repo, not the plugin).
- Drops a retrospective skeleton at `docs/retrospectives/_template.md`.
- Appends a reference snippet to your `CLAUDE.md` (gated by a marker — re-running is a no-op).
- Prints the recommended `.claude/settings.json` permissions allow-list.

After bootstrap, fill in the **Loop overlay** section of your `CLAUDE.md`: green-suite command, stack, critical-path deps, audit command, acceptance/property runners. The plugin defaults to Node/npm idioms but works for any language as long as your overlay names the right commands and runners.

## Then run the loop

```text
/product-dev-agent:maintenance
/product-dev-agent:plan-story 1.1
/product-dev-agent:review-plan
/product-dev-agent:implement
/product-dev-agent:review-impl
/product-dev-agent:retro 1.1
```

Repeat per story.

## Skill namespacing

Claude Code namespaces all plugin skills as `/<plugin-name>:<skill>`. There is no shorter form — typing just `/plan-story` won't find the skill. The full `/product-dev-agent:plan-story` is required.

## Drift detection

When the plugin updates a template (e.g. adding a section to the PR template), consumer repos won't auto-update — GitHub reads the template from the consumer's `.github/`, which is a copy. Run:

```text
/product-dev-agent:bootstrap --check
```

…to see which consumer-side files have drifted. Re-run `/bootstrap` (without `--check`) to overwrite with plugin canon.

## Layout

```
product-dev-agent/
├── .claude-plugin/plugin.json
├── agents/sonnet-implementer.md
├── skills/<phase>/SKILL.md           # 7 phases
├── docs/                             # workflow, engineering, security, QA, retro format
├── templates/                        # PR, issue, retro, CLAUDE.md snippet
├── hooks/hooks.json                  # SessionStart bootstrap-missing nudge
├── scripts/                          # bootstrap.sh, session-start-reminder.sh
└── README.md
```

## Philosophy

Three things make the loop work:

1. **Two models, two roles.** Planning ≠ implementation. The planning model is allowed to think slowly; the implementation model is allowed to type fast. Mixing them produces neither.
2. **Reviews on the plan AND the code.** Pre-implementation review catches scope drift and architectural mistakes cheaply. Post-implementation review catches what the test suite missed (this happens — the loop has caught real correctness bugs in 100%-passing test suites).
3. **Retrospectives codify rules, not vibes.** Every "Try" experiment either graduates to a rule edit in the same PR or sunsets. The retro file is history; the rule lives where future-you will read it.

## License

MIT
