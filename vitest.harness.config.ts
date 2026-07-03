import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['harness/**/*.test.ts'],
    // Several harness integration tests spawn a real `npx tsx <entrypoint>`
    // subprocess (drift-scan, dod-check). Cold `tsx` start-up plus git/gh work
    // can exceed vitest's 5s default on a loaded CI runner — a single dod-check
    // subprocess test flaked at ~5.2s. A generous ceiling removes the flake
    // without masking a genuine hang (which would still blow past 30s).
    testTimeout: 30000,
  },
});
