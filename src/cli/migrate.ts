import { runMigrations } from '../infra/db/migrator.js';
import path from 'path';

const dbPath = path.resolve('accounting.db');

console.log('Starting migration...');
try {
  runMigrations(dbPath);
  console.log('Migration completed successfully.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
