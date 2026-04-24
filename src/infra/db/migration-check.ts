import type Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';

export function assertMigrated(db: Database.Database, dbPath: string): Result<void> {
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion === 0) {
    return Result.fail(
      `database not initialised at ${dbPath}\n` +
      `hint: run 'accounting migrate --db-path ${dbPath}' first`,
    );
  }
  return Result.ok(undefined);
}
