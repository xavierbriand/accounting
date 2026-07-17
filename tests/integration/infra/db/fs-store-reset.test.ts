/**
 * Integration tests for FsStoreReset.wipe() and planWipeTargets (story-4.5c,
 * R2 surface). Real fs, real tmp dirs — dbPath plus its `.bak`/`-wal`/`-shm`
 * siblings, aux-files-first / DB-last (model note § Dissolution half, "Wipe").
 *
 * Gherkin coverage: underpins tests/features/dissolve.feature's proof-gated
 *   dissolution scenario (the planted `.bak` sibling).
 *
 * fails if: the DB file is removed before an existing aux sibling (a crash
 *   between the two would leave an unrecoverable half-dead ledger), a
 *   not-present sibling is reported as removed, or a partial failure loses
 *   track of which stores survived.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FsStoreReset, planWipeTargets } from '../../../../src/infra/db/fs-store-reset.js';

const tmpDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-store-reset-'));
  tmpDirs.push(dir);
  return dir;
}

describe('planWipeTargets', () => {
  it('returns only the paths that currently exist, aux-first then dbPath last', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'db', 'utf8');
    fs.writeFileSync(`${dbPath}.bak`, 'bak', 'utf8');
    fs.writeFileSync(`${dbPath}-shm`, 'shm', 'utf8');
    // -wal deliberately absent — must not appear in the predicted list.

    const targets = planWipeTargets(dbPath);

    expect(targets).toEqual([`${dbPath}.bak`, `${dbPath}-shm`, dbPath]);
  });

  it('does not delete anything (pure prediction)', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'db', 'utf8');

    planWipeTargets(dbPath);

    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('returns an empty array when nothing exists at dbPath', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'does-not-exist.db');

    expect(planWipeTargets(dbPath)).toEqual([]);
  });
});

describe('FsStoreReset.wipe() — happy path', () => {
  it('removes dbPath.bak, dbPath-wal, and dbPath-shm before dbPath, returning the removed list in that order', async () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'db', 'utf8');
    fs.writeFileSync(`${dbPath}.bak`, 'bak', 'utf8');
    fs.writeFileSync(`${dbPath}-wal`, 'wal', 'utf8');
    fs.writeFileSync(`${dbPath}-shm`, 'shm', 'utf8');

    const result = await new FsStoreReset(dbPath).wipe();

    expect(result.isSuccess, `wipe failed: ${result.isFailure ? result.error : ''}`).toBe(true);
    expect(result.value).toEqual([`${dbPath}.bak`, `${dbPath}-wal`, `${dbPath}-shm`, dbPath]);
    expect(fs.existsSync(dbPath)).toBe(false);
    expect(fs.existsSync(`${dbPath}.bak`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
  });

  it('removes only dbPath when no aux siblings exist', async () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'db', 'utf8');

    const result = await new FsStoreReset(dbPath).wipe();

    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual([dbPath]);
  });

  it('returns an empty removed list when nothing exists at dbPath (re-run after a completed wipe)', async () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'already-gone.db');

    const result = await new FsStoreReset(dbPath).wipe();

    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual([]);
  });
});

describe('FsStoreReset.wipe() — partial failure', () => {
  it('fails naming which stores are still present when an unlink fails partway through', async () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'db', 'utf8');
    fs.writeFileSync(`${dbPath}.bak`, 'bak', 'utf8');

    const realUnlinkSync = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((target) => {
      if (String(target) === dbPath) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
      return realUnlinkSync(target);
    });

    const result = await new FsStoreReset(dbPath).wipe();

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('database file');
    // The .bak removal (before dbPath in wipe order) succeeded; only dbPath survives.
    expect(fs.existsSync(`${dbPath}.bak`)).toBe(false);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('sanitizes the underlying fs error (no absolute path leaked)', async () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'db', 'utf8');

    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw Object.assign(new Error(`ENOENT: no such file or directory, unlink '${dbPath}'`), { code: 'ENOENT' });
    });

    const result = await new FsStoreReset(dbPath).wipe();

    expect(result.isFailure).toBe(true);
    expect(result.error).not.toContain(tmpDir);
  });
});
