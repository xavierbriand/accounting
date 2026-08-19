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
 * bank exports is their job. `__fixtures__/` is excluded too, the same call
 * `stryker.config.mjs` already makes for the same reason: mutating, or
 * purity-checking, test scaffolding measures nothing.
 *
 * Checks the *import source* rather than naming every forbidden function:
 * any `node:fs` import, static or dynamic, read or write, under any name,
 * fails this — not a curated list of function spellings that would need
 * updating every time a new one gets used. `fetch(`, `Date.now(`, and
 * `new Date(` are named directly since they're globals, not imports.
 *
 * Two gaps this can't close, accepted rather than chased: this reads raw
 * text, not parsed code, so a doc comment mentioning `fetch(` would fail
 * the same way real code would — TypeScript 7's `typescript` package no
 * longer ships the compiler API that would parse it, and adding one just
 * for this is disproportionate to what a guard test this size should cost.
 * And a function re-exported under a new name from the excluded
 * `src/config/`/`src/ingest/` and imported by that new name carries no
 * `node:fs` import line into the scanned file at all — closing that fully
 * needs whole-program import resolution, not a text check.
 */

const FORBIDDEN_MODULE = /(?:from\s+|import\(|require\()["'](?:node:)?fs(?:\/promises)?["']/;
const FORBIDDEN_CALL = /\bfetch\(|\bDate\.now\(|\bnew\s+Date\(/;
const ROOTS = ['core', 'numbers'].map((dir) => resolve(import.meta.dirname, dir));

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.parentPath.split(/[\\/]/).includes('__fixtures__'),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

/** `null` means clean. An unreadable file (e.g. a dangling symlink) is reported as an offender, not a crash. */
function violationIn(path: string): string | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return `unreadable: ${(error as Error).message}`;
  }
  if (FORBIDDEN_MODULE.test(text)) return 'imports from node:fs';
  if (FORBIDDEN_CALL.test(text)) return 'calls fetch(), Date.now(), or new Date()';
  return null;
}

describe('src/core and src/numbers', () => {
  it('never read the wall clock, the filesystem, or the network', () => {
    const offenders = ROOTS.flatMap(tsFilesUnder)
      .map((path) => ({ path, reason: violationIn(path) }))
      .filter((entry) => entry.reason !== null);
    expect(offenders).toEqual([]);
  });
});
