import { getDb } from '../infra/db/sqlite-client.js';
import { runMigrations } from '../infra/db/migrator.js';

export function runMigrate(resolvedDbPath: string): void {
  const db = getDb(resolvedDbPath);
  try {
    runMigrations(db);
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
