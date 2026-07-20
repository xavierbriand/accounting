// fails if: the no-restricted-imports boundary blocks in eslint-rules/boundary/index.js
// stop rejecting a forbidden import for the layer they guard (CLAUDE.md § 2, #241/#228).
import { Linter } from 'eslint';
import { describe, it, expect } from 'vitest';
import { boundaryConfig, forbiddenCoreExternalPaths } from '../../../../eslint-rules/boundary/index.js';

const baseLanguageOptions = { languageOptions: { sourceType: 'module' as const, ecmaVersion: 2022 as const } };

function lintVirtualFile(code: string, filename: string): ReturnType<Linter['verify']> {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(code, [baseLanguageOptions, ...boundaryConfig], { filename });
}

describe('layer boundary — src/core/ forbids everything but dinero.js', () => {
  it('rejects a core file importing better-sqlite3', () => {
    const messages = lintVirtualFile("import Database from 'better-sqlite3';", 'src/core/example.ts');
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('rejects a core file importing node:fs', () => {
    const messages = lintVirtualFile("import { readFileSync } from 'node:fs';", 'src/core/example.ts');
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('rejects a core file importing bare fs (no node: prefix)', () => {
    const messages = lintVirtualFile("import { readFileSync } from 'fs';", 'src/core/example.ts');
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('rejects a core file importing chalk (dynamic-blocklist proof — not statically enumerated)', () => {
    const messages = lintVirtualFile("import chalk from 'chalk';", 'src/core/example.ts');
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('rejects a core file importing a src/infra path', () => {
    const messages = lintVirtualFile(
      "import { Database } from '../../infra/db/database.js';",
      'src/core/example.ts',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows a clean core file that only imports dinero.js', () => {
    const messages = lintVirtualFile("import { dinero } from 'dinero.js';", 'src/core/example.ts');
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toHaveLength(0);
  });

  it('the forbidden-paths list includes chalk (proves it is dynamic, not a hand-authored subset)', () => {
    expect(forbiddenCoreExternalPaths).toContain('chalk');
  });
});

describe('layer boundary — src/infra/ forbids src/cli/', () => {
  it('rejects an infra file importing a src/cli path', () => {
    const messages = lintVirtualFile(
      "import { program } from '../cli/program.js';",
      'src/infra/example.ts',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });
});

describe('layer boundary — categorize-command.ts forbids src/infra/db/ (#228)', () => {
  it('rejects categorize-command.ts importing src/infra/db/database', () => {
    const messages = lintVirtualFile(
      "import { Database } from '../../infra/db/database.js';",
      'src/cli/commands/categorize-command.ts',
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows categorize-command.ts importing a non-db infra path', () => {
    const messages = lintVirtualFile(
      "import { AutoTagRules } from '../../infra/config/auto-tag-rules.js';",
      'src/cli/commands/categorize-command.ts',
    );
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toHaveLength(0);
  });
});
