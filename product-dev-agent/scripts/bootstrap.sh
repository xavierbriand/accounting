#!/usr/bin/env bash
#
# product-dev-agent bootstrap
#
# Installs plugin templates into the consumer repo at GitHub-required paths
# and appends a reference snippet to CLAUDE.md. Idempotent.
#
# Usage:
#   bash bootstrap.sh "<consumer-repo-root>"
#   bash bootstrap.sh --check "<consumer-repo-root>"
#
# --check: report drift between consumer copies and plugin canon. Writes nothing.
#          Exits non-zero if anything is drifted or missing.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHECK_MODE=0
if [ "${1:-}" = "--check" ]; then
  CHECK_MODE=1
  shift
fi

REPO_ROOT="${1:-$(pwd)}"

if [ ! -d "${REPO_ROOT}/.git" ]; then
  echo "ERROR: ${REPO_ROOT} is not a git repository (no .git/ directory)." >&2
  echo "       Run from the consumer repo root, or pass it as the first arg." >&2
  exit 2
fi

# Source → destination mapping. Edit here when adding new templates.
declare -a MAPPINGS=(
  "templates/pull_request_template.md::.github/pull_request_template.md"
  "templates/deferred-suggestion-issue.md::.github/ISSUE_TEMPLATE/deferred-suggestion.md"
  "templates/retrospective-template.md::docs/retrospectives/_template.md"
)

SNIPPET_SRC="${PLUGIN_ROOT}/templates/claude-md-snippet.md"
SNIPPET_MARKER="<!-- product-dev-agent:snippet -->"
CLAUDE_MD="${REPO_ROOT}/CLAUDE.md"

drift_count=0
written_count=0
unchanged_count=0

report() {
  local file="$1"
  local status="$2"
  printf "  %-50s %s\n" "${file}" "${status}"
}

for mapping in "${MAPPINGS[@]}"; do
  src="${PLUGIN_ROOT}/${mapping%%::*}"
  rel_dst="${mapping##*::}"
  dst="${REPO_ROOT}/${rel_dst}"

  if [ ! -f "${src}" ]; then
    echo "ERROR: plugin template missing: ${src}" >&2
    exit 3
  fi

  if [ ! -f "${dst}" ]; then
    if [ "${CHECK_MODE}" -eq 1 ]; then
      report "${rel_dst}" "MISSING"
      drift_count=$((drift_count + 1))
    else
      mkdir -p "$(dirname "${dst}")"
      cp "${src}" "${dst}"
      report "${rel_dst}" "installed"
      written_count=$((written_count + 1))
    fi
    continue
  fi

  if cmp -s "${src}" "${dst}"; then
    report "${rel_dst}" "up-to-date"
    unchanged_count=$((unchanged_count + 1))
  else
    if [ "${CHECK_MODE}" -eq 1 ]; then
      report "${rel_dst}" "DRIFTED (consumer differs from plugin canon)"
      drift_count=$((drift_count + 1))
    else
      cp "${src}" "${dst}"
      report "${rel_dst}" "updated (overwritten)"
      written_count=$((written_count + 1))
    fi
  fi
done

# CLAUDE.md snippet
if [ ! -f "${CLAUDE_MD}" ]; then
  if [ "${CHECK_MODE}" -eq 1 ]; then
    report "CLAUDE.md (snippet)" "MISSING (no CLAUDE.md)"
    drift_count=$((drift_count + 1))
  else
    cp "${SNIPPET_SRC}" "${CLAUDE_MD}"
    report "CLAUDE.md (snippet)" "created from snippet"
    written_count=$((written_count + 1))
  fi
elif grep -qF "${SNIPPET_MARKER}" "${CLAUDE_MD}"; then
  report "CLAUDE.md (snippet)" "already present"
  unchanged_count=$((unchanged_count + 1))
else
  if [ "${CHECK_MODE}" -eq 1 ]; then
    report "CLAUDE.md (snippet)" "MISSING (no marker found)"
    drift_count=$((drift_count + 1))
  else
    {
      echo
      cat "${SNIPPET_SRC}"
    } >> "${CLAUDE_MD}"
    report "CLAUDE.md (snippet)" "appended"
    written_count=$((written_count + 1))
  fi
fi

echo

if [ "${CHECK_MODE}" -eq 1 ]; then
  echo "check: ${unchanged_count} up-to-date, ${drift_count} drifted/missing"
  if [ "${drift_count}" -gt 0 ]; then
    echo "Re-run without --check to overwrite consumer copies with plugin canon," >&2
    echo "or reconcile manually if the consumer has intentional local modifications." >&2
    exit 1
  fi
  exit 0
fi

echo "bootstrap: ${written_count} written, ${unchanged_count} unchanged"
echo
echo "Next steps:"
echo "  1. Review the appended CLAUDE.md snippet — fill in the loop-overlay placeholders."
echo "  2. Add the recommended permissions allow-list to .claude/settings.json (see snippet)."
echo "  3. Run /product-dev-agent:maintenance, then /product-dev-agent:plan-story <id>."
