import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './sqlite-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(dbPath: string) {
  const db = getDb(dbPath);
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found at ${migrationsDir}`);
    return;
  }

  // Get current version
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  console.log(`Current DB version: ${userVersion}`);

  // Get migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Ensure 001 comes before 002

  let executedCount = 0;

  for (const file of files) {
    const versionMatch = file.match(/^(\d+)-/);
    if (!versionMatch) {
      console.warn(`Skipping invalid migration filename: ${file}`);
      continue;
    }

    const fileVersion = parseInt(versionMatch[1], 10);

    if (fileVersion > userVersion) {
      console.log(`Running migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      const runMigration = db.transaction(() => {
        db.exec(sql);
        db.pragma(`user_version = ${fileVersion}`);
      });

      try {
        runMigration();
        console.log(`Successfully applied migration ${fileVersion}`);
        executedCount++;
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      }
    }
  }

  if (executedCount === 0) {
    console.log('Database is up to date.');
  } else {
    console.log(`Applied ${executedCount} migrations.`);
  }
}
