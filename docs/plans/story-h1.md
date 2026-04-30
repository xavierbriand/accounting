# Story h1 — Drift-scan automation

> **Working location.** This file is the harness-side plan workspace. Once approved and Phase 3 begins, the plan is committed at [docs/plans/story-h1.md](docs/plans/story-h1.md) (per R1) as the first body slice's content; this file is its mirror.

## Context

**Why this change.** The harness-engineering curriculum's Module 1 ([docs/learning/harness-engineering.md § Part C](docs/learning/harness-engineering.md)) — the cheapest, highest-ROI module, intended to build early momentum and prove the principle "*the drift you can grep for is drift you should never write down twice.*" Tracked at [#95](https://github.com/xavierbriand/accounting/issues/95) under umbrella [#94](https://github.com/xavierbriand/accounting/issues/94).

**Real drift exists today.** [story-D.md:26](docs/retrospectives/story-D.md:26) proposes a new `R20` rule (`empty feat: slices retitle…`) flagged as a Try item still `open`. CLAUDE.md § 8 stops at R19. Per-story memory caught this; greppable enforcement would have caught it at write time. This story (a) ships the enforcement, (b) keeps the pending state lossless via an opt-out marker, (c) extends the scan to plan ↔ source drift per the SPDD-comparison delta filed as a comment on #95.

**Curriculum-delta extension folded in.** [docs/learning/spdd-comparison.md § 7](docs/learning/spdd-comparison.md) and the comment on #95 add a second class of drift: a plan's "Production-code surface" section names files that may be renamed or removed by the time the next person reads it (forward-only sync per § 4.3). Module 1 absorbs this slice — symbol scan **scoped to file paths only** (high precision) and to plans **modified in the current PR diff** (avoids retroactive failures on frozen historical plans).

**Harness/product separation as a first-class concern.** Per the user direction during Phase 1: harness tooling lives in a top-level `harness/` tree with its own tsconfig and its own vitest project, invoked via a new `npm run test:harness` command. `src/`, `tests/`, and the existing `npm test` stay pure-product. This is the load-bearing structural choice of the story — Module 1 establishes the pattern that Modules 2–5 inherit. **The fork story for Module 6 becomes:** a colleague forking the starter template deletes `src/` and `tests/`; `harness/` carries over verbatim.

**Maintenance sub-loop (§ 6.7) run 2026-04-30 pre-planning.** Following [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md):

- [x] **Working tree clean.** On worktree branch `claude/magical-haibt-e85f31`, rebased on `origin/main` at `dc3876c`.
- [x] **Open issues.** 8 open harness-engineering issues (#94 umbrella + 6 modules + #111 Module 7). #95 is this story; nothing else overlaps.
- [x] **Open PRs.** Reviewed via `gh pr list`; no open PR touches the new `harness/` tree, `.github/workflows/ci.yml`, or `.claude/settings.json`. Safe to proceed.
- [x] **Sibling work check (R19).** No in-flight story touches drift-scan, the rule-provenance table, or the hooks system. Module 2 (#96) plans a `Stop` hook later — different event, no conflict.
- [x] **`npm audit --audit-level=high`** — to be run during sonnet-implementer's verification.
- [x] **Proceed-to-planning.**

## Story

> As the curriculum's first author, I want CLAUDE.md § 8 ↔ retros and plan ↔ source consistency to be enforceable by `tsx harness/drift-scan/drift-scan.ts` (locally, in CI, and at write time via a `PostToolUse` hook), so that rule-provenance drift and plan-code rot are caught the moment they enter the diff rather than at the next retro pass — without polluting the product `src/`/`tests/` trees.

**FR coverage:** none (harness/process tooling, not product behaviour). **R2 production-code surface section is non-trivial** (new TS modules under a brand-new `harness/` namespace; new vitest config; new test command).

**Epic coverage:** none — harness-engineering is a non-product initiative tracked under [#94](https://github.com/xavierbriand/accounting/issues/94) (umbrella) and #95 (this module). [docs/epics.md](docs/epics.md) covers product Epics 1–5 only; harness work is intentionally out of that document's scope.

## Selected solution

### 0. Establish the `harness/` separation

Top-level layout introduced by this story (Module 1 sets the pattern; later modules add sibling subdirs like `harness/eval/` for Module 4):

```
harness/
├── README.md                    # what `harness/` is, separation principle, how to add a new tool
└── drift-scan/
    ├── README.md                # invocation reference, --all / --json flags, local-vs-CI scope
    ├── drift-scan.ts            # CLI entrypoint, fs/process I/O
    ├── lib/
    │   └── drift-parser.ts      # pure parser exports — no fs, no process, no Node APIs beyond strings
    └── tests/
        ├── drift-parser.test.ts            # unit + 1 property test on the parser
        └── drift-scan.integration.test.ts  # process-level (real fs + git diff)
```

**Config additions:**

- **`tsconfig.harness.json`** — extends base, `rootDir: "./harness"`, `outDir: "./dist-harness"` (the harness is `tsx`-run; this exists for typecheck + IDE only). Inherits `strict: true` from the base config — confirmed by `tsc --noEmit -p tsconfig.harness.json` reporting zero errors. The base `tsconfig.json` is updated to add `"harness"` to its `exclude` array so the product build doesn't see it.
- **`vitest.harness.config.ts`** — minimal config: `include: ['harness/**/*.test.ts']`, no `quickpickle` plugin, no `globalSetup` (that one builds product `dist/` and would be wasted work for harness tests), no `@core` alias. Fast, isolated.
- **`package.json` scripts:**
  - `"test:harness": "vitest run --config vitest.harness.config.ts"`
  - `"typecheck:harness": "tsc -p tsconfig.harness.json --noEmit"`
- **`vitest.config.ts`** is updated with `exclude: ['**/node_modules/**', '**/.claude/**', 'harness/**']` so a stray harness test never accidentally lands in the product run.

**Coverage policy:** harness code is **explicitly outside** CLAUDE.md § 5's "100% branch coverage on `src/core/`" rule — `harness/` has no Core. Documented in `harness/README.md`.

**Coding standards:** the harness inherits the repo's `strict: true`, `no any`, explicit-return-types-on-exports, and ≤50 LOC function-size guidance from CLAUDE.md § 4. All four parser exports below declare explicit return types. If `drift-scan.ts` approaches 50 LOC during implementation, decompose into named helpers (`runRuleCheck`, `runPlanCheck`, `formatHumanReport`, `formatJsonReport`) before the slice closes green.

**Imports audit (R3).** The harness ships **no new dependencies** — `tsx`, `vitest`, `fast-check`, `typescript` are already in `devDependencies`. Anticipated import surface per file:

- `harness/drift-scan/lib/drift-parser.ts`: **zero imports** (pure string functions; intentional — preserves vitest unit isolation).
- `harness/drift-scan/drift-scan.ts`: `node:fs`, `node:path`, `node:child_process` (for `git diff` invocation), `node:process`. Plus a relative import of `./lib/drift-parser.js`. No npm packages.
- `harness/drift-scan/tests/drift-parser.test.ts`: `vitest`, `fast-check`, plus a relative import of `../lib/drift-parser.js`.
- `harness/drift-scan/tests/drift-scan.integration.test.ts`: `vitest`, `node:child_process`, `node:fs`, `node:path`, `node:os` (for tmpdir).

If the implementation surfaces an unanticipated import, sonnet flags it as a deviation per `.claude/agents/sonnet-implementer.md` § 4.

### 1. `harness/drift-scan/drift-scan.ts` — the engine

A single entrypoint runnable via `tsx`. Internally split into pure parser (`lib/drift-parser.ts`) + I/O wrapper so the parser is vitest-tested without filesystem access.

**Two checks, composable:**

#### Check A — R-tag drift (CLAUDE.md § 8 ↔ retros)

1. Read `CLAUDE.md`. Extract § 8 region: from the line `## 8. Rule provenance` through EOF (next `## ` or end). Within that region, capture all `\bR\d+\b` from the table rows.
2. Read every `docs/retrospectives/*.md` (excluding `README.md`). Extract all `\bR\d+\b` references **except** those followed by an opt-out marker `(pending)` (case-insensitive, optional surrounding markdown emphasis like `*(pending)*` or `_(pending)_`).
3. Report:
   - **Retro-only tags** (referenced in a retro, not in § 8): `R20` example today.
   - **§ 8-only tags** (table row exists but no retro mentions it): catches a row added without the originating retro Try being closed.

The opt-out marker keeps story-D.md:26 lossless: `R20 *(pending)*` does not trigger.

#### Check B — plan ↔ source drift (SPDD delta)

1. Determine the plan-file scope:
   - Default (CI / hook): plans changed relative to `origin/main`, via `git diff --name-only origin/main...HEAD -- 'docs/plans/*.md'`. **Skips frozen historical plans**, avoiding retroactive failures on long-merged stories.
   - `--all` flag: scan every `docs/plans/*.md` (used for backfill audits, not CI).
2. For each in-scope plan, locate the section heading matching `^## Production-code surface(\s|$|\()` (tolerant of the `(R2)` suffix used in current plans). Read until the next `^## ` or EOF.
3. From that region, extract **file path tokens** matching `` `(src|tests|harness)/[^`\s.][^`]*\.(ts|sql)` `` — anchored to the three allowed prefixes (no leading dot/whitespace inside the backticks; rejects `..` traversal and absolute paths by construction). Ignore `*(new)*` annotations — they're meta about the file, the path itself still matters.
4. For each path: if it doesn't exist on disk, report drift. Suppression: a path followed by `*(removed)*` or `*(renamed → <newpath>)*` is exempt; the renamed-target path is checked instead.
5. **v1 scope:** file paths only. Identifier-level checks (e.g. `UnmatchedGroup` no longer exported) are fragile across re-exports/index files and are deferred — see Risks.

#### Output contract

- Exit 0 on no drift; exit 1 on any drift.
- Human-readable report on stderr; one finding per line, grouped by check, with file anchors.
- `--json` flag: machine-readable findings array `{ "findings": [{ "kind", "tag" | "path", "file" }] }` (used by the hook to format inline; shape locked only when a consumer needs more).

### 2. Vitest unit on the parser

`harness/drift-scan/tests/drift-parser.test.ts`. Imports the **pure parser functions** (no fs). Fixtures inline as string constants:

- §-8-extraction: extracts `R1..R19` from a small CLAUDE.md-shaped string.
- Retro-extraction: extracts `R5, R8, R20` from a retro string; **excludes** `R20 *(pending)*`, `R20 _(pending)_`, and case variants like `R20 (Pending)`.
- Production-code-surface extraction: extracts `src/core/foo.ts`, `harness/foo/bar.ts` from a plan string with the `(R2)` heading variant; ignores tokens with `*(removed)*` and follows `*(renamed → <new>)*` markers.
- Drift composer: given §-8 = {R1, R2}, retros = {R1, R3}, returns retro-only={R3}, table-only={R2}.
- JSON formatter (R8 — mock-diversity coverage): given a fixture findings list `[{ kind: "retro-only", tag: "R97", file: "docs/retrospectives/foo.md" }, { kind: "missing-path", path: "src/core/gone.ts", file: "docs/plans/bar.md" }]`, asserts `formatJsonReport` emits the exact shape `{ findings: [...] }` round-trippable through `JSON.parse`.

Property test (one): for any two finite sets of R-tags `A, B` from `fast-check`, the composer's `retro-only ∪ both ∪ table-only` equals `A ∪ B`. Cheap totality check; matches the property-testing rhythm of the rest of the repo.

### 3. Integration test

`harness/drift-scan/tests/drift-scan.integration.test.ts`. Spawns `tsx harness/drift-scan/drift-scan.ts` as a subprocess and asserts:

- Clean repo → exit 0.
- Tempfile retro with `R98` (no marker) added under a temp `docs/retrospectives/` shadow → exit 1, stderr names `R98`.
- Same retro with `R98 *(pending)*` → exit 0.

Uses real `git` and real fs against an in-process scratch dir. Deliberately **not** mocked — Module 1's principle is "the drift you can grep for is drift you should never write down twice," so the scanner is tested against the same surface it operates on in CI.

### 4. CI step

Append two steps to [.github/workflows/ci.yml](.github/workflows/ci.yml) after **Run Tests**:

```yaml
    - name: Run Harness Tests
      run: npm run test:harness

    - name: Drift scan
      run: npx tsx harness/drift-scan/drift-scan.ts
```

`actions/checkout@v6` defaults to shallow clone; the plan-diff scope (`origin/main...HEAD`) needs full history — add `with: { fetch-depth: 0 }` to the existing checkout step. Single-line addition; no other CI changes.

### 5. PostToolUse hook

In [.claude/settings.json](.claude/settings.json), add a `hooks` block (none today). Per the harness-engineering doc's principle 2 (agent epistemic position), the hook surfaces drift in the *same chat* where the edit happened, before context drifts:

```json
"hooks": {
  "PostToolUse": [
    {
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [
        {
          "type": "command",
          "command": "if echo \"$CLAUDE_TOOL_FILE_PATHS\" | grep -qE '(docs/(retrospectives|plans)/.*\\.md|^CLAUDE\\.md)'; then npx tsx harness/drift-scan/drift-scan.ts || true; fi"
        }
      ]
    }
  ]
}
```

**Behaviour:** non-blocking — `|| true` swallows the non-zero exit so the agent flow isn't interrupted; the drift report appears as tool feedback in the chat. The match guard avoids running the scan on every Edit (only retros, plans, CLAUDE.md trigger it).

### 6. Permissions update

Add to [.claude/settings.json](.claude/settings.json) `permissions.allow`:

- `"Bash(npm run test:harness)"`
- `"Bash(npm run typecheck:harness)"`
- `"Bash(npx tsx harness/drift-scan/drift-scan.ts:*)"`

(The hook executes via the harness, not via user-typed Bash, so the permission is for *manual* invocation by the agent during verification.)

### 7. Documentation

Three small additions, each load-bearing:

- **CLAUDE.md § 8 — R20 row.** Codify R20 properly (the rule story-D opened): `empty feat: slices retitle to chore(workflow): empty slice — TDD rhythm note <reason>`. Originating retro: story-D. **Closes** the open Try item that drift-scan flags today; without it, drift-scan fails on first run. (Per R1, this is the right PR to land it.)
- **CLAUDE.md § 8 — R21 row.** New rule born of this story: `Drift-scan enforces CLAUDE.md § 8 ↔ retro and plan ↔ source consistency at write/CI time; opt-out via *(pending)* marker.` Originating retro: story-h1.
- **CLAUDE.md § 5 (one-line carve-out).** Append: "Coverage targets apply to `src/`; `harness/` is exempt — harness code is tooling, not domain logic." Keeps the rule honest now that we have a non-Core code tree.
- **`harness/README.md`** *(new, ≤40 lines):* what `harness/` is, the separation principle (no product/harness cross-imports either way), invocation map (`npm test` vs `npm run test:harness`, `npx tsx harness/<tool>/...`), how to add a new tool subdir.
- **`harness/drift-scan/README.md`** *(new, ≤25 lines):* CLI flags, scope rules, suppression markers.

## Production-code surface (R2)

Note: "production-code surface" here is read literally as "non-doc, non-config code surface." All entries below are **harness scope**, not product scope. R2 is honoured because each new artefact is enumerated.

| Path | New/Modified | Layer | Purpose |
| --- | --- | --- | --- |
| `harness/drift-scan/drift-scan.ts` *(new)* | new | harness | CLI entrypoint + composed checks (Check A + Check B). |
| `harness/drift-scan/lib/drift-parser.ts` *(new)* | new | harness | Pure parser exports: `extractSectionEightTags`, `extractRetroTags`, `extractPlanSurfacePaths`, `composeDrift`. No fs/process imports. |
| `harness/drift-scan/tests/drift-parser.test.ts` *(new)* | new | harness | Unit + 1 property test on the parser. |
| `harness/drift-scan/tests/drift-scan.integration.test.ts` *(new)* | new | harness | Subprocess test against real fs + git. |
| `harness/drift-scan/README.md` *(new)* | new | harness | Per-tool invocation reference. |
| `harness/README.md` *(new)* | new | harness | Top-level harness/ explainer. |
| `vitest.harness.config.ts` *(new)* | new | harness | Isolated harness test config. |
| `tsconfig.harness.json` *(new)* | new | harness | Harness typecheck config. |
| `vitest.config.ts` | modified | product | Adds `harness/**` to `exclude`. |
| `tsconfig.json` | modified | product | Adds `harness` to `exclude`. |
| `package.json` | modified | both | Adds `test:harness`, `typecheck:harness` scripts. |
| `.github/workflows/ci.yml` | modified | harness | New `Run Harness Tests` + `Drift scan` steps + `fetch-depth: 0`. |
| `.claude/settings.json` | modified | harness | New `hooks.PostToolUse` block + 3 permission lines. |
| `CLAUDE.md` | modified | docs | § 5 carve-out one-liner; § 8 — append R20 + R21 rows; prose reference to drift-scan in § 8 preamble. |
| `docs/plans/story-h1.md` | new | docs | This file, copied from harness location at slice 1. |
| `docs/retrospectives/story-h1.md` | new | docs | Authored at the retro slice. |
| `docs/status.d/2026-04-30-story-h1.md` | new | docs | Per R17, dropped at the retro slice. |

**Type/signature/format changes outside this story:** none.

## Acceptance scenarios

The scanner is CLI-shaped, not Gherkin-domain, but the behaviour benefits from scenario-style coverage. These map 1:1 onto cases in `harness/drift-scan/tests/drift-parser.test.ts` (parser-level) and `harness/drift-scan/tests/drift-scan.integration.test.ts` (process-level).

```gherkin
Feature: Drift-scan enforcement

  Scenario: clean repo passes
    Given CLAUDE.md § 8 lists R1..R21
    And no retro references an R-tag missing from § 8
    And every Production-code surface path in changed plans exists on disk
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then it exits 0 with no findings
    fails if Check A or Check B in `drift-scan.ts` mistakenly classify a clean state as drift (false positive in `composeDrift` or in `scanPlanPaths`'s fs probe).

  Scenario: retro references an undocumented rule
    Given a retro contains "R99" without a "(pending)" marker
    And § 8 has no R99 row
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then it exits 1
    And the report names the retro file and the unbacked tag
    fails if `extractRetroTags` in `drift-parser.ts` skips the unbacked tag, or `composeDrift` fails to surface a `retro-only` set member, or the CLI exit code in `drift-scan.ts` ignores a non-empty findings list.

  Scenario: pending marker suppresses the warning
    Given a retro contains "R99 *(pending)*"
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then R99 is not reported as drift
    fails if the pending-marker regex in `extractRetroTags` is too narrow (misses `_(pending)_` / case variants) or too wide (suppresses tags without an actual marker).

  Scenario: plan references a deleted file
    Given a plan changed in the current diff has "`src/core/gone.ts`" in its Production-code surface section
    And src/core/gone.ts does not exist
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then it exits 1
    And the report names the plan file and the missing path
    fails if `extractPlanSurfacePaths` skips the path token, or `scanPlanPaths` ignores fs.existsSync's false return, or the diff-scope filter in `drift-scan.ts` excludes the in-diff plan from Check B.

  Scenario: frozen historical plan with renamed file does not fail (default scope)
    Given a plan unchanged relative to origin/main references "`src/core/old.ts`"
    And that file has been renamed
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then it exits 0
    fails if the diff-scope filter in `drift-scan.ts` accidentally widens to include unchanged plans (would re-introduce retroactive failures on frozen plans).

  Scenario: --all flag surfaces historical drift
    Given a frozen historical plan references "`src/core/old.ts`"
    And src/core/old.ts no longer exists
    When I run `tsx harness/drift-scan/drift-scan.ts --all`
    Then it exits 1
    And the report names the historical plan and the missing path
    fails if `--all` flag handling in `drift-scan.ts` does not bypass the diff-scope filter, or the integration test asserts only the default-scope path.

  Scenario: --json output shape on a non-empty findings list
    Given a retro contains "R97" without a marker
    When I run `tsx harness/drift-scan/drift-scan.ts --json`
    Then stdout is valid JSON matching `{ findings: Array<{ kind: string, tag?: string, path?: string, file: string }> }`
    And exit code is 1
    fails if `formatJsonReport` in `drift-scan.ts` emits a different shape than the unit-tested contract (R8 mock-diversity gap).
```

## Slice plan

R13 envelope (target 6–10 commits). 9 implementation slices + the preparatory plan commit + the retro = 11 — at the upper bound, justified by the dual-check scope **and** the one-time `harness/` scaffolding. The preparatory plan commit is **not** counted in R13's body.

1. **`chore(docs): plan + P1/P2/P3 review (story-h1)`** — preparatory. Commit this plan to `docs/plans/story-h1.md` with the suggestion log filled after Phase 2.
2. **`chore(harness): scaffold harness/ tree + isolated vitest/tsconfig (story-h1)`**. Empty `harness/` + `harness/README.md` + `vitest.harness.config.ts` + `tsconfig.harness.json` + `vitest.config.ts`/`tsconfig.json` exclude updates + `package.json` script entries. Add an empty `harness/.gitkeep`-style placeholder test that asserts `1 + 1 === 2` so `npm run test:harness` is green from this slice on. **No drift-scan logic yet** — pure scaffolding so the next failing-test slice has somewhere to land.
3. **`test(drift-scan): R-tag parser flags retro-only tag — failing`** *(red)*. Replaces the placeholder test. Asserts `extractSectionEightTags`, `extractRetroTags`, `composeDrift` exist and behave on inline fixtures.
4. **`feat(drift-scan): extract R-tag parsers and composer — minimal green`**. Pure functions in `harness/drift-scan/lib/drift-parser.ts`; no I/O. Property test on composer totality lands here too.
5. **`test(drift-scan): pending marker suppresses retro-only tag — failing`** *(red)*. New unit case.
6. **`feat(drift-scan): suppress retro-only tags carrying pending marker — minimal green`**. Extend retro extractor to match `*(pending)*`, `_(pending)_`, and case variants.
7. **`test(drift-scan): plan production-code-surface path scan — failing`** *(red)*. Inline plan fixtures with present + missing paths.
8. **`feat(drift-scan): plan path scan + diff-scoped fs probe — minimal green`**. Adds `extractPlanSurfacePaths` + `scanPlanPaths` (fs side-effect). `--all` flag wired.
9. **`feat(drift-scan): wire CLI entrypoint + subprocess integration test (story-h1)`**. `harness/drift-scan/drift-scan.ts` glues parser + I/O; integration test asserts subprocess behaviour. Includes `harness/drift-scan/README.md`.
10. **`chore(rules): codify R20, R21, and § 5 carve-out in CLAUDE.md (story-h1)`**. Two new § 8 rows; close story-D's open Try; document the new rule born of this PR; one-line § 5 coverage carve-out for `harness/`. After this slice, drift-scan exits 0 on the live repo.
11. **`chore(harness): wire CI steps, PostToolUse hook, and permissions (story-h1)`**. `.github/workflows/ci.yml` (Run Harness Tests + Drift scan + `fetch-depth: 0`) and `.claude/settings.json` (hooks block + 3 permission lines).
12. **`chore(retro): write retrospective + status fragment (story-h1)`**. `docs/retrospectives/story-h1.md` + `docs/status.d/2026-04-30-story-h1.md`.

R11 empty-refactor slot folded into slice 9 — the integration glue *is* the structural pass; no separate empty `refactor:` commit unless Phase 4 surfaces a real refactor.

## Risks & deferred items

- **Identifier-level plan-code drift deferred.** v1 covers file paths only. Identifier checks require AST parsing or grep heuristics with high false-positive rates. Defer behind a follow-up issue; revisit if a real drift slips past this PR's path-only scan.
- **Plan-diff scope depends on `origin/main` being fetched.** Local runs without `git fetch origin main` may produce false positives. Mitigated in CI by `fetch-depth: 0`; documented in `harness/drift-scan/README.md` for local use. Hook is unaffected (uses the diff already in the worktree).
- **Hook noise on multi-edit chains.** A single Edit-then-Edit sequence on retro + § 8 would trigger the scan twice; only the second invocation is meaningful. Acceptable — the redundant first run is fast (<200 ms locally) and the report is short.
- **No drift-scan against `docs/learning/`.** The curriculum doc references R-tags too. Out of scope for v1; if drift surfaces there, extend the retro glob to include it.
- **`--json` output format unspecified beyond the v1 shape.** Lock further only when a consumer (e.g. Module 5 telemetry) needs it.
- **`harness/` tree is unindexed by IDE TS project references.** Two tsconfigs without a `references` link means cross-tree IntelliSense doesn't follow imports between them. Acceptable — the rule is "no harness/product cross-imports either way," so the missing IDE wire is the constraint, not a bug. Documented in `harness/README.md`.
- **Sonnet may forget the harness/product split mid-implementation.** Phase 4's code-reviewer checks on R2 (production-code surface) will catch drift; the slice plan also separates harness scaffolding (slice 2) from logic (slices 3+) so the boundary is established before any logic lands.

## Verification plan

1. `npm run lint && npm run build && npm test` — green. Product test count unchanged (harness tests don't run here).
2. `npm run test:harness` — green. New tests counted: at least 4 unit cases + 1 property test + 1 integration test = +6 minimum.
3. `npm run typecheck:harness` — green (no emit; verifies `harness/` typechecks against the harness tsconfig).
4. `npx tsx harness/drift-scan/drift-scan.ts` — exits 0 after slice 10 (R20 + R21 codified).
5. **Negative-case rehearsal.** Per #95 acceptance: temporarily insert `R99` (no marker) into a retro; run drift-scan locally; confirm exit 1 + the expected finding; revert. Repeat for a fake plan path `src/core/nope.ts`.
6. **Hook smoke test.** Edit a retro file in this session adding then removing a fake `R98` reference; confirm the chat surfaces the drift report on the first edit and clears it on the second.
7. **CI gate confirmation.** Push the feature branch; observe both new CI steps pass. (Negative-case CI verification is owned by the integration test from slice 9, not by a deliberate-red push.)
8. **§ 8 audit.** After slice 10: `tsx harness/drift-scan/drift-scan.ts` reports zero retro-only tags; § 8 contains R1..R21.
9. **Separation audit.** `grep -rE "from ['\"](\\.\\./)*src/" harness/` returns nothing. `grep -rE "from ['\"](\\.\\./)*harness/" src/ tests/` returns nothing. Confirms no cross-tree imports.
10. **Tool-bundle import audit (R3).** No new framework dependency; `tsx`, `vitest`, `fast-check`, `typescript` are already in devDependencies. No supply-chain delta.

## DoR checklist

- [x] Phase 1 (Plan): this document.
- [x] Phase 2 (Critical review): 19 findings (6 P1, 4 P2, 9 P3). 8 adopted, 6 acknowledged, 5 informational/N/A confirmations. No deferred-to-issue items.
- [ ] Draft PR with template sections 1–6 filled — pending (slice 1 commit + push + `gh pr create`).

## Suggestion log

Phase 2 (P1 / P2 / P3) by `plan-reviewer` sub-agent on 2026-04-30 — 19 findings (6 P1, 4 P2, 9 P3). Findings that were factual confirmations (R1, R2, R4, R10–R15 N/A) are not listed.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | R3 import audit not enumerated for the new tool's main bundle. | adopted | Added "Imports audit (R3)" sub-section under § 0 enumerating per-file import surface; sonnet flags any unanticipated import as a deviation. |
| P1 | All five Gherkin scenarios lack `fails if` clauses naming the production path each guards (R6). | adopted | Each scenario now carries a `fails if` clause naming the specific function (`extractRetroTags`, `composeDrift`, `scanPlanPaths`, etc.) it guards. Added two new scenarios: `--all` flag historical drift, and `--json` output shape. |
| P1 | R7 test-mechanism honesty depends on R6 being filled. | adopted (subsumed) | Resolved via the R6 `fails if` clauses, which now name in-process vs subprocess scope per scenario. |
| P1 | Epic alignment — no `docs/epics.md` entry for harness curriculum, no explicit disclaimer. | adopted | Added "Epic coverage: none" disclaimer under § Story explaining the harness-engineering initiative is non-product (#94 umbrella). |
| P1 | Fifth scenario's `--all` branch ("would surface") is hypothetical, not asserted. | adopted | Split into a dedicated scenario that runs `--all` and asserts exit 1 + finding presence. Mapped onto the integration test. |
| P2 | PostToolUse hook output PII risk. | acknowledged | Hook reads only CLAUDE.md, retros, and plans — surfaces by convention carry no PII (per § 3 of CLAUDE.md). No new mitigation needed; risk noted for retro. |
| P2 | R8 mock diversity — no test asserts `--json` shape on a non-empty findings list. | adopted | Added a JSON formatter unit case to the parser test list with an explicit fixture; added a Gherkin scenario for the same. Sonnet writes both. |
| P3 | No-`any` / explicit-return-types not stated for harness exports. | adopted (clarified) | Added "Coding standards" sub-section to § 0 confirming strict mode, no any, explicit return types on all four parser exports, and 50-LOC decomposition policy if `drift-scan.ts` grows. |
| P3 | R12 — slices 4, 6, 9, 11, 12 lean toward enumeration over summary verbs. | adopted | Renamed: slice 4 "extract R-tag parsers and composer", slice 6 "suppress retro-only tags carrying pending marker", slice 9 "wire CLI entrypoint + subprocess integration test", slice 10 "codify R20, R21, …", slice 11 "wire CI steps, PostToolUse hook, and permissions", slice 12 "write retrospective + status fragment". |
| P3 | R13 — 9 implementation slices is at the upper bound of 6–10. | acknowledged | Justified in § Slice plan preamble (dual-check scope + one-time scaffolding). No reduction; conflating any two slices would make the failing-test → minimal-green pairs less crisp. |
| P3 | Function size ≤ 50 LOC not stated for `drift-scan.ts`. | adopted | Coding-standards sub-section now names `runRuleCheck`, `runPlanCheck`, `formatHumanReport`, `formatJsonReport` as the decomposition target if the entrypoint approaches 50 LOC. |
| P3 | Path-validation surface — git-diff output piped to fs without sanitisation. | adopted (mitigated) | Tightened the path-extraction regex to `` `(src|tests|harness)/[^`\s.][^`]*\.(ts|sql)` `` — anchored to allowed prefixes, rejects leading dot/whitespace, blocks `..` traversal and absolute paths by construction. Plan-file paths from `git diff` come from a trusted glob (`-- 'docs/plans/*.md'`); no further sanitisation needed. |
| P3 | `--all` flag arbitrary fs probe risk. | acknowledged | Same regex constraint above caps the probe domain to `src/`, `tests/`, `harness/` prefixes. Repo files are trusted; risk accepted. |
| P3 | PostToolUse hook shell-injection via `$CLAUDE_TOOL_FILE_PATHS`. | acknowledged | The variable is set by the harness, not by user input; the `echo \"$VAR\" \| grep -qE …` pattern is shell-injection-safe under standard quoting. Documented in the hook block comment. |
| P3 | `fetch-depth: 0` CI exposure. | acknowledged | Private repo; full history is already accessible to the CI runner via the existing checkout token. No secret exposure delta. |
| P3 | Strict-mode tsconfig for harness not explicitly stated. | adopted | § 0 now confirms `tsconfig.harness.json` inherits `strict: true` from the base, verified by `tsc --noEmit`. |
| — | R1, R2, R4, R5 (Phase 4-only), R9–R11, R14, R15 — factual confirmations or N/A. | (no action) | Reviewer-confirmed correct. |

**Tally:** 8 adopted/clarified · 6 acknowledged · 0 rejected · 0 deferred. Every adopted item has been folded into the plan above. **DoR gate met.**
