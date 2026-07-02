import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateInputPath } from '../validate-path.js';

const TEMP_FILES: string[] = [];

afterEach(() => {
  for (const f of TEMP_FILES.splice(0)) {
    if (fs.existsSync(f)) {
      fs.rmSync(f, { force: true });
    }
  }
});

describe('validateInputPath', () => {
  // fails if: a symlinked telemetry/price-map path is silently followed —
  // guards the boundary-hygiene rule (local validateDbPath re-implementation).
  it('refuses a symlink at the resolved path', () => {
    const target = path.join(os.tmpdir(), `metrics-target-${Date.now()}.json`);
    const link = path.join(os.tmpdir(), `metrics-link-${Date.now()}.json`);
    fs.writeFileSync(target, '{}');
    fs.symlinkSync(target, link);
    TEMP_FILES.push(target, link);

    const result = validateInputPath(link);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('symbolic link');
    }
  });

  it('accepts a regular file and returns its resolved path', () => {
    const file = path.join(os.tmpdir(), `metrics-regular-${Date.now()}.json`);
    fs.writeFileSync(file, '{}');
    TEMP_FILES.push(file);

    const result = validateInputPath(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved).toBe(path.resolve(file));
    }
  });

  it('reports a missing file rather than crashing', () => {
    const result = validateInputPath('/nonexistent/path/does-not-exist.json');
    expect(result.ok).toBe(false);
  });
});
