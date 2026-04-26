# Retrospective: story-maint-10

Keep / Change / Try — 2026-04-26 (updated post-Phase-4)

## Keep

- **`tsc-alias` + vitest `globalSetup` harness is the right shape.** One build before the full suite; all subprocess tests spawn the compiled binary; `VITEST_SKIP_BUILD=1` gives fast local iteration. The pattern scales cleanly: any future subprocess test adds a `spawnCli(...)` call without touching the build setup.

- **`spawnCli` using `spawnSync` not `execFileSync`.** `execFileSync` does not capture `stderr` on exit-code-0 runs; `spawnSync` always captures both pipes. The helper was written correctly from the start (based on a prior discovery); this is worth retaining as a permanent policy: subprocess helpers in this codebase always use `spawnSync`, never `execFileSync`.

- **In-process `runIngestCommand` with auto-confirm prompter for BDD interactive steps.** Inquirer's `select` uses raw keypress events requiring a TTY; piped stdin cannot drive it. The in-process approach (inject `prompt: { selectCategory: () => ..., confirmBatch: () => ... }`) is deterministic, fast, and cross-platform. For future BDD scenarios that need the interactive path without testing the prompt UX itself, this pattern is the right default.

- **CommitWorld re-using `lastResult` shape from IngestWorld.** Having both world types define the same property shape (`{ status, stdout, stderr }`) allows the shared Then steps from ingest.steps.ts to work across both feature files without re-registration. Good pattern for step sharing across feature files.

## Change

- **The plan's "seeded DB collision" approach for 2.5b is architecturally wrong.** The plan said: "seed a row with the colliding idempotency_hash, then run ingest — the UNIQUE constraint fires". But IdempotencyService.filterNew runs before saveBatch and filters out the matching row as a duplicate. The UNIQUE constraint at the SQL level is never reached. The correct approach (and what the pre-existing ingest-commit.test.ts already does) is to inject a failing repo mock. Future plans that want to exercise "saveBatch failure" at the BDD layer should use a failing repo, not a seeded DB collision.

- **BDD scenarios for ingest.feature 2.3 + 2.4 must run against the current dist binary.** These scenarios spawned the dist CLI which was compiled before the `lowConfidence` / `duplicates` fields were added to the JSON output. Running with `VITEST_SKIP_BUILD=1` against a stale dist binary caused them to fail until a fresh `npm run build` was run. This is expected behavior for the harness (SKIP_BUILD is explicitly an "iteration shortcut"), but worth documenting: whenever production JSON shape changes, the dist binary must be rebuilt before running subprocess tests.

- **Import audit for new tools should be done at plan time, not mid-implementation.** The tsc-alias audit (Story 3.1 retro action B) was completed during implementation. Moving it to the plan's pre-authorization step (as intended by the rule) would keep the implementation phase focused on TDD.

- **BDD scenario `fails if` comments must match what the test can actually regress on.** Phase 4 retro-check caught this: scenarios 2.5a + 2.5b's `fails if` clauses initially claimed to test "the interactive prompter wiring (selectCategory + confirmBatch) does not reach commitBatch" — but the implementation invokes `runIngestCommand` in-process with a mocked prompter, which bypasses program.ts wiring entirely. The clauses described a failure mode that the test couldn't actually detect. Fixed in Phase 4 by rewriting the comments and noting that wiring coverage is owned by `ingest-end-to-end-wiring.test.ts` (maint-09) + ingest.feature scenario 2.1. Future BDD planning: when a scenario's test mechanism is in-process (mocked prompter, direct service call), the `fails if` clause must not claim wiring coverage. Subprocess scenarios get the wiring claim; in-process scenarios stay scoped to coordination/contract concerns.

- **Don't write helpers ahead of confirmed need.** `spawnCliInteractive` was implemented during Phase 3 in anticipation of driving Inquirer prompts via stdin — only to discover Inquirer's `select` requires a TTY, making the helper unusable. The function shipped as dead code (~57 LOC, only referenced in apologetic comments) and was deleted in Phase 4. Future implementation pattern: when a planned helper turns out to be unusable, remove it before the slice lands rather than shipping it as a "maybe useful later" placeholder. CLAUDE.md § 4's "no dead code" rule applies even to test helpers.

- **Gherkin scenario language should describe user-observable behaviour, not test mechanism.** Scenario 2.5b's original `When` clause read "I run ingest interactively with auto-confirm and a failing repo" — "failing repo" is implementation language. Fixed in Phase 4 to "I run ingest interactively and the database commit fails," which describes what the user observes regardless of how the failure is induced. Future BDD planning: scenarios are documentation as much as tests; the language should make sense to a non-engineer reading the feature file.

## Try

- **Add `postbuild` script check: verify at least one dist binary exists before subprocess tests run.** Currently if `npm run build` fails silently (unlikely but possible), `spawnCli` would fail with `ENOENT` rather than a helpful "dist not built" error. A `tests/_setup/build-dist.ts` check that verifies `DIST_CLI` exists and is a file — before running the first subprocess test — would give a cleaner failure message and faster diagnosis. (The current implementation just runs `npm run build`; adding an existence check post-build is a one-liner.)

- **Per-feature-file cleanup in quickpickle.** Currently `afterEach` in each steps file accumulates `tmpDirs` for cleanup. If quickpickle supports `afterFeature`/`afterAll` hooks, migrating from `afterEach` to `afterAll` would slightly reduce cleanup overhead for long-running feature files. Investigate before the next BDD story (maint-11).

- **Plans should pre-authorise production-code changes that BDD scenarios depend on.** The `DuplicateIngestItem` type, the `IdempotencyOutcome.duplicates` shape change, and the `--json` output's `needsReview` → `lowConfidence` rename + new top-level `duplicates[]` array were all production-code changes triggered by scenario 2.4's mock-diversity assertion. The plan didn't list them explicitly — Sonnet derived them during slice 4 and folded them into the same commit (justified by the carve-out, but mid-implementation discovery is a planning gap). Future story plans: include a "Production-code surface" section listing every type, function signature, or output-format change the BDD scenarios will require. Bundle scope creep gets disclosed at plan time, not implementation time.

- **Run a quick `npm run build` smoke test on the dist binary as part of the plan-phase feasibility scan.** Before committing the plan, `node dist/cli/program.js --help` would have surfaced the `@core/*` resolution issue (#46) as a real cost upfront, rather than as a slice-1 discovery. Pattern: any plan that introduces or relies on dist-bundling should include a "Probe" subsection in the maintenance sub-loop showing the dist binary works end-to-end pre-implementation.
