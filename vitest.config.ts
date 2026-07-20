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
      // CLAUDE.md § 5: 100% branch coverage on src/core/ is non-negotiable and now
      // CI-gated; infra/cli are measured but not yet thresholded (deferred to #242 —
      // a ratchet from a measured CI baseline, not an arbitrary number).
      thresholds: {
        'src/core/**': {
          branches: 100,
        },
      },
    },
  },
});
