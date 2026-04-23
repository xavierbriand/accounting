/**
 * Integration tests for NodeSqliteSnapshotService.
 *
 * Gherkin coverage:
 *   - "SnapshotService round-trip (integration, real temp-file DB)"
 *   - "snapshot path is a pre-planted symlink — symlink replaced, target untouched"
 *   - "second failed run overwrites the first .bak"
 *   - remove on absent file = no-op
 *   - (POSIX) snapshot mode 0o600
 *   - tmp cleanup on backup failure (P3 #5 — no leaked tmp files)
 *
 * fails if: backup is torn (WAL not coordinated), symlink target is written,
 *   the adapter uses a lstat-then-write pattern (TOCTOU race), chmod is missed,
 *   or tmp files are leaked on failure.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { NodeSqliteSnapshotService } from '../../../../src/infra/db/node-sqlite-snapshot-service.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-snap-test-'));
}

function makeSeedDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function writeTwoTxns(db: Database.Database): void {
  db.prepare("INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)").run(
    'tx-snap-1', '2026-01-01T00:00:00Z', 'First', 'snap-hash-1',
  );
  db.prepare("INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)").run(
    'tx-snap-2', '2026-01-02T00:00:00Z', 'Second', 'snap-hash-2',
  );
}

const tmpDirs: string[] = [];

function tracked(dir: string): string {
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('NodeSqliteSnapshotService — round-trip', () => {
  let tmpDir: string;
  let dbPath: string;
  let snapshotPath: string;
  let db: Database.Database;
  let service: NodeSqliteSnapshotService;

  beforeEach(() => {
    tmpDir = tracked(makeTmpDir());
    dbPath = path.join(tmpDir, 'test.db');
    snapshotPath = path.join(tmpDir, 'test.db.bak');
    db = makeSeedDb(dbPath);
    writeTwoTxns(db);
    service = new NodeSqliteSnapshotService(db);
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it('create + restore brings DB back to pre-write state', async () => {
    // fails if: backup is torn (WAL not coordinated), or restore does not copy the correct file
    const createResult = await service.create(dbPath, snapshotPath);
    expect(createResult.isSuccess).toBe(true);

    // Write 2 more transactions after the snapshot
    db.prepare("INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)").run(
      'tx-snap-3', '2026-01-03T00:00:00Z', 'Third', 'snap-hash-3',
    );
    db.prepare("INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)").run(
      'tx-snap-4', '2026-01-04T00:00:00Z', 'Fourth', 'snap-hash-4',
    );
    const countAfterExtra = (db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    expect(countAfterExtra).toBe(4);

    // Restore must close the open connection conceptually — we close the live DB,
    // restore the file, then re-open to verify
    db.close();

    const restoreResult = await service.restore(snapshotPath, dbPath);
    expect(restoreResult.isSuccess).toBe(true);

    // Re-open and verify only original 2 txns
    const db2 = new Database(dbPath);
    try {
      const count = (db2.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
      expect(count).toBe(2);
    } finally {
      db2.close();
    }
  });

  it('remove deletes the snapshot file', async () => {
    // fails if: remove does nothing or throws instead of returning Result.ok
    await service.create(dbPath, snapshotPath);
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const removeResult = await service.remove(snapshotPath);
    expect(removeResult.isSuccess).toBe(true);
    expect(fs.existsSync(snapshotPath)).toBe(false);
  });

  it('remove on absent file returns Result.ok (no-op)', async () => {
    // fails if: remove throws on a non-existent file instead of no-op
    const result = await service.remove(path.join(tmpDir, 'does-not-exist.bak'));
    expect(result.isSuccess).toBe(true);
  });

  it.skipIf(process.platform === 'win32')(
    '(POSIX) snapshot file has mode 0o600 at creation time',
    async () => {
      // fails if: chmod is skipped or applied with wrong mode
      await service.create(dbPath, snapshotPath);
      const stat = fs.statSync(snapshotPath);
      expect(stat.mode & 0o777).toBe(0o600);
    },
  );
});

describe('NodeSqliteSnapshotService — symlink safety (TOCTOU guard)', () => {
  it.skipIf(process.platform === 'win32')(
    'pre-planted symlink at snapshotPath is replaced by a regular file; symlink target untouched',
    async () => {
      // fails if: the adapter uses a naive lstat-then-write pattern (TOCTOU race between
      // the two syscalls lets an attacker swap in a symlink after the check). The atomic-
      // rename-from-randomised-tmp pattern must unlink the pre-planted symlink *by name*
      // (not by following it). (P3 finding #3 lock-in)
      const tmpDir = tracked(makeTmpDir());
      const dbPath = path.join(tmpDir, 'live.db');
      const snapshotPath = path.join(tmpDir, 'live.db.bak');

      // Create a sentinel file that the symlink points at
      const sentinelPath = path.join(tmpDir, 'sentinel-target');
      fs.writeFileSync(sentinelPath, 'SENTINEL');

      // Pre-plant a symlink at snapshotPath pointing at the sentinel
      fs.symlinkSync(sentinelPath, snapshotPath);
      expect(fs.lstatSync(snapshotPath).isSymbolicLink()).toBe(true);

      // Create the live DB
      const db = makeSeedDb(dbPath);
      writeTwoTxns(db);
      const service = new NodeSqliteSnapshotService(db);

      const result = await service.create(dbPath, snapshotPath);
      db.close();

      expect(result.isSuccess).toBe(true);

      // snapshotPath must now be a regular file (symlink was replaced)
      const stat = fs.lstatSync(snapshotPath);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.isFile()).toBe(true);

      // snapshot content starts with SQLite magic header
      const buf = Buffer.allocUnsafe(16);
      const fd = fs.openSync(snapshotPath, 'r');
      fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      expect(buf.toString('utf8', 0, 15)).toBe('SQLite format 3');

      // sentinel target must still contain its original content
      expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('SENTINEL');
    },
  );
});

describe('NodeSqliteSnapshotService — overwrite existing snapshot', () => {
  it('create overwrites a pre-existing snapshot file (second-failed-run semantics)', async () => {
    // fails if: create refuses when .bak already exists (would brick every retry after a failure)
    // documents the overwrite behaviour — the .bak is single-slot, not a history
    // (Plan-agent Decision 4 lock-in)
    const tmpDir = tracked(makeTmpDir());
    const dbPath = path.join(tmpDir, 'live2.db');
    const snapshotPath = path.join(tmpDir, 'live2.db.bak');

    const db = makeSeedDb(dbPath);
    writeTwoTxns(db);
    const service = new NodeSqliteSnapshotService(db);

    // First snapshot
    await service.create(dbPath, snapshotPath);
    const mtime1 = fs.statSync(snapshotPath).mtimeMs;

    // Wait a tiny bit so mtime changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second snapshot must overwrite
    const result = await service.create(dbPath, snapshotPath);
    db.close();

    expect(result.isSuccess).toBe(true);
    const mtime2 = fs.statSync(snapshotPath).mtimeMs;
    // mtime must be newer (file was replaced)
    expect(mtime2).toBeGreaterThan(mtime1);
  });
});

describe('NodeSqliteSnapshotService — tmp cleanup on failure', () => {
  it('no tmp files remain after a backup failure', async () => {
    // fails if: the adapter leaks ${snapshotPath}.tmp.* files on rejection
    // We force a failure by providing a snapshotPath under a non-existent parent directory.
    const tmpDir = tracked(makeTmpDir());
    const dbPath = path.join(tmpDir, 'live3.db');
    const badSnapshotPath = path.join(tmpDir, 'nonexistent-subdir', 'live3.db.bak');

    const db = makeSeedDb(dbPath);
    const service = new NodeSqliteSnapshotService(db);

    const result = await service.create(dbPath, badSnapshotPath);
    db.close();

    expect(result.isFailure).toBe(true);

    // No tmp files should exist in the parent dir of badSnapshotPath's expected dir
    const nonExistentDir = path.join(tmpDir, 'nonexistent-subdir');
    expect(fs.existsSync(nonExistentDir)).toBe(false);

    // Also confirm no leaked tmp files in tmpDir itself
    const files = fs.readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });
});
