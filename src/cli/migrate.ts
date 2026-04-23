import path from 'path';
import { getDb } from '../infra/db/sqlite-client.js';
import { runMigrations } from '../infra/db/migrator.js';

export function runMigrate(dbPath: string): void {
  const db = getDb(path.resolve(dbPath));
  try {
    runMigrations(db);
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrate('accounting.db');
}
