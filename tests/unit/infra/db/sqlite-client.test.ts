import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import { getDb, closeDb } from '../../../../src/infra/db/sqlite-client.js';
import { useTmpDirs } from '../../../_helpers/tempdir.js';

// fails if: busy_timeout pragma is not set in getDb — default is 0 (immediate error
// on contention). The 5000ms value is the standard busy-timeout for SQLite-backed CLIs
// and prevents spurious SQLITE_BUSY during snapshot+commit concurrency (Story 2.5).

const makeTmpDir = useTmpDirs('accounting-sqlite-client-test-');

function makeTmpDb(): string {
  return path.join(makeTmpDir(), 'test.db');
}

afterEach(() => {
  closeDb();
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
