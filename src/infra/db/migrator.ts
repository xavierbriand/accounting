import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(db: Database.Database): void {
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
      const migrationSql = fs.readFileSync(filePath, 'utf-8');

      // PRAGMA foreign_keys is a no-op inside a transaction — it must be toggled
      // outside the migration's own db.transaction(). This is defense-in-depth for all
      // migrations: rebuilds (like 004) need FK enforcement OFF to DROP TABLE without
      // cascading into child tables. We restore the prior value in finally.
      const priorFk = db.pragma('foreign_keys', { simple: true }) as number;
      db.pragma('foreign_keys = OFF');

      try {
        const runMigration = db.transaction(() => {
          db.exec(migrationSql);
          // PRAGMA foreign_key_check runs INSIDE the transaction (P3 finding #4):
          // if the check fails, the whole transaction rolls back — including the
          // PRAGMA user_version bump inside the SQL — leaving the DB cleanly at
          // its prior version.
          const fkIssues = db.pragma('foreign_key_check') as unknown[];
          if (fkIssues.length > 0) {
            throw new Error(`Migration ${file}: foreign_key_check returned ${fkIssues.length} issue(s)`);
          }
        });

        runMigration();
        console.log(`Successfully applied migration ${fileVersion}`);
        executedCount++;
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      } finally {
        // Restore prior FK enforcement regardless of success or failure
        if (priorFk === 1) db.pragma('foreign_keys = ON');
      }
    }
  }

  if (executedCount === 0) {
    console.log('Database is up to date.');
  } else {
    console.log(`Applied ${executedCount} migrations.`);
  }
}
