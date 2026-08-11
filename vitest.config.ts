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
      // src/infra/** gets a ratchet floor instead (#242) — a few points below the
      // measured 2026-08-11 CI baseline (83.23%), not an arbitrary number.
      thresholds: {
        'src/core/**': {
          branches: 100,
        },
        'src/infra/**': {
          branches: 78,
        },
      },
    },
  },
});
