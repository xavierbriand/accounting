/**
 * Structural test: DEFAULT_RULES is fully removed from src/.
 *
 * Gherkin coverage (Story B):
 *   Scenario: DEFAULT_RULES symbol fully removed from src/
 *     Given the TypeScript source post-merge
 *     When fs.readdirSync('src/', { recursive: true }) walks every .ts file
 *     Then no file contains the literal token DEFAULT_RULES
 *
 * fails if the constant remains anywhere in src/ (guards complete removal per the issue).
 *
 * Uses Node fs.readdirSync(..., { recursive: true }) — no git-CLI, no .git dependency.
 * Portable across shallow clones and CI runners.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, '../../../../src');

describe('DEFAULT_RULES removed from src/ (Story B)', () => {
  it('no .ts file under src/ contains the literal token DEFAULT_RULES', () => {
    // fails if DEFAULT_RULES constant remains anywhere in source
    const allFiles = fs.readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' });
    const tsFiles = allFiles.filter((f) => f.endsWith('.ts'));

    const filesWithDefaultRules = tsFiles.filter((relative) => {
      const fullPath = path.join(SRC_DIR, relative);
      const content = fs.readFileSync(fullPath, 'utf8');
      return content.includes('DEFAULT_RULES');
    });

    expect(filesWithDefaultRules).toEqual([]);
  });
});
