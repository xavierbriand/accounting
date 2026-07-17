import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import type { ConfigStateStore, StoredConfigState } from '@core/ports/config-state-store.js';

export class SqliteConfigStateStore implements ConfigStateStore {
  constructor(private readonly db: Database.Database) {}

  getLast(): Result<StoredConfigState | null> {
    try {
      const row = this.db
        .prepare<[], { canonical: string; digest: string }>('SELECT canonical, digest FROM config_state WHERE id = 1')
        .get();
      return Result.ok(row === undefined ? null : { canonical: row.canonical, digest: row.digest });
    } catch (err) {
      return Result.fail(String(err));
    }
  }

  save(state: StoredConfigState): Result<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO config_state (id, canonical, digest) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET canonical = excluded.canonical, digest = excluded.digest`,
        )
        .run(state.canonical, state.digest);
      return Result.ok();
    } catch (err) {
      return Result.fail(String(err));
    }
  }
}
