/**
 * Guards vitest.config.ts's coverage.thresholds glob keys against silent zero-match drift.
 *
 * Gherkin coverage (story-maint-39):
 *   Scenario: every configured threshold glob matches at least one real file
 *     Given vitest.config.ts's coverage.thresholds keys live in vitest.coverage-thresholds.ts
 *     When this test runs
 *     Then each key (stripped of its trailing "/**") resolves to a directory
 *     And that directory contains at least one .ts file
 *
 * fails if a threshold key's directory contains zero .ts files — a typo, or the directory was
 * renamed/moved without updating the config. istanbul-lib-coverage's percent(covered, total)
 * returns 100 when total === 0, so vitest would otherwise silently report 100% and gate nothing
 * for that key (#277).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { coverageThresholds } from '../../vitest.coverage-thresholds';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('coverage.thresholds glob keys (story-maint-39, #277)', () => {
  for (const glob of Object.keys(coverageThresholds)) {
    it(`"${glob}" matches at least one .ts file`, () => {
      const match = glob.match(/^(.+)\/\*\*$/);
      expect(
        match,
        `threshold key "${glob}" doesn't match the "<dir>/**" shape this check supports — extend the check before adding a differently-shaped glob`,
      ).not.toBeNull();

      const dir = path.resolve(REPO_ROOT, match![1]);
      expect(fs.existsSync(dir), `threshold key "${glob}" resolves to "${dir}", which doesn't exist`).toBe(
        true,
      );

      const entries = fs.readdirSync(dir, { recursive: true, encoding: 'utf8' });
      const tsFiles = entries.filter((f) => f.endsWith('.ts'));

      expect(
        tsFiles.length,
        `threshold key "${glob}" matched zero .ts files under "${dir}" — coverage.thresholds would silently report 100% and gate nothing for this key`,
      ).toBeGreaterThan(0);
    });
  }
});
