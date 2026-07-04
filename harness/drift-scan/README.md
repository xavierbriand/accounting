# harness/drift-scan

Enforces three consistency invariants:

**Check A — R-tag drift:** CLAUDE.md § 8 rule table ↔ retrospective files. A tag referenced in a retro but absent from § 8 is reported as `retro-only` drift; a § 8 row with no retro mention is reported as `table-only` drift.

**Check B — plan ↔ source drift:** file paths listed in a plan's "Production-code surface" section are probed against the live filesystem. Missing paths are reported as `missing-path` drift.

**Check D — `.claude/` rule-tag drift:** `.claude/agents/*.md` + `.claude/commands/*.md` ↔ CLAUDE.md § 8. Two finding kinds:
- `claude-range` — an enumerated rule-range pattern (`R1..R15`, `R2–R9`, and other dash/ellipsis-separated variants). Always flagged — this is the frozen-range antipattern the rule system moved away from; there is no legitimate use.
- `claude-stale-tag` — a bare `R<n>` reference whose tag is not a live § 8 row, unless immediately followed by a `*(hole)*` marker.

(There is no "Check C" here — that label is reserved by a sibling glossary-conformance check tracked separately.)

## Invocation

```sh
# Default (CI / PostToolUse hook): only plans changed relative to origin/main
npx tsx harness/drift-scan/drift-scan.ts

# Backfill audit: scan every plan file
npx tsx harness/drift-scan/drift-scan.ts --all

# Machine-readable output (for hook formatting or scripting)
npx tsx harness/drift-scan/drift-scan.ts --json
```

## Exit codes

- `0` — no findings.
- `1` — one or more findings (any kind: `retro-only`, `table-only`, `missing-path`, `claude-range`, `claude-stale-tag`).

## Output

Human-readable findings go to **stderr**, one per line, grouped by check. The `--json` flag sends a JSON object to **stdout** in place of the stderr report.

```json
{ "findings": [{ "kind": "retro-only", "tag": "R20", "file": "docs/retrospectives/story-D.md" }] }
```

## Suppression markers

To silence a finding while an item is still open (pending retro action):

- R-tag in retro: append `*(pending)*` or `_(pending)_` (case-insensitive) after the tag reference.  
  Example: `R20 *(pending)*` — suppressed until the corresponding § 8 row is added.

- File path in plan surface section: append `*(removed)*` to exempt a deleted file, or `*(renamed → <newpath>)*` to redirect the probe to the new path.

- R-tag in a `.claude/` spec (Check D): append `*(hole)*` or `_(hole)_` (case-insensitive) after the tag reference to exempt a deliberate reference to a non-§8 tag (e.g. a documented numbering hole).  
  Example: `§ 8 skips R22 *(hole)* (no tombstone row)` — suppressed until the hole is resolved (e.g. a future tombstone row makes the tag live again, and the marker becomes redundant).

## Scope rules

By default the scan targets:
- **Check A:** all retro files in `docs/retrospectives/*.md` (excluding `README.md`).
- **Check B:** only plans listed in `git diff --name-only origin/main...HEAD -- 'docs/plans/*.md'`.
- **Check D:** all spec files in `.claude/agents/*.md` and `.claude/commands/*.md` — always the full corpus, like Check A, never diff-scoped.

Use `--all` to include every `docs/plans/*.md` in Check B (useful for backfill audits; not for CI). `--all` has no effect on Check D, which always scans the full `.claude/` corpus.

## Local pre-requisite

Check B's default scope uses `git diff --name-only origin/main...HEAD`. Without `git fetch origin main` the local `origin/main` ref may be stale; run `git fetch origin` before using the default scope locally.
