// CLAUDE.md § 5: 100% branch coverage on src/core/ is non-negotiable and CI-gated.
// src/infra/** and the in-process-tested slice of src/cli/** get a ratchet floor instead
// (#242, story-maint-38) — a few points below the measured 2026-08-11 CI baseline (infra
// 83.23%, cli/commands 89.66%, cli/utils 78.94%), not an arbitrary number.
//
// src/cli/*.ts composition-root files (program.ts, migrate.ts, the ledger-command.ts
// wrapper) are deliberately excluded from the cli glob below: they're validated by the
// mandatory subprocess test (R4/R7), which v8's in-process instrumentation can't observe,
// so they always read 0% here — gating on them would either fail permanently or force the
// floor down to near-nothing.
//
// Extracted from vitest.config.ts (story-maint-39, #277) so
// tests/integration/coverage-thresholds-glob.test.ts can validate every key against the
// live object instead of a hand-copied list — a future key addition, rename, or typo is
// automatically covered with zero extra wiring.
export const coverageThresholds: Record<string, { branches: number }> = {
  'src/core/**': {
    branches: 100,
  },
  'src/infra/**': {
    branches: 78,
  },
  'src/cli/commands/**': {
    branches: 84,
  },
  'src/cli/utils/**': {
    branches: 73,
  },
} as const;
