# Retrospective: story-maint-09

Keep / Change / Try — 2026-04-25

## Keep

- **Manual end-to-end rehearsal before each new story plan.** This story exists because the pre-Epic-3 rehearsal caught a bug that no existing test exercised. The workflow of running a real CSV against a real DB before opening the next plan is proven effective and should continue unconditionally.

- **Factory-over-instance DI for deps that need post-load data.** The chosen fix (`TransactionBuilderFactory`) is the structurally honest expression of the dependency. Wherever a dep needs data from a config that is loaded later inside the command, prefer a factory dep type over a pre-built instance dep. "Pre-built before the config is loaded" is a category of wiring bug that the factory pattern structurally prevents.

- **Named type alias for factory shapes (P3 adoption).** The `TransactionBuilderFactory` named export improves readability and gives future cross-cutting concerns (e.g., a second command that also builds transactions) a shared name to reference. Good habit — export named type aliases for non-trivial dep shapes, not just inline function types.

## Change

- **Subprocess integration tests need `--tsconfig <project-root>` when `cwd` is overridden.** The plan said "spawn with `cwd=<tmp>`" but did not note that tsx resolves `tsconfig.json` relative to `cwd`, which breaks `@core/*` path aliases when cwd is a tmpdir. Future subprocess tests that override `cwd` must pass `--tsconfig <absolute-path-to-project-root>/tsconfig.json`. Codify this in any plan that introduces a subprocess test with a custom `cwd`. (The deviation was mechanical, not structural, but the round-trip of discovering it mid-implementation is avoidable.)

- **Plan's "red→green log" requirement should note the *mechanism* by which the test fails, not just the surface message.** Story 1.3 retro action E asked for the literal `Unknown sourceAccount` flood in the return report. The plan correctly stated this. What was less obvious: the test's *primary* failure mode under the bug is `expect(error).not.toBeNull()` (exit 0, no throw) — the `Unknown sourceAccount` lines never surface in a vitest assertion error; they're only visible in a manual subprocess run. Future plans for subprocess tests should distinguish: "the assertion that fires" vs "the underlying bug output" — both are needed for the return report, but only one is the vitest failure message.

## Try

- **Pre-scan `program.ts` composition root for "empty collection" anti-pattern when planning.** The bug was `new TransactionBuilder([], ...)` — passing an empty collection to a class that requires a populated one to do meaningful work. A quick grep of `new SomeClass([], ` or `new SomeClass({}` in the composition root as part of the plan's feasibility scan would surface this class of bug before the implementation phase. Low-cost, potentially high-catch.

- **Require at least one subprocess-level integration test per story that touches `program.ts` wiring.** The gap that let #60 ship was the absence of a test that exercises the actual entry point. Going forward: if a story touches `program.ts` (the composition root), include a subprocess integration test in the plan's test surface. Mock-only unit tests at the command level cannot catch wiring bugs.
