# Story maint-10 — Epic-2 BDD backfill + dist-compile subprocess harness

## Context

First story of the **Refactor epic** (Epic M-A) per [docs/plans/as-an-senior-engineer-cozy-pelican.md](https://github.com/xavierbriand/accounting/blob/main/.claude/plans/as-an-senior-engineer-cozy-pelican.md). Two related deliverables:

1. **Backfill Gherkin acceptance scenarios for Stories 2.1–2.5** — the Sunday Morning Audit workflow (CSV → build → review → commit → snapshot). Today, [tests/features/](tests/features/) contains exactly one file ([split-rules.feature](tests/features/split-rules.feature)) — added by Story 3.1 for Core acceptance. Stories 2.1–2.5's user-observable workflow has zero Gherkin scenarios. Story 2.5 retro action C (codified in CLAUDE.md § 6.1 phase 4 as the "Gherkin-to-test mapping audit") has nothing to audit until this story lands.

2. **Dist-compile subprocess test harness.** The two existing subprocess tests ([uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts), [ingest-end-to-end-wiring.test.ts](tests/integration/cli/ingest-end-to-end-wiring.test.ts)) spawn `tsx src/cli/program.ts`. With this story adding 5–7 more subprocess scenarios, aggregate runtime would balloon from ~4s to ~14–18s on every CI run and local `npm test`. Compiling once and spawning `node dist/cli/program.js` collapses subsequent spawns to ~0.3s each. Closes [#46](https://github.com/xavierbriand/accounting/issues/46) (`@core/*` aliases not rewritten by `tsc`) as a side effect.

**Why now (sequencing).** Per the refactor backlog plan: maint-10 lands first within Epic M-A so the new BDD tests use the dist-compile pattern from day one and the next story (maint-11) can rewrite the existing two subprocess tests onto the same surface alongside its `--db-path-override` rename. Doing the harness in maint-11 instead would force the BDD tests to be written twice.

**Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning:**
- `git status` clean (post-#64 merge), main rebased to `e4a0c16`.
- Open issues: 11 — one bug ([#65](https://github.com/xavierbriand/accounting/issues/65), `dbPath` silently ignored, scoped to maint-11 not here), 10 deferred-suggestions; priorities unchanged.
- Dependabot: no open PRs.
- `npm audit`: zero vulnerabilities.
- PR [#36](https://github.com/xavierbriand/accounting/pull/36) closed (user direction).
- **Proceed-to-planning.**

## Story

> As a developer maintaining this CLI, I want acceptance scenarios for the Stories 2.1–2.5 workflows AND a fast subprocess test harness so that (a) end-to-end behaviour is documented and tested at the user-observable surface, (b) Gherkin scenarios from Story 3.2 onwards can plug into a working harness, and (c) integration-tier runtime stays under the 10s aggregate threshold flagged by maint-09.

Closes Story 2.5 retro action C (operationally — by giving the audit something to walk against) and [#46](https://github.com/xavierbriand/accounting/issues/46) (dist runnable). Touches [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config consolidation) and [#58](https://github.com/xavierbriand/accounting/issues/58) (setupFiles glob) as adjacent cleanups; resolution depends on the chosen index-file approach (see § "Selected solution").

Walks [docs/engineering-standards.md](docs/engineering-standards.md) § Testing tiers, [docs/quality-assurance.md](docs/quality-assurance.md) (acceptance harness for the Sunday Morning Audit), CLAUDE.md § 5 + § 6.1 phase 1 (composition-root subprocess test rule, story-maint-09).

## Selected solution

### Dist-compile harness — `tsc-alias` + vitest globalSetup

Three options considered:

- **Option A (chosen): `tsc-alias` postbuild step + vitest `globalSetup`.** Adds `tsc-alias` (~14 KB devDep) which rewrites `@core/*` imports in compiled output to relative paths post-`tsc`. Vitest globalSetup runs `npm run build` once at suite-start; subprocess tests spawn `node dist/cli/program.js`. First spawn pays ~3s build cost (already happens in CI lint+build phase, so it's near-free there); subsequent spawns are ~0.3s.
- **Option B: `tsconfig-paths/register` at runtime.** `node -r tsconfig-paths/register dist/cli/program.js`. No postbuild step, but every spawn pays a small register cost. Slower runtime than (A); also drags `tsconfig-paths` (deprecated, replaced by `tsx`) into runtime.
- **Option C: refactor away from `@core/*` aliases.** Drop the alias entirely; use relative imports throughout `src/`. Cleanest long-term but is a 30+ file refactor unrelated to BDD work — wrong story.

**(A) chosen.** Smallest dep impact, fastest steady-state, closes #46 with a single targeted tool that exists for exactly this purpose.

### Acceptance scenarios — three feature files, 6 scenarios total

Distributed by Story:

- **`tests/features/ingest.feature`** — 4 scenarios:
  - **2.1:** "BPCE CSV with valid encoding parses all rows" (parsing + timezone/account resolution).
  - **2.2:** "Re-ingest of the same CSV is idempotent" (FR8 round-trip).
  - **2.3:** "Auto-tagging routes high-confidence matches and isolates low-confidence rows" (classifier + low-confidence fork).
  - **2.4:** "`--json` output includes non-default duplicate and low-confidence sections" (mock-diversity per Story 2.4 retro action A).
- **`tests/features/commit.feature`** — 2 scenarios:
  - **2.5a:** "Atomic commit writes all rows or none, snapshot removed on success."
  - **2.5b:** "Mid-batch failure rolls back transactions, snapshot retained for recovery."

Six scenarios is the lower end of the 5–7 band from the meta-plan. Snapshot integrity covered by 2.5a/b together — a separate `snapshot.feature` would be thin.

Each scenario backed by a subprocess integration test that spawns `node dist/cli/program.js` and asserts on stderr/stdout/exit-code observable behaviour (consistent with the existing maint-09 wiring test). Quickpickle steps use a shared spawn-CLI helper (see "Test infrastructure" below).

**Mock-diversity (Story 2.4 retro action A enforcement).** Scenario 2.4's `--json` assertions read at least one duplicate, at least one low-confidence row, and at least one auto-tagged row from the JSON payload — none of these arrays are `[]`. The BPCE fixture already produces 3 low-confidence + 2 auto-tagged in the wiring test; for "at least one duplicate," the scenario runs ingest twice in the same DB.

### Test infrastructure

- **`tests/_setup/build-dist.ts`** — vitest `globalSetup`. Runs `npm run build` once before any test in the suite. Skips if the user passed `VITEST_SKIP_BUILD=1` (escape hatch for fast iteration on non-subprocess tests).
- **`tests/_helpers/spawn-cli.ts`** — exports `spawnCli(args: string[], opts?: SpawnOpts): { status, stdout, stderr }` and a constant `DIST_CLI` resolved relative to `__dirname`. Uses `execFileSync('node', [DIST_CLI, ...args])`. Captures both pipes. Throws are caught and returned as the result object; never propagates to the test (every test inspects status explicitly).
- **`tests/_helpers/inline-config.ts`** — exports `writeStubYaml(tmpDir: string, overrides?: Partial<Config>): void`. The current ingest-end-to-end-wiring.test.ts inlines this YAML; extracting saves duplication across 5+ new tests. Single-arg form uses sensible defaults (EUR, Europe/Paris, one bank account, two-partner 50/50 split, no buffers).
- **vitest.config.ts** — wire `globalSetup: ['tests/_setup/build-dist.ts']`. Replace the hardcoded `setupFiles: ['tests/features/steps/split-rules.steps.ts']` with `setupFiles: ['tests/features/steps/index.ts']`; index.ts imports each step file (closes [#58](https://github.com/xavierbriand/accounting/issues/58)).
- **vitest.config.js** — delete (closes [#42](https://github.com/xavierbriand/accounting/issues/42); the .ts is the canonical config, the .js is leftover).
- **package.json**:
  - Add `tsc-alias` to devDependencies.
  - Update `build` script: `tsc && tsc-alias && tsc -p tsconfig.test.json && tsc-alias -p tsconfig.test.json && cp -R src/infra/db/migrations dist/infra/db/`.

### Migrating the two existing subprocess tests

[uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts) and [ingest-end-to-end-wiring.test.ts](tests/integration/cli/ingest-end-to-end-wiring.test.ts) both currently spawn `tsx`. They migrate to `spawnCli()` in this story so the whole subprocess tier uses one shape. The migration is mechanical — the spawn target changes but the assertions don't — and proves the dist binary works for the legacy tests too.

### What this story does NOT do

- **Does not touch `--db-path` or fix [#65](https://github.com/xavierbriand/accounting/issues/65).** All new tests (and the migrated existing two) keep using `--db-path <tmp>/test.db`. maint-11 owns the `--db-path-override` rename + #65 fix + test rewrite to inline-YAML.
- **Does not contribute upstream to the plugin.** Epic M-B (maint-12a/b) handles plugin migration. Any rule that surfaces during this story's retro and is generic enough for the plugin gets queued for maint-12a's upstream PRs.
- **Does not add the plan-reviewer agent or status.md generator.** Those are maint-13.

## Gherkin acceptance scenarios

```gherkin
Feature: Ingest CLI builds and reviews transactions from bank CSVs

  Scenario: BPCE CSV with valid encoding parses all rows (Story 2.1)
    Given a fresh migrated DB at <tmp>/test.db
    And accounting.yaml at <tmp> with one BPCE bank account
    And a CSV at <tmp>/bpce-valid_real.csv copied from the BPCE fixture
    When I run `accounting ingest --file <csv> --non-interactive --json --db-path <tmp>/test.db` with cwd=<tmp>
    Then stderr contains "Found 5 new transactions"
    And stderr contains no "Build failed" lines
    And stderr contains no "ERR_MODULE_NOT_FOUND" or "Cannot find module" lines
    And the process exits with code 2 (3 low-confidence rows trigger needs-review)
    # fails if: BPCE parser regresses on the fixture's encoding/delimiter, or `dist/cli/program.js`
    # cannot resolve @core/* (would surface as ERR_MODULE_NOT_FOUND), or --non-interactive
    # routing semantics regress (exit 2 = "low-confidence rows present" is the codified contract).

  Scenario: Re-ingest of the same CSV is idempotent (Story 2.2, FR8)
    Given a fresh migrated DB at <tmp>/test.db
    And accounting.yaml at <tmp> with one BPCE bank account
    And a CSV at <tmp>/bpce-valid_real.csv copied from the BPCE fixture
    When I run ingest a first time with the CSV
    And I run ingest a second time with the same CSV
    Then the second run's stderr contains "Found 0 new transactions"
    And the second run's stderr contains "5 duplicate(s) skipped"
    And the DB still holds exactly 5 transactions
    # fails if: idempotency_hash dedup is bypassed (would re-insert), or the user-facing
    # "Found 0 new" / "5 duplicate(s)" messaging regresses on a no-op batch.

  Scenario: Auto-tagging routes high-confidence and isolates low-confidence (Story 2.3)
    Given a fresh migrated DB at <tmp>/test.db
    And accounting.yaml at <tmp> with one BPCE bank account
    And a CSV with two rows matching auto-tag rules and three rows with no rule match
    When I run ingest with `--non-interactive --json`
    Then the process exits with code 2 (low-confidence rows trigger needs-review)
    And the JSON payload's `summary.autoTagged` equals 2
    And the JSON payload's `summary.lowConfidence` equals 3
    # fails if: classifier mis-routes high-confidence as low-confidence (or vice versa),
    # or `--non-interactive` does not exit 2 on a non-zero low-confidence count.

  Scenario: --json output includes non-default duplicate and low-confidence sections (Story 2.4 mock-diversity)
    Given a previous ingest already committed the 5 BPCE rows
    And the same CSV is re-ingested
    When I run ingest with `--non-interactive --json`
    Then the JSON payload's `duplicates` array length equals 5
    And the JSON payload's `duplicates[0]` has both `description` and `idempotencyHash` fields populated
    And the JSON payload's `lowConfidence` array is empty (all rows are duplicates, none built)
    And the JSON payload contains no partner names verbatim (PII hygiene)
    And the process exits with code 0 (zero new fresh items → zero low-confidence → not 2)
    # fails if: `--json` output hardcodes `duplicates: []` or omits the array entirely.
    # Story 2.4 retro action A: this scenario is the codified mock-diversity check —
    # the assertion runs against a non-default fixture (5 duplicates, not 0).
    # The PII assertion is light-touch defence: the fixture uses fictional vendors so this
    # is mostly a regression guard against a future change that starts echoing partner names.

Feature: Ingest CLI atomically commits and snapshots

  Scenario: Atomic commit writes all rows, snapshot removed on success (Story 2.5a)
    Given a fresh migrated DB at <tmp>/test.db
    And accounting.yaml at <tmp> with one BPCE bank account
    And a CSV with 5 rows (BPCE fixture) all mapping to existing accounts
    When I run ingest interactively, accept all classifications, confirm the batch
    Then the process exits with code 0
    And the DB holds 5 transactions
    And no snapshot file exists at <tmp>/test.db.bak after success
    And stderr contains "transaction(s) committed"
    # fails if: snapshot lifecycle leaks (file retained after success), or partial commit
    # leaves <5 rows, or interactive prompter wiring breaks.

  Scenario: Mid-batch failure rolls back, snapshot retained (Story 2.5b)
    Given a fresh migrated DB seeded with one transaction whose idempotency_hash collides
    And accounting.yaml at <tmp> with one BPCE bank account
    And the BPCE CSV containing 5 rows including the one that collides
    When I run ingest interactively, accept all classifications, confirm the batch
    Then the process exits with code 4
    And the DB still holds exactly 1 transaction (no partial writes from the new batch)
    And a snapshot file exists at <tmp>/test.db.bak (retained for recovery)
    And stderr contains "Commit failed (batch rolled back)"
    And stderr contains "Snapshot retained at"
    And stderr does not contain any 64-char hex token (idempotency_hash redaction per security-checklist.md)
    # fails if: rollback is partial (some rows persisted), snapshot removed instead of retained,
    # or the raw SQL UNIQUE-violation error is leaked verbatim including the colliding hash.
```

## Slice plan for Sonnet

Target **7 commits + retrospective**. Within the 6–10 band.

1. **`chore(test): add tsc-alias + dist-compile globalSetup — failing setup (story-maint-10)`**
   - Add `tsc-alias` to devDependencies (run `npm install tsc-alias --save-dev`).
   - Update `package.json` `build` script to chain `tsc-alias` after each `tsc`.
   - Create `tests/_setup/build-dist.ts` that runs `npm run build` once.
   - Wire `globalSetup` in vitest.config.ts.
   - Delete vitest.config.js (closes [#42](https://github.com/xavierbriand/accounting/issues/42)).
   - **The "failing" framing here is intentional**: the existing two subprocess tests still spawn `tsx`, so they don't yet exercise the dist binary. After this commit, run `node dist/cli/program.js migrate --db-path /tmp/probe.db` manually as a smoke check — it must succeed (no `ERR_MODULE_NOT_FOUND`), proving #46 is closed. Sonnet captures this in the red→green log.

2. **`refactor(test): extract spawn-cli + inline-config helpers (story-maint-10)`**
   - Create `tests/_helpers/spawn-cli.ts` with `spawnCli(args, opts)` + `DIST_CLI` constant.
   - Create `tests/_helpers/inline-config.ts` with `writeStubYaml(tmpDir, overrides?)`.
   - Migrate [uninit-db-hint.test.ts](tests/integration/cli/uninit-db-hint.test.ts) and [ingest-end-to-end-wiring.test.ts](tests/integration/cli/ingest-end-to-end-wiring.test.ts) to use the helpers + `node dist/cli/program.js`. All assertions stay the same; only the spawn target and YAML-write call shape change.
   - All previously-green tests stay green, now exercising dist instead of tsx.

3. **`test(features): ingest.feature scenarios 2.1 + 2.2 + steps — failing (story-maint-10)`**
   - Create `tests/features/ingest.feature` with the four scenarios listed above (write all four now; the steps file will start with only 2.1 + 2.2 implemented and the others as skip-undefined for this slice).
   - Create `tests/features/steps/ingest.steps.ts` implementing 2.1 + 2.2.
   - Create `tests/features/steps/index.ts` re-exporting `split-rules.steps.ts` + `ingest.steps.ts`. Update vitest.config.ts `setupFiles` to point at `index.ts` (closes [#58](https://github.com/xavierbriand/accounting/issues/58)).
   - Sonnet's red→green log shows scenarios 2.1 + 2.2 failing because no integration test backs them yet.

4. **`feat(features): wire scenarios 2.1 + 2.2 to subprocess tests — minimal green (story-maint-10)`**
   - Inside ingest.steps.ts, the When/Then steps for 2.1 + 2.2 use `spawnCli()` from the helper. They write the inline YAML, copy the fixture, run migrate then ingest, assert on stderr/stdout/exit-code. Pattern follows the existing maint-09 wiring test.
   - 2.1 turns green (the wiring is what maint-09 already fixed; this is just the BDD layer).
   - 2.2 turns green (idempotency dedup already works since Story 2.2; we're just adding the BDD layer).

5. **`test(features): ingest.feature scenarios 2.3 + 2.4 + steps — failing (story-maint-10)`**
   - Add step implementations for 2.3 + 2.4 to ingest.steps.ts.
   - 2.3 needs a custom CSV fixture with rows that match auto-tag rules + rows that don't. Either reuse `bpce-valid.csv` (which has 2 auto-tagged + 3 low-confidence per maint-09's count) — actually that's exactly the 2/3 split the scenario needs. So no new fixture is required.
   - 2.4 reuses the same fixture but runs ingest twice (first commits, second produces duplicates).

6. **`feat(features): wire scenarios 2.3 + 2.4 — minimal green (story-maint-10)`**
   - Step implementations finish; 2.3 + 2.4 turn green.

7. **`test(features): commit.feature 2.5a + 2.5b + steps — failing AND green (story-maint-10)`**
   - Bundled red→green because both scenarios test pre-existing Story 2.5 behaviour; they have no new production code to drive. Per CLAUDE.md § 6.4 green-on-landing carve-out: TDD-by-intent invariant holds (these tests would have failed against pre-Story-2.5 code).
   - Create `tests/features/commit.feature` with 2.5a + 2.5b.
   - Create `tests/features/steps/commit.steps.ts`.
   - Add to `tests/features/steps/index.ts`.
   - Use spawnCli with interactive stdin scripted via `child_process.spawn` + writing `\n` to stdin to confirm. The interactive prompter uses Inquirer; scripting it via spawn is doable but more involved — alternative is to set an `INGEST_AUTO_CONFIRM=1` env var that bypasses the prompt for testing (avoid: that's a test-only backdoor). **Chosen approach:** use `child_process.spawn` async + write to stdin; helper extends spawn-cli.ts to support stdin scripting. Add `spawnCliInteractive` for this case.
   - 2.5b's "seed a colliding row" requires a small SQL setup before the ingest. Steps file does that with a direct `better-sqlite3` connect, INSERT, close — same DB path that the spawned ingest will use.
   - Both scenarios turn green; existing ingest-commit.test.ts coverage unchanged.

8. **`refactor: empty slot — no cleanup identified (story-maint-10)`** — per CLAUDE.md § 6.4. The dist-compile harness commits already establish their own structure; helpers are extracted. No further behaviour-preserving cleanup obvious. Body documents the no-op with a one-line "Helpers and config consolidation completed inside slices 1–2."

9. **`chore(retro): story-maint-10 retrospective`** — Keep / Change / Try.

**Why 7 main commits + 2 housekeeping (refactor empty-slot + retro):** four scenarios in ingest.feature need TDD-pair slicing (3+4 + 5+6); commit.feature's two scenarios collapse legitimately (slice 7) per the carve-out. The dist-compile harness is one chore + one refactor (1 + 2). Total 7 substantive + 2 housekeeping = 9, within the 6–10 band.

## Risks & deferred items

- **Build-once globalSetup blocks suite startup.** A clean `npm run build` takes ~3s on a recent laptop; CI is similar. Acceptable cost for the per-spawn savings. Watch trend; if the build itself slows past ~10s, revisit (Bun, esbuild, etc.). The `VITEST_SKIP_BUILD=1` env var lets local non-subprocess iteration skip the cost.

- **`tsc-alias` is a transitive dep with its own footprint.** ~14 KB unpacked, no runtime imports (build-time only). Read its package.json before adopting per CLAUDE.md § 6.1 phase 1 tool-bundle import audit. Sonnet does the audit in slice 1 and includes it in the commit body.

- **Interactive prompter testing is harder than non-interactive.** Slice 7's spawn-with-stdin pattern is new for this codebase. Risk: flakiness if the prompt's read-from-stdin timing isn't deterministic. Mitigation: the test writes `\n` after observing the prompt's question text on stderr (synchronization via output, not timing). Documented in `spawnCliInteractive` helper comments.

- **Mock-diversity scenario 2.4 asserts `lowConfidence` is empty.** Currently the BPCE fixture's repeat-ingest scenario yields all-duplicates (no low-confidence on second run). Verify this behaviour is what Story 2.4 intended. If it isn't (e.g., low-confidence detection should fire even on duplicates because it runs pre-dedup), the scenario's expected values need adjustment. Pre-implementation Sonnet should confirm by reading [src/cli/commands/ingest-command.ts](src/cli/commands/ingest-command.ts).

- **Subprocess tier runtime measurement.** After all slices land, run `npm test -- --reporter=verbose` and record the `tests/integration/cli/` aggregate. Target: under 5s. If higher, investigate (might be the build cost dominating; partition into a separate test command).

- **The `vitest.config.js` deletion may break the `npm run typecheck:tests` path** if anything references it. Quick check before deletion: `git grep "vitest.config.js"` should show only the file itself. If references exist outside the file, repoint them in slice 1.

- **`@core/*` aliases in Sonnet's working directory.** Sonnet uses the same path aliases via tsx/vitest. The dist-compile only matters for production-bundled execution. Sonnet's day-to-day workflow is unchanged.

- **Out of scope for this PR** (already documented in the meta-plan):
  - `--db-path-override` rename → maint-11.
  - [#65](https://github.com/xavierbriand/accounting/issues/65) (dbPath silently ignored) → maint-11.
  - `Result` combinators → maint-11.
  - Plugin migration → Epic M-B (maint-12a/b).

## Verification plan

End-to-end manual verification by the user before marking ready:

1. `git clean -fdx node_modules dist && npm install` — fresh install picks up `tsc-alias`.
2. `npm run lint && npm run build && npm test` — all green. The build now produces a runnable `dist/cli/program.js`.
3. `node dist/cli/program.js migrate --db-path /tmp/probe.db` — succeeds (no `ERR_MODULE_NOT_FOUND`). Manual smoke confirms #46 closed.
4. `npm test -- --reporter=verbose tests/integration/cli/` — reports each integration test's runtime. Aggregate under 5s; first build pays ~3s (one-time per run).
5. Review the new feature files visually — every scenario reads as user-observable behaviour, not as test plumbing.

CI gates: `npm run lint && npm run build && npm test` green. Subprocess tier runs as part of `vitest run` by default.

## Suggestion log

Phase 2 (P1 / P2 / P3) by Opus on 2026-04-26.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Scenario 2.1 asserts on stderr text but is silent on exit code, while scenario 2.3 explicitly checks exit 2. The 2.1 fixture also produces 3 low-confidence rows (per maint-09's wiring test) so the actual run exits 2 too. Drift risk if a future change makes 2.1 exit differently and the scenario doesn't catch it. | adopted | Added `And the process exits with code 2 (3 low-confidence rows trigger needs-review)` to scenario 2.1. Plan-level consistency: every subprocess scenario explicitly states the expected exit code. |
| P1 | Scenario 2.4 doesn't state the expected exit code. Re-ingest of all 5 rows produces 0 fresh, 0 low-confidence → exit 0 (verified against [src/cli/commands/ingest-command.ts:255](src/cli/commands/ingest-command.ts) which exits 2 only on non-zero low-confidence). Without the assertion, a regression that introduces an early-exit path would slip through. | adopted | Added `And the process exits with code 0 (zero new fresh items → zero low-confidence → not 2)`. |
| P1 | Slice 7 mentions "spawn-with-stdin" for interactive scenarios 2.5a/b but doesn't pin the synchronization mechanism. Inquirer renders prompts to stderr (verified: [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js)). Risk of flakiness if test writes to stdin before the prompt is ready. | adopted (codified in plan) | Confirmed: synchronization via stderr-watching, not timing. The `spawnCliInteractive` helper waits for the prompt text on stderr (e.g., `Commit these N transactions?`) before writing `\n` to stdin. Helper docstring explicitly notes this. Sonnet validates the helper against a unit test that asserts the wait-for-prompt logic before using it in 2.5a. |
| P1 | Sonnet should verify non-interactive commit semantics against [src/cli/commands/ingest-command.ts](src/cli/commands/ingest-command.ts) before slicing — confirms 2.5a/b need interactive mode (commit only happens on the interactive path; --non-interactive prints + exits without writing). | adopted (already verified in Phase 2) | Verified: line 134's `if (opts.nonInteractive \|\| opts.json) → runNonInteractive` path never commits. Commits only happen at line 150 inside the interactive flow. Slice 7 must use `spawnCliInteractive`; --non-interactive can't substitute. Plan updated to make this explicit. |
| P2 | The `--json` payload assertions in scenario 2.4 don't check for partner-name PII leak. The fixture uses fictional vendors but a future change to the JSON shape (e.g., echoing config back) could regress. Light-touch defensive assertion is cheap. | adopted | Added `And the JSON payload contains no partner names verbatim (PII hygiene)` to scenario 2.4. Mirrors the existing pattern from [tests/unit/infra/config/config-schema.test.ts:67](tests/unit/infra/config/config-schema.test.ts) that asserts `not.toContain('Alex')`. |
| P2 | Should scenarios assert on transaction amounts (cents)? The BPCE fixture has known amounts; would regress against any precision bug. | rejected | BDD layer operates at user-observable behaviour (transaction count, summary lines, exit codes). Money-precision invariants are covered by unit + property tests in `tests/unit/core/shared/money.test.ts`. Adding amount assertions to BDD inflates the layer with redundant coverage. |
| P3 | The plan describes "each scenario backed by a subprocess integration test" but is ambiguous about whether each scenario gets a separate `.test.ts` or whether the steps file IS the test (per quickpickle). | adopted | Clarified: quickpickle expands each scenario into a vitest test at runtime; the `.steps.ts` files are the test code. There is no separate `.test.ts` per scenario. Plan's "Critical files" and slice descriptions updated to reflect this; the existing 2 subprocess `.test.ts` files (uninit, wiring) stay as-is — they're regression tests, not BDD. |
| P3 | `tsc-alias` is a new devDep. Story 3.1 retro action B (tool-bundle import audit) requires Plan-agent stress-test on new tools. | adopted (pre-authorized in plan) | Slice 1 description requires Sonnet to perform the audit during install: list every `import` at the top of `tsc-alias`'s main bundle and cross-reference against its `package.json` dependencies. Any undeclared transitive import gets pre-authorised. Reading `tsc-alias` package layout: pure dev-time tool, no runtime imports, ~14 KB. Audit expected to surface no surprises but the codified step prevents Story 3.1's `pixelmatch` round-trip. |
| P3 | The 2.5b scenario seeds a colliding row directly via better-sqlite3 (side-channel into the test DB). Could be a `seedTransaction` helper. | rejected | Single test site; premature abstraction. Revisit if a third subprocess test needs the same seed pattern. |
| P3 | Issue [#43](https://github.com/xavierbriand/accounting/issues/43) (capturing-stream helper extraction) — this story introduces helpers; could fold #43 in. | deferred | Out of scope; this story already touches the test helper surface (spawn-cli, inline-config, build-dist). Adding capturing-stream extraction would inflate further. → [#43](https://github.com/xavierbriand/accounting/issues/43) stays open as `deferred-suggestion`; revisit when the next maintenance pass clusters helper-extraction work. |

**Tally:** 7 adopted / 2 rejected / 1 deferred. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 10 findings (7 adopted, 2 rejected, 1 deferred). #43 stays open as documented.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
