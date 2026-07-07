import js from "@eslint/js";
import tseslint from "typescript-eslint";
import testSmellRules from "./eslint-rules/test-smells/index.js";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist", "node_modules", "coverage", ".claude"],
  },
  {
    // Test-smell lint rules (story-maint-23) — grounded in Jorge et al., SAST'21.
    // Scoped broadly; safety comes from each rule's it/test-callee-name AST
    // scoping, not from the glob (see docs/plans/story-maint-23.md § 2).
    files: ["tests/**/*.ts"],
    plugins: { local: { rules: testSmellRules.rules } },
    rules: {
      "local/no-ignored-test": "error",
      "local/no-redundant-assertion": "error",
      "local/assertion-roulette": "warn",
      "local/no-sleepy-test": "warn",
      "local/duplicate-assert": "warn",
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
  }
);
