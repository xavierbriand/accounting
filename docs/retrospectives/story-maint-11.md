# Retrospective — story-maint-11

Code refactor bundle: Result combinators + busy_timeout + YAML-authoritative dbPath + #56.

## Keep

- **Bundling scope-independent small items in one PR works well** — four deliverables landed as clean per-commit slices. Each commit is still revertable independently.
- **The "grep contract before deletion" pattern** (slice 3 for `Result.combine`, slice 7 for `getDb`) was surfaced explicitly in the commit bodies. Reviewer can confirm removals were safe without re-running the search.
- **Slice 7 as a single large commit** (the plan's "adapter-story coarser slices" analogy) was the right call. TypeScript compile forced production + all mock-surface changes to land together; splitting would have produced a red intermediate state for no benefit.
- **The `busy_timeout` observation** (default already 5000 in the installed driver version) was correctly noted in the slice 4 commit body rather than silently passing. The pragma was still added explicitly — self-documenting intent, doesn't rely on the driver default.

## Change

- **`findDuplicateIndices` is still private to `config-schema.ts`**. The plan left the extraction/co-location decision to Sonnet based on diff size. The helper is 13 LOC and has no cross-module consumers yet. If a second consumer appears, extract to `src/infra/config/duplicate-indices.ts` at that point.
- **`symlink-dbpath-refuse.test.ts` now depends on `writeStubYaml`** — the config load must succeed before `validateDbPath` is reached. This makes the symlink test slightly heavier (it writes a YAML stub). The tradeoff is correct: the test now exercises the real composition root path including config load.
- **The `uninit-db-hint` test was updated to use YAML-authoritative dbPath**. The original test passed `--db-path` directly; the updated test uses `writeStubYaml` + no flag. The fixture CSV filename was also updated to match the YAML's `filenamePrefix: "bpce-valid_"` (the original used `bpce-valid.csv`, the updated uses `bpce-valid_real.csv`). If this test breaks in future, the likely cause is a mismatch between the YAML filenamePrefix and the fixture CSV filename.

## Try

- **Closing GitHub issues in the commit body** (via `Closes #65` / `Closes #56`) worked cleanly. Consider also adding `gh issue close` in the post-merge checklist so the issue board stays tidy without manual action.
- **The migration hint update** removed the dbPath from the hint string. This is intentional (the path is in the error context already, and the new hint guides to `accounting.yaml`). However the integration test for `assertMigrated` was updated to assert both `dbPath` present in the error AND the new hint format. Worth confirming in Phase 4 that this is the right balance of context vs. verbosity.
- **`Result.combine` was removed in slice 3**. The grep found zero external consumers. If a future consumer wants the "discard the array, get a single Result<void>" shape, use `Result.all(...).map(() => undefined)` as documented in the risk section. Consider adding this note to the `Result` class's JSDoc if Epic 3 consumers arrive.
