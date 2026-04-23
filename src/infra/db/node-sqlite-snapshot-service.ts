import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';

export class NodeSqliteSnapshotService implements SnapshotService {
  constructor(private readonly db: Database.Database) {}

  async create(dbPath: string, snapshotPath: string): Promise<Result<void>> {
    // Atomic-rename-from-randomised-tmp pattern (P3 finding #3):
    // Never lstat-then-backup — that has a TOCTOU race window where an attacker
    // can swap a symlink between the two syscalls.
    // Instead: backup to a randomised tmp path (not guessable), chmod, then rename.
    // renameSync replaces any pre-existing file or symlink at snapshotPath *by name*
    // without following the symlink's target — neutralising a pre-planted symlink.
    const tmpPath = `${snapshotPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;

    try {
      await this.db.backup(tmpPath);
    } catch (err) {
      // Clean up any partial tmp file
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      }
      return Result.fail(String(err));
    }

    try {
      // Windows has no POSIX permission model — the chmod skip is intentional, not a bug.
      if (process.platform !== 'win32') {
        fs.chmodSync(tmpPath, 0o600);
      }
      // Atomic replace: unlinks any pre-existing file or symlink at snapshotPath by name
      fs.renameSync(tmpPath, snapshotPath);
      return Result.ok();
    } catch (err) {
      // Clean up tmp on rename/chmod failure
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      }
      return Result.fail(String(err));
    }
  }

  async restore(snapshotPath: string, dbPath: string): Promise<Result<void>> {
    try {
      fs.copyFileSync(snapshotPath, dbPath);
      return Result.ok();
    } catch (err) {
      return Result.fail(String(err));
    }
  }

  async remove(snapshotPath: string): Promise<Result<void>> {
    try {
      if (fs.existsSync(snapshotPath)) {
        fs.unlinkSync(snapshotPath);
      }
      return Result.ok();
    } catch (err) {
      return Result.fail(String(err));
    }
  }
}
