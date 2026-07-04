# harness/

## What it is

The **Dev Harness** — the control system around the AI agents that develop this repo. It is a second
core domain alongside the product (Shared Finances), not build tooling: it has its own user-owned
ubiquitous language ([docs/harness/glossary.md](../docs/harness/glossary.md)) and its own classified
control inventory ([docs/harness/control-inventory.md](../docs/harness/control-inventory.md)). The
`harness/` folder you're reading about holds only that domain's **computational** tools — the
`.claude/agents/`, `.claude/commands/`, `CLAUDE.md`, and `docs/` canon are the rest of the Dev Harness,
living where Claude Code's discovery contract and the docs canon require, not physically inside this
folder. Story-ddd-2 declared the domain boundary; see the [context map](../docs/domain/context-map.md)
for the strategic view of how it relates to the product.

## What it does

Every control in the Dev Harness is either a **guide** (steers the agent *before* it acts) or a
**sensor** (observes *after* and reports what diverged) — some are **gates** (a sensor wired to
block). The tools in this folder are the computational sensors: they run in milliseconds, deterministically,
and catch what prose guides can't guarantee:

- **drift-scan** — Checks A (CLAUDE.md § 8 rule table ↔ retrospective files), B (plan ↔ source), D
  (`.claude/` spec ↔ § 8 rule tags), and F (agent-spec `role:` conformance + control-inventory
  completeness). See [drift-scan/README.md](drift-scan/README.md).
- **dod-check** — commit-subject/envelope, TODO/TBD, Gherkin↔step, and weight-ratio gates at the
  Definition-of-Done boundary. See [dod-check/README.md](dod-check/README.md).
- **PostToolUse/Stop hooks** (`.claude/settings.json`) — fire drift-scan and dod-check at write time,
  not just in CI.
- **CI** (`.github/workflows/ci.yml`) — the same checks, run again at the PR boundary.

Agents themselves carry a **role** — doer, judge, or advisor — declared in each
`.claude/agents/*.md` spec's `role:` frontmatter key and enforced by drift-scan Check F: only a doer
may hold file-mutation tools (`Write`, `Edit`, `NotebookEdit`, `MultiEdit`); judges and advisors
return findings or proposals for a human to act on, never mutate the repo directly. Full
classification of every control — which is a guide, which is a sensor, which pairs with which — is
in [docs/harness/control-inventory.md](../docs/harness/control-inventory.md).

## Why

Prose conventions don't reliably constrain agents — the 2026 harness-engineering literature this
domain's vocabulary draws from (see the [glossary](../docs/harness/glossary.md) preamble for
citations) converges on the same finding from several directions. A rule that only lives in CLAUDE.md
prose gets followed until it doesn't, silently. Verification — a computational check that runs the
same way every time — is the actual constraint that makes a rule stick, which is why every new rule
this domain adds tends to ship with a sensor in the same PR (the R21/R25 pattern) rather than as prose
alone.

## How

### Separation principle

**No cross-tree imports.** `harness/` must not import from `src/` or `tests/`; `src/` and `tests/` must not import from `harness/`. This is enforced by:

- A separate `tsconfig.harness.json` (`rootDir: ./harness`, `outDir: ./dist-harness`).
- A separate `vitest.harness.config.ts` with `include: ['harness/**/*.test.ts']`.
- CI step `Run Harness Tests` runs `npm run test:harness` (isolated from `npm test`).
- Separation audit grep in `docs/plans/story-h1.md § Verification`.

### Invocation map

| Command | What it runs |
|---|---|
| `npm test` | Product tests only (`tests/`) |
| `npm run test:harness` | Harness tests only (`harness/**/*.test.ts`) |
| `npm run typecheck:harness` | Type-check harness tree (`tsconfig.harness.json --noEmit`) |
| `npx tsx harness/drift-scan/drift-scan.ts` | Run drift-scan against the live repo |
| `npx tsx harness/drift-scan/drift-scan.ts --all` | Scan all plans, not just diff-scoped ones |
| `npx tsx harness/drift-scan/drift-scan.ts --json` | Machine-readable findings on stdout |
| `npm run dod:check` / `npx tsx harness/dod-check/dod-check.ts` | Commit-subject, TODO/TBD, Gherkin↔step DoD checks (see `harness/dod-check/README.md`) |

### Shared helpers (`harness/lib/`)

Cross-tool pure logic that multiple `harness/<tool>/` consumers need lives in `harness/lib/`, not
duplicated per tool (rule-of-three: a third consumer of the same logic extracts a shared helper —
story-h6). Current helpers:

- `harness/lib/story-id-matcher.ts` — canonical story-id-in-commit-subject matcher, exported as both
  a JS `RegExp` (`buildStoryIdRegExp`, for in-process matching) and an ERE string
  (`buildStoryIdGitGrepPattern`, for `git log --extended-regexp --grep`). Consumed by
  `harness/metrics/lib/loop-metrics.ts`, `harness/metrics/usage-reader.ts`, and
  `harness/dod-check/lib/commit-subject.ts`.
- `harness/lib/agent-spec.ts` — zero-dep flat frontmatter parser for `.claude/agents/*.md` specs
  (`parseAgentSpecFrontmatter`), tolerant of absent optional keys and unknown forward-compat keys.
  Consumed by drift-scan Check F; intended as the single reader for future agent-spec frontmatter
  keys (`model:` conformance, `spec-version`) rather than a second hand-rolled parser per consumer.
- `harness/lib/temp-git-repo.ts` — hermetic temp-git-repo fixture builder (`initTempRepo`,
  `writeAndCommit`, `cleanupTempDirs`) for subprocess integration tests that need a real git history
  without writing into the live repo tree. Hoisted here (story-ddd-2) from
  `harness/metrics/tests/_helpers/` once a second tool (drift-scan) needed the same pattern.

### Coverage policy

The `src/core/` 100% branch-coverage rule (CLAUDE.md § 5) applies to `src/` only. `harness/` is exempt because the Dev Harness is its own bounded context (CLAUDE.md § 2), not because it's an afterthought — coverage is exercised via focused unit tests and one integration test per tool, not via a branch-coverage gate.

### Adding a new tool

1. Create `harness/<tool-name>/` with its own `README.md` describing invocation.
2. Pure logic in `harness/<tool-name>/lib/<module>.ts` (zero fs/process imports — enables fast vitest unit tests).
3. I/O entrypoint at `harness/<tool-name>/<tool-name>.ts` (imports `node:fs`, `node:path`, etc.).
4. Tests in `harness/<tool-name>/tests/` — unit tests for the pure lib, one integration test for the entrypoint.
5. No new npm dependencies unless flagged as a deviation per `.claude/agents/sonnet-implementer.md § 4`.
6. If the tool is itself a control (a sensor, a gate), add a row to
   [docs/harness/control-inventory.md](../docs/harness/control-inventory.md) — the inventory is the
   enforced registry for `.claude/` file controls and the documentation of record for everything else.
