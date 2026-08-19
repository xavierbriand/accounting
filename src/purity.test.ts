import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * `src/core/` and `src/numbers/` never touch the wall clock, the
 * filesystem, or the network — `referenceDay` and `Ledger` always arrive as
 * parameters, read nowhere in between. That's what keeps every function
 * under these two directories mutation-testable without mocking anything.
 * It has held so far by discipline alone — several doc comments say so
 * ("nothing under `src/numbers/` reads the wall clock; that stays at the
 * edge, in step 4") — but nothing enforced it. This does. `src/config/` and
 * `src/ingest/` are excluded on purpose: reading the config file and the
 * bank exports is their job.
 */

const FORBIDDEN = /\breadFile|readdir|fetch\(|new Date\(/;
const ROOTS = ['core', 'numbers'].map((dir) => resolve(import.meta.dirname, dir));

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...tsFilesUnder(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out;
}

describe('src/core and src/numbers', () => {
  it('never read the wall clock, the filesystem, or the network', () => {
    const offenders = ROOTS.flatMap(tsFilesUnder).filter((path) =>
      FORBIDDEN.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
