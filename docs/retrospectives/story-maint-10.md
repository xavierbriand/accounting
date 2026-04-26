# Retrospective: story-maint-10

Keep / Change / Try — 2026-04-25

## Keep

- **`tsc-alias` + vitest `globalSetup` harness is the right shape.** One build before the full suite; all subprocess tests spawn the compiled binary; `VITEST_SKIP_BUILD=1` gives fast local iteration. The pattern scales cleanly: any future subprocess test adds a `spawnCli(...)` call without touching the build setup.

- **`spawnCli` using `spawnSync` not `execFileSync`.** `execFileSync` does not capture `stderr` on exit-code-0 runs; `spawnSync` always captures both pipes. The helper was written correctly from the start (based on a prior discovery); this is worth retaining as a permanent policy: subprocess helpers in this codebase always use `spawnSync`, never `execFileSync`.

- **In-process `runIngestCommand` with auto-confirm prompter for BDD interactive steps.** Inquirer's `select` uses raw keypress events requiring a TTY; piped stdin cannot drive it. The in-process approach (inject `prompt: { selectCategory: () => ..., confirmBatch: () => ... }`) is deterministic, fast, and cross-platform. For future BDD scenarios that need the interactive path without testing the prompt UX itself, this pattern is the right default.

- **CommitWorld re-using `lastResult` shape from IngestWorld.** Having both world types define the same property shape (`{ status, stdout, stderr }`) allows the shared Then steps from ingest.steps.ts to work across both feature files without re-registration. Good pattern for step sharing across feature files.

## Change

- **The plan's "seeded DB collision" approach for 2.5b is architecturally wrong.** The plan said: "seed a row with the colliding idempotency_hash, then run ingest — the UNIQUE constraint fires". But IdempotencyService.filterNew runs before saveBatch and filters out the matching row as a duplicate. The UNIQUE constraint at the SQL level is never reached. The correct approach (and what the pre-existing ingest-commit.test.ts already does) is to inject a failing repo mock. Future plans that want to exercise "saveBatch failure" at the BDD layer should use a failing repo, not a seeded DB collision.

- **BDD scenarios for ingest.feature 2.3 + 2.4 must run against the current dist binary.** These scenarios spawned the dist CLI which was compiled before the `lowConfidence` / `duplicates` fields were added to the JSON output. Running with `VITEST_SKIP_BUILD=1` against a stale dist binary caused them to fail until a fresh `npm run build` was run. This is expected behavior for the harness (SKIP_BUILD is explicitly an "iteration shortcut"), but worth documenting: whenever production JSON shape changes, the dist binary must be rebuilt before running subprocess tests.

- **Import audit for new tools should be done at plan time, not mid-implementation.** The tsc-alias audit (Story 3.1 retro action B) was completed during implementation. Moving it to the plan's pre-authorization step (as intended by the rule) would keep the implementation phase focused on TDD.

## Try

- **Add `postbuild` script check: verify at least one dist binary exists before subprocess tests run.** Currently if `npm run build` fails silently (unlikely but possible), `spawnCli` would fail with `ENOENT` rather than a helpful "dist not built" error. A `tests/_setup/build-dist.ts` check that verifies `DIST_CLI` exists and is a file — before running the first subprocess test — would give a cleaner failure message and faster diagnosis. (The current implementation just runs `npm run build`; adding an existence check post-build is a one-liner.)

- **Per-feature-file cleanup in quickpickle.** Currently `afterEach` in each steps file accumulates `tmpDirs` for cleanup. If quickpickle supports `afterFeature`/`afterAll` hooks, migrating from `afterEach` to `afterAll` would slightly reduce cleanup overhead for long-running feature files. Investigate before the next BDD story (maint-11).
