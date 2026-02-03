import Database from 'better-sqlite3';

let dbInstance: Database.Database | null = null;

export function getDb(dbPath: string = 'accounting.db'): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
    // Enable WAL mode for better concurrency
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
