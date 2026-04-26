import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, closeDb } from '../../../../src/infra/db/sqlite-client.js';

// fails if: busy_timeout pragma is not set in getDb — default is 0 (immediate error
// on contention). The 5000ms value is the standard busy-timeout for SQLite-backed CLIs
// and prevents spurious SQLITE_BUSY during snapshot+commit concurrency (Story 2.5).

const tmpDirs: string[] = [];

function makeTmpDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-sqlite-client-test-'));
  tmpDirs.push(dir);
  return path.join(dir, 'test.db');
}

afterEach(() => {
  closeDb();
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('getDb — pragma configuration', () => {
  it('sets busy_timeout to 5000ms', () => {
    const dbPath = makeTmpDb();
    const db = getDb(dbPath);
    const timeout = db.prepare('PRAGMA busy_timeout').pluck().get() as number;
    expect(timeout).toBe(5000);
  });

  it('sets journal_mode to WAL', () => {
    const dbPath = makeTmpDb();
    const db = getDb(dbPath);
    const mode = db.prepare('PRAGMA journal_mode').pluck().get() as string;
    expect(mode).toBe('wal');
  });

  it('throws on second call with a different path', () => {
    const dbPath1 = makeTmpDb();
    const dbPath2 = makeTmpDb();
    getDb(dbPath1);
    expect(() => getDb(dbPath2)).toThrow('getDb: already opened with a different path');
  });
});
