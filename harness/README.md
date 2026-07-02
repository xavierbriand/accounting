# harness/

Harness tooling for the harness-engineering curriculum (issue #94). Lives here, not in `src/` or `tests/`.

## Separation principle

**No cross-tree imports.** `harness/` must not import from `src/` or `tests/`; `src/` and `tests/` must not import from `harness/`. This is enforced by:

- A separate `tsconfig.harness.json` (`rootDir: ./harness`, `outDir: ./dist-harness`).
- A separate `vitest.harness.config.ts` with `include: ['harness/**/*.test.ts']`.
- CI step `Run Harness Tests` runs `npm run test:harness` (isolated from `npm test`).
- Separation audit grep in `docs/plans/story-h1.md § Verification`.

## Invocation map

| Command | What it runs |
|---|---|
| `npm test` | Product tests only (`tests/`) |
| `npm run test:harness` | Harness tests only (`harness/**/*.test.ts`) |
| `npm run typecheck:harness` | Type-check harness tree (`tsconfig.harness.json --noEmit`) |
| `npx tsx harness/drift-scan/drift-scan.ts` | Run drift-scan against the live repo |
| `npx tsx harness/drift-scan/drift-scan.ts --all` | Scan all plans, not just diff-scoped ones |
| `npx tsx harness/drift-scan/drift-scan.ts --json` | Machine-readable findings on stdout |
| `npm run dod:check` / `npx tsx harness/dod-check/dod-check.ts` | Commit-subject, TODO/TBD, Gherkin↔step DoD checks (see `harness/dod-check/README.md`) |

## Shared helpers (`harness/lib/`)

Cross-tool pure logic that multiple `harness/<tool>/` consumers need lives in `harness/lib/`, not
duplicated per tool (rule-of-three: a third consumer of the same logic extracts a shared helper —
story-h6). Current helpers:

- `harness/lib/story-id-matcher.ts` — canonical story-id-in-commit-subject matcher, exported as both
  a JS `RegExp` (`buildStoryIdRegExp`, for in-process matching) and an ERE string
  (`buildStoryIdGitGrepPattern`, for `git log --extended-regexp --grep`). Consumed by
  `harness/metrics/lib/loop-metrics.ts`, `harness/metrics/usage-reader.ts`, and
  `harness/dod-check/lib/commit-subject.ts`.

## Coverage policy

The `src/core/` 100% branch-coverage rule (CLAUDE.md § 5) applies to `src/` only. `harness/` is tooling, not domain logic — coverage is exercised via focused unit tests and one integration test per tool, not via a branch-coverage gate.

## Adding a new tool

1. Create `harness/<tool-name>/` with its own `README.md` describing invocation.
2. Pure logic in `harness/<tool-name>/lib/<module>.ts` (zero fs/process imports — enables fast vitest unit tests).
3. I/O entrypoint at `harness/<tool-name>/<tool-name>.ts` (imports `node:fs`, `node:path`, etc.).
4. Tests in `harness/<tool-name>/tests/` — unit tests for the pure lib, one integration test for the entrypoint.
5. No new npm dependencies unless flagged as a deviation per `.claude/agents/sonnet-implementer.md § 4`.
