import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * No committed source file may contain a raw NUL byte.
 *
 * A NUL byte inside a string or regex literal is syntactically *valid*
 * JavaScript — it does not throw, it silently becomes the wrong character.
 * `runnable.test.ts`'s "loads under bare node" check would not catch this:
 * the file still parses and runs, it just does something other than what
 * its source reads as. Twice in this codebase's history a template literal
 * meant to hold a plain space ended up holding a NUL byte instead — once in
 * a `Map` key that silently merged two distinct entries, once in a sort
 * comparator — and both were found only by a manual byte-level scan run out
 * of suspicion, not by the test suite. This closes that gap.
 */

const SRC = resolve(import.meta.dirname);

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...tsFilesUnder(path));
    } else if (entry.name.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

describe('every source file', () => {
  it('contains no raw NUL byte', () => {
    const withNulByte = tsFilesUnder(SRC).filter((path) => readFileSync(path).includes(0));
    expect(withNulByte).toEqual([]);
  });
});
