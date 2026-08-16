import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Every module must load under bare `node`, not only under the test runner.
 *
 * Imports carry explicit `.ts` extensions precisely so a module can be run or
 * probed straight from a terminal, and node executes TypeScript in strip-only
 * mode — which rejects a few constructs the type checker is perfectly happy
 * with, constructor parameter properties chief among them.
 *
 * Vitest transforms rather than strips, so it accepts all of them. That gap let
 * a parameter property into a new module unnoticed, with a green suite and a
 * module that would not load. This closes it.
 */

const SRC = resolve(import.meta.dirname);

function modulesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...modulesUnder(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out;
}

describe('every module', () => {
  it('loads under bare node, not just under the test runner', () => {
    const imports = modulesUnder(SRC)
      .map((path) => `import(${JSON.stringify(pathToFileURL(path).href)})`)
      .join(',\n');

    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', `await Promise.all([\n${imports}\n])`], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
