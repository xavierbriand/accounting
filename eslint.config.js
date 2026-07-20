import js from "@eslint/js";
import tseslint from "typescript-eslint";
import testSmellRules from "./eslint-rules/test-smells/index.js";
import boundaryConfig from "./eslint-rules/boundary/index.js";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist", "node_modules", "coverage", ".claude"],
  },
  {
    // Test-smell lint rules (story-maint-24) — grounded in Jorge et al., SAST'21.
    // Scoped broadly; safety comes from each rule's it/test-callee-name AST
    // scoping, not from the glob (see docs/plans/story-maint-24.md § 2).
    files: ["tests/**/*.ts"],
    plugins: { local: { rules: testSmellRules.rules } },
    rules: {
      // error from day one — confirmed-zero baseline via direct repo-wide check.
      "local/no-ignored-test": "error",
      "local/no-redundant-assertion": "error",
      // promoted after the Slice 8 baseline audit — see docs/plans/story-maint-24.md
      // § "Baseline audit results" — both were warn-only during development,
      // each surfaced and fixed real false positives, and both now sweep the
      // full suite at 0 hits.
      "local/duplicate-assert": "error",
      "local/no-unasserted-test": "error",
      // stays warn indefinitely per the rollout plan — the paper's own
      // low-yield caveat for this style of test code; never promote.
      "local/assertion-roulette": "warn",
      // stays warn — 1 confirmed real hit needing a human disposition, not
      // an automatic fix (see audit results).
      "local/no-sleepy-test": "warn",
      // stays warn — 193 real hits, includes 2 known-legitimate categories
      // not yet excluded (finally-cleanup guards, fc.property preconditions);
      // needs a human triage pass before any promotion (see audit results).
      "local/conditional-test-logic": "warn",
      // stays warn indefinitely per the rollout plan — deliberately
      // conservative heuristic, low recall by design; never promote.
      "local/no-swallowed-exception": "warn",
    },
  },
  {
    // Subset of the tests/**/*.ts glob above, which already registers the
    // "local" plugin — flat config disallows redefining a plugin in an
    // overlapping config object, so this block only adds rules.
    // tests/perf/** is intentionally excluded — it has a deliberate
    // throughput-metric console.log, not a leftover debug statement.
    files: ["tests/unit/**/*.ts", "tests/integration/**/*.ts", "tests/features/**/*.ts"],
    rules: {
      "local/no-redundant-print": "error",
    },
  },
  {
    // Subset of tests/**/*.ts — see the plugin-registration note above.
    files: ["tests/unit/core/**/*.ts"],
    rules: {
      "local/no-mystery-guest-db": "error",
    },
  },
  // Layer-boundary lint (story-maint-29, #241/#228) — mechanizes CLAUDE.md § 2's
  // dependency rule via no-restricted-imports instead of grep. See
  // eslint-rules/boundary/index.js for the dynamic blocklist.
  ...boundaryConfig,
);
