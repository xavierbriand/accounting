import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach } from 'vitest';

/**
 * Registers a per-test-file tmpdir factory and its `afterEach` best-effort
 * cleanup, and returns the factory. Call at module scope (not inside a
 * `describe`/`it`) so the `afterEach` hook is registered at call time, in the
 * calling test file's own module scope — this keeps cleanup semantics
 * per-file regardless of vitest's `isolate` setting. A hook registered once
 * at this module's own top level would instead silently bind to whichever
 * test file happens to import it first if `isolate` were ever turned off.
 *
 * Call more than once (with different prefixes) in the same test file to get
 * independent factories, each with its own tracked list and `afterEach`.
 */
export function useTmpDirs(prefix = 'accounting-test-'): () => string {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  return function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
}
