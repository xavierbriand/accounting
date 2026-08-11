import { defineConfig } from 'vitest/config';
import { quickpickle } from 'quickpickle';
import path from 'path';
import { coverageThresholds } from './vitest.coverage-thresholds';

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
      // Thresholds live in vitest.coverage-thresholds.ts (story-maint-39, #277) so
      // tests/integration/coverage-thresholds-glob.test.ts can validate every glob key
      // against the live object instead of a hand-copied list.
      thresholds: coverageThresholds,
    },
  },
});
