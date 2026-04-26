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
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
});
