/**
 * Integration tests for validateDbPath — symlink-rejection helper.
 *
 * Gherkin coverage:
 *   - "Regular file at dbPath proceeds normally" (cases a, b)
 *   - "Non-existent dbPath proceeds (getDb creates fresh)" (case a)
 *   - "CLI ingest against a symlinked db path is refused" (cases c, d — unit-level probe;
 *     subprocess test covers the full CLI scenario)
 *   - "CLI migrate against a symlinked db path is refused" (cases c, d)
 *
 * fails if: validateDbPath returns ok for a symlink (the symlink-rejection guard would be
 *   bypassed and better-sqlite3 would follow the link), or returns fail for a non-existent
 *   path (blocking legitimate fresh-install workflows), or returns fail for a regular file
 *   (blocking normal usage).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateDbPath } from '../../../../src/infra/db/db-path-validator.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-dbpath-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('validateDbPath', () => {
  it('(a) non-existent path returns Result.ok with the resolved path', () => {
    // fails if: validateDbPath rejects ENOENT (fresh-install path would be blocked;
    //   getDb legitimately creates the file on first use)
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'fresh.db');

    const result = validateDbPath(dbPath);

    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe(path.resolve(dbPath));
  });

  it('(b) regular file at path returns Result.ok with the resolved path', () => {
    // fails if: validateDbPath incorrectly refuses an ordinary file (all normal usage would break)
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'real.db');
    fs.writeFileSync(dbPath, '');

    const result = validateDbPath(dbPath);

    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe(path.resolve(dbPath));
  });

  it('(c) symlink pointing at a real sibling file returns Result.fail with "symbolic link" and "refusing to open dbPath"', () => {
    // fails if: validateDbPath returns ok for a symlink — better-sqlite3 would follow the
    //   link and write SQLite bytes into an unintended file, corrupting it
    const tmpDir = makeTmpDir();
    const target = path.join(tmpDir, 'real.db');
    const link = path.join(tmpDir, 'link.db');
    fs.writeFileSync(target, '');
    fs.symlinkSync(target, link);

    const result = validateDbPath(link);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('symbolic link');
    expect(result.error).toContain('refusing to open dbPath');
  });

  it('(d) dangling symlink (target does not exist) returns Result.fail with "symbolic link" and "refusing to open dbPath"', () => {
    // fails if: validateDbPath treats a dangling symlink as ENOENT (the link itself exists
    //   as an lstat entry; only the target is missing — both valid and dangling symlinks
    //   must be refused)
    const tmpDir = makeTmpDir();
    const target = path.join(tmpDir, 'nonexistent.db');
    const link = path.join(tmpDir, 'dangling.db');
    fs.symlinkSync(target, link);

    const result = validateDbPath(link);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('symbolic link');
    expect(result.error).toContain('refusing to open dbPath');
  });

  it('(e) non-ENOENT stat failure propagates as Result.fail', () => {
    // fails if: validateDbPath swallows unexpected lstatSync errors (EACCES would be
    //   masked, silently proceeding to open an inaccessible path)
    const eaccesError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => { throw eaccesError; });

    const result = validateDbPath('/some/path/db.sqlite');

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('failed to stat dbPath');
  });
});
