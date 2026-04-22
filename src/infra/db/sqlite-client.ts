import fs from 'fs';
import Database from 'better-sqlite3';

let dbInstance: Database.Database | null = null;

export function getDb(dbPath: string = 'accounting.db'): Database.Database {
  if (!dbInstance) {
    const isNewFile = dbPath !== ':memory:' && !fs.existsSync(dbPath);
    dbInstance = new Database(dbPath);
    // WAL mode defaults to synchronous = FULL, satisfying NFR7 (>= NORMAL).
    dbInstance.pragma('journal_mode = WAL');
    // Enforce FK constraints at the connection level (defense-in-depth).
    dbInstance.pragma('foreign_keys = ON');
    if (isNewFile && process.platform !== 'win32') {
      fs.chmodSync(dbPath, 0o600);
    }
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
