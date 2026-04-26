import fs from 'fs';
import Database from 'better-sqlite3';

let dbInstance: Database.Database | null = null;
let dbOpenedPath: string | null = null;

export function getDb(dbPath: string): Database.Database {
  if (dbInstance) {
    if (dbOpenedPath !== dbPath) {
      throw new Error('getDb: already opened with a different path; call closeDb() first');
    }
    return dbInstance;
  }
  const isNewFile = dbPath !== ':memory:' && !fs.existsSync(dbPath);
  dbInstance = new Database(dbPath);
  dbOpenedPath = dbPath;
  // WAL mode defaults to synchronous = FULL, satisfying NFR7 (>= NORMAL).
  dbInstance.pragma('journal_mode = WAL');
  // Enforce FK constraints at the connection level (defense-in-depth).
  dbInstance.pragma('foreign_keys = ON');
  // 5-second busy-wait prevents spurious SQLITE_BUSY during snapshot+commit
  // concurrency introduced in Story 2.5.
  dbInstance.pragma('busy_timeout = 5000');
  if (isNewFile && process.platform !== 'win32') {
    fs.chmodSync(dbPath, 0o600);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbOpenedPath = null;
  }
}
