#!/usr/bin/env bash
#
# product-dev-agent SessionStart reminder
#
# Non-blocking. Prints a one-line nudge if the consumer repo is missing
# the plugin's bootstrapped templates. Stays quiet otherwise.
#
# Stdout from a hook is shown to the user; we keep it minimal.

set -eu

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only nudge if we're inside a git repo. Avoids noise in scratch dirs.
if [ ! -d "${REPO_ROOT}/.git" ]; then
  exit 0
fi

# Quick tri-state check.
missing=0
[ ! -f "${REPO_ROOT}/.github/pull_request_template.md" ] && missing=$((missing + 1))
[ ! -f "${REPO_ROOT}/.github/ISSUE_TEMPLATE/deferred-suggestion.md" ] && missing=$((missing + 1))

if [ -f "${REPO_ROOT}/CLAUDE.md" ]; then
  if ! grep -qF "<!-- product-dev-agent:snippet -->" "${REPO_ROOT}/CLAUDE.md"; then
    missing=$((missing + 1))
  fi
else
  missing=$((missing + 1))
fi

if [ "${missing}" -gt 0 ]; then
  echo "[product-dev-agent] ${missing} bootstrap artifact(s) missing or unreferenced. Run /product-dev-agent:bootstrap to install."
fi
