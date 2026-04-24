import type { Result } from '@core/shared/result.js';

export interface SnapshotService {
  // Create an atomic snapshot of the live SQLite DB at dbPath, written to snapshotPath.
  // Overwrites any existing file at snapshotPath (pre-empts a stale .bak from a crashed run).
  create(dbPath: string, snapshotPath: string): Promise<Result<void>>;

  // Restore dbPath from an earlier snapshotPath (file copy).
  // Not called on normal-path rollback (SQLite's db.transaction() wrapper handles that);
  // provided as an explicit recovery API and exercised by tests.
  restore(snapshotPath: string, dbPath: string): Promise<Result<void>>;

  // Delete a snapshot file. Called after a successful batch commit; no-op if absent.
  remove(snapshotPath: string): Promise<Result<void>>;
}
