---
description: Install product-dev-agent's templates and CLAUDE.md snippet into a consuming project. One-shot per project. Supports --check to detect drift between consumer copies and plugin canon. Use when a user installs the plugin in a new repo or runs "/bootstrap".
---

# /product-dev-agent:bootstrap

You are running the **one-shot bootstrap** for product-dev-agent in a new consumer project. Use `${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.sh` as the executor.

`$ARGUMENTS` may contain `--check` to run drift detection without writing.

## What bootstrap does

Copies plugin canon into the consumer's repo at GitHub-required paths and appends a reference snippet to the consumer's CLAUDE.md. Idempotent: re-running on an already-bootstrapped repo is a no-op.

### Files installed

| Source (in plugin) | Destination (in consumer) |
| --- | --- |
| `${CLAUDE_PLUGIN_ROOT}/templates/pull_request_template.md` | `.github/pull_request_template.md` |
| `${CLAUDE_PLUGIN_ROOT}/templates/deferred-suggestion-issue.md` | `.github/ISSUE_TEMPLATE/deferred-suggestion.md` |
| `${CLAUDE_PLUGIN_ROOT}/templates/retrospective-template.md` | `docs/retrospectives/_template.md` |
| `${CLAUDE_PLUGIN_ROOT}/templates/claude-md-snippet.md` (appended) | `CLAUDE.md` (appended once) |

GitHub reads PR and issue templates from the consumer's `.github/` directory — that's why the plugin can't host them itself; it can only ship canon and copy on demand.

## Default workflow

1. Run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.sh "<consumer-repo-root>"`.
2. The script:
   - Creates `.github/` and `.github/ISSUE_TEMPLATE/` if missing.
   - Copies each template to its destination, with a checksum header marking it as plugin-sourced.
   - Appends the CLAUDE.md snippet **only if** the marker `<!-- product-dev-agent:snippet -->` is not already present.
   - Reports each file it touched.
3. Tell the user:
   - What was installed / what was already up to date.
   - The recommended `permissions` allow-list to add to `.claude/settings.json` (printed by the script — don't try to edit settings.json yourself, that's a user decision).
   - The next command to run: `/product-dev-agent:maintenance` then `/product-dev-agent:plan-story <id>`.

## --check mode

Run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.sh --check "<consumer-repo-root>"`.

The script:
- Diffs each consumer-side template against the plugin's canon.
- Reports per-file: `up-to-date`, `drifted (consumer modified)`, `outdated (plugin newer)`, or `missing`.
- Exits non-zero if anything is drifted or missing.
- Writes nothing.

If drift is reported, ask the user how to resolve:
- Re-run `/bootstrap` to overwrite with plugin canon.
- Manually reconcile if the consumer has intentional local modifications.

## Guardrails

- **Idempotent only via the marker.** The CLAUDE.md snippet is appended once and gated by `<!-- product-dev-agent:snippet -->`. Removing the marker manually will cause a duplicate append on next run.
- **Don't edit consumer's `.claude/settings.json`.** Plugins shouldn't write to a consumer's permissions file. Print the recommended allow-list and let the user decide.
- **Don't overwrite without `--check` first** if templates already exist. The script defaults to overwrite, but you should run `--check` first when bootstrapping a repo that may have customised templates.
- **Run from the consumer repo root.** The script expects to find a `.git/` directory there as a sanity check.
