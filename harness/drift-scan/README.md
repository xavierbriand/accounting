# harness/drift-scan

Enforces two consistency invariants:

**Check A — R-tag drift:** CLAUDE.md § 8 rule table ↔ retrospective files. A tag referenced in a retro but absent from § 8 is reported as `retro-only` drift; a § 8 row with no retro mention is reported as `table-only` drift.

**Check B — plan ↔ source drift:** file paths listed in a plan's "Production-code surface" section are probed against the live filesystem. Missing paths are reported as `missing-path` drift.

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

- `0` — no drift found.
- `1` — one or more drift findings.

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

## Scope rules

By default the scan targets:
- **Check A:** all retro files in `docs/retrospectives/*.md` (excluding `README.md`).
- **Check B:** only plans listed in `git diff --name-only origin/main...HEAD -- 'docs/plans/*.md'`.

Use `--all` to include every `docs/plans/*.md` in Check B (useful for backfill audits; not for CI).

## Local pre-requisite

Check B's default scope uses `git diff --name-only origin/main...HEAD`. Without `git fetch origin main` the local `origin/main` ref may be stale; run `git fetch origin` before using the default scope locally.
