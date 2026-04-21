import path from 'path';
import { getDb } from '../infra/db/sqlite-client.js';
import { runMigrations } from '../infra/db/migrator.js';

const db = getDb(path.resolve('accounting.db'));
try {
  runMigrations(db);
  console.log('Migration completed successfully.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
