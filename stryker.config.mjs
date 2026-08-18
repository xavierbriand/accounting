/**
 * Mutation testing — proving the tests can fail, not merely that they pass.
 *
 * Run with `npm run mutate`. Deliberately NOT part of `npm run check`: that
 * gates every push in about thirty seconds and is worth protecting, where a
 * mutation run is minutes.
 *
 * @type {import('@stryker-mutator/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',

  vitest: {
    configFile: 'vitest.config.ts',

    // Stryker already computes per-test coverage itself (the vitest runner
    // forces coverageAnalysis: "perTest") and reruns only the tests that touch
    // the mutated line. `related: true` would layer vitest's static
    // module-graph heuristic on top of that — a second, coarser filter that can
    // only ever DROP tests the coverage analysis would have kept. Every test it
    // wrongly drops becomes a mutant reported as surviving when a real test
    // would have killed it. A false survivor costs triage time and quietly
    // devalues every other number in the report, so the coarser filter is off.
    related: false,
  },

  // Stryker's default glob excludes neither tests nor fixtures. Fixtures are
  // test scaffolding — mutating them measures nothing.
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/__fixtures__/**'],

  mutator: {
    // The error messages in src/config are long prose whose value is that they
    // explain consequences. Mutating them yields hundreds of mutants whose only
    // question is whether some test happens to regex that fragment. The signal
    // here is in operators, boundaries and conditionals.
    excludedMutations: ['StringLiteral'],
  },

  // Stryker rewrites tsconfig.json when copying into the sandbox, to fix up
  // `extends` and `references` paths that would otherwise point outside it. It
  // does this via `ts.parseConfigFileTextToJson`, which TypeScript 7's native
  // rewrite no longer exposes — its default export carries two keys now — so
  // the rewrite throws before any mutant runs. Pointing this at nothing makes
  // the preprocessor a no-op, which is correct here regardless of the crash:
  // our tsconfig.json has no `extends` and no `references`, its include/exclude
  // paths are all inside the tree, and vitest does not read it for resolution
  // anyway (the `@` alias comes from vitest.config.ts).
  tsconfigFile: '',

  // Static mutants — those in top-level initialisers, which cannot be
  // re-evaluated per test and so force a full-suite rerun — are the slow ones.
  // They are also exactly the "constant nobody pinned" defect this exercise
  // exists to catch, so they stay. This is Stryker's default, restated because
  // the temptation to switch it off for speed will come up.
  ignoreStatic: false,

  // The tuning pass reruns this several times; without it, each iteration pays
  // for the whole tree again.
  incremental: true,

  // Recorded in the baseline write-up: scores are only reproducible alongside
  // the concurrency they were measured at, since machine load feeds into which
  // mutants time out.
  concurrency: 4,

  // clear-text and html both roll up by directory, which is what the baseline
  // needs; json makes that rollup scriptable.
  reporters: ['clear-text', 'progress', 'html', 'json'],
};
