import { defineConfig } from 'vitest/config';
import { quickpickle } from 'quickpickle';
import path from 'path';

export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/features/**/*.feature'],
    setupFiles: ['tests/features/steps/index.ts'],
    globalSetup: ['tests/_setup/build-dist.ts'],
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
    },
    exclude: ['**/node_modules/**', '**/.claude/**', 'harness/**'],
    coverage: {
      provider: 'v8',
      // `.ts`-only: `src/infra/db/migrations/*.sql` matches a bare `src/**` glob and
      // v8/rolldown then tries (and audibly fails) to parse SQL as JS — harmless but
      // noisy. Scoping to `*.ts` excludes it without excluding any source file.
      include: ['src/**/*.ts'],
      // CLAUDE.md § 5: 100% branch coverage on src/core/ is non-negotiable and CI-gated.
      // src/infra/** and the in-process-tested slice of src/cli/** get a ratchet floor
      // instead (#242) — a few points below the measured 2026-08-11 CI baseline
      // (infra 83.23%, cli/commands 89.66%, cli/utils 78.94%), not an arbitrary number.
      //
      // src/cli/*.ts composition-root files (program.ts, migrate.ts, the
      // ledger-command.ts wrapper) are deliberately excluded from the cli glob below:
      // they're validated by the mandatory subprocess test (R4/R7), which v8's
      // in-process instrumentation can't observe, so they always read 0% here — gating
      // on them would either fail permanently or force the floor down to near-nothing.
      thresholds: {
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
      },
    },
  },
});
