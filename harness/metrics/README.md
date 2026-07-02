# harness/metrics

Harness Module 5 tooling: per-story weight-ratio baseline (Tool 1, shipped)
and a usage/token reader (Tool 2, shipped against the spike-selected source
below). Same isolation pattern as `harness/drift-scan/`: no imports to/from
`src/` or `tests/`; covered by `vitest.harness.config.ts`; coverage-exempt
per CLAUDE.md § 5.

## Invocation

| Command | What it runs |
| --- | --- |
| `npm run metrics:loop` | Tool 1 — writes `docs/metrics/loop.csv`, reports top-3 weight-ratio offenders + skips on stderr |
| `npm run metrics:usage -- <path>` | Tool 2 — aggregates per-model token totals from a session JSONL file |
| `npm run metrics:story -- <id>` | Tool 2 — attributes usage to a story by cwd + commit-window overlap; writes `docs/metrics/story-<id>.md` |

## Telemetry-source spike (decision record)

Time-boxed, one slice (C3), per the plan's decision gate.

**1. Preferred — Claude Code OpenTelemetry export.** Not verifiable in this
environment: no standalone `claude` CLI binary is on `PATH` (this machine
runs the Claude Desktop app's bundled Claude Code, invoked as a subprocess,
not the installable CLI that documents `CLAUDE_CODE_ENABLE_TELEMETRY` /
`OTEL_METRICS_EXPORTER`). No OTEL-related files or settings were found under
the app's support directory. **Gap acknowledged** — OTEL wiring is
documented as pending CLI support; the reader below is not coupled to it.

**2. Fallback — local session JSONL, corrected finding.** The planning-session
ground truth ("no token-usage fields") holds for one record type in the
file but not for all of them. Each session file
(`~/.claude/projects/-Users-xavier-Projects-accounting/<session-id>.jsonl`)
interleaves multiple record `type`s. Verified against this repo's own 4
session files (2026-07-02), **schema keys and record counts only** — no
`content` field values are reproduced here, per the PII rule (CLAUDE.md § 3):

| Session (first 8 chars) | Record types present | `assistant` records | records with `message.usage` |
| --- | --- | --- | --- |
| `3ac72984` | `queue-operation`, `user`, `attachment`, `ai-title`, `assistant`, `last-prompt`, `system`, `mode` | 37 | 37 |
| `5530a51e` | `queue-operation`, `user`, `attachment`, `custom-title`, `ai-title`, `assistant`, `last-prompt`, `system`, `mode` | 16 | 16 |
| `55ff06a5` | `queue-operation`, `user`, `attachment`, `ai-title`, `assistant`, `last-prompt`, `system`, `pr-link` | 438 | 438 |
| `c944641f` | `queue-operation`, `user`, `attachment`, `custom-title`, `ai-title`, `assistant`, `last-prompt`, `system`, `pr-link` | 114 | 114 |

- `queue-operation` records carry exactly `content, operation, sessionId,
  timestamp, type` — this is the file-operations-journal shape the planning
  session found, and it genuinely carries no usage fields. The plan's
  ground-truth finding is correct **for this record type**.
- `assistant`-type records are a different shape: top-level `cwd`,
  `sessionId`, `timestamp`, `version`, plus a nested `message` object with
  `model` and `usage: { input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens, cache_creation,
  server_tool_use, service_tier, inference_geo, iterations, speed }`. Every
  `assistant` record in all 4 sessions carries a `usage` object — 605 of 605.

**Decision:** ship Tool 2 against the `assistant`-record shape (fallback
tier 2), not the OTEL export (tier 1, undiscoverable here) and not the
`queue-operation` shape (no usage fields, confirmed). The reader is
zod-validated against the four counters + `model` + `cwd` + `timestamp` +
`sessionId` fields documented above; anything else on the record is ignored,
and a record missing `usage` or `model` is counted as a skipped/unrecognized
record rather than crashing or fabricating a zero.

**3. If neither exists:** not triggered — tier 2 supplied a usable source.

### Raw vs. committed

The session JSONL files themselves live under `~/.claude/projects/`, outside
this repository entirely — there is nothing repo-local to gitignore for this
source. `metrics:usage` and `metrics:story` read them directly and commit
only the aggregates they compute (`docs/metrics/story-<id>.md`); no raw
record, and in particular no `content` field, is ever written to a committed
file.

### Price map

`harness/metrics/prices.json` carries a checked-in `asOf` date, cited
alongside any computed cost figure so the reader knows how current the
rates are. `applyPrices` degrades to token-only (`cost: null`) when a
session's model has no matching entry in the price map — it does not
compare `asOf` against the session date; there is no automated staleness
check. Tokens are always the primary, authoritative unit regardless of
whether a cost figure is available.

## Boundary hygiene

- `<path>` arguments are realpath-normalized; a symlink at the resolved path
  is refused (local re-implementation of `src/infra/db/db-path-validator.ts`'s
  `validateDbPath` intent — no cross-tree import).
- Unrecognized argv tokens are rejected with usage text.
- `prices.json` and each telemetry record are zod-validated at read;
  malformed input is a reported skip, never a crash.
- Error convention follows the `harness/drift-scan/` tier: plain
  throws/`process.exit` are acceptable here. The `Result<T, E>` mandate is
  scoped to `src/core/` and does not apply to harness tooling.

## Coverage policy

Same as `harness/drift-scan/`: tooling, not domain logic. Exercised via
focused unit tests on the pure lib plus one subprocess smoke test per
npm script, not a branch-coverage gate.
