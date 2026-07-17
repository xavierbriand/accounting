/**
 * Integration tests for SqliteConfigStateStore (real SQLite) — story-4.5a, FR23.
 *
 * Gherkin coverage: none directly (store-level mechanics) — see
 *   docs/plans/story-4.5a.md "Verification plan".
 *
 * fails if: getLast() does not return null before any save(), save() does not persist a
 *   round-trippable canonical/digest pair, or a second save() fails instead of updating the
 *   single row in place (the config_state table is a singleton, not an append log).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteConfigStateStore } from '../../../../src/infra/db/repositories/sqlite-config-state-store.js';

const dbs: Database.Database[] = [];

function makeMigratedDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
});

describe('SqliteConfigStateStore', () => {
  it('getLast() returns Result.ok(null) before any save()', () => {
    const db = makeMigratedDb();
    const store = new SqliteConfigStateStore(db);

    const result = store.getLast();
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBeNull();
  });

  it('save() then getLast() round-trips canonical + digest', () => {
    const db = makeMigratedDb();
    const store = new SqliteConfigStateStore(db);

    const saveResult = store.save({ canonical: '{"defaultCurrency":"EUR"}', digest: 'digest-1' });
    expect(saveResult.isSuccess).toBe(true);

    const getResult = store.getLast();
    expect(getResult.isSuccess).toBe(true);
    expect(getResult.value).toEqual({ canonical: '{"defaultCurrency":"EUR"}', digest: 'digest-1' });
  });

  it('a second save() updates the single row in place (singleton, not an append log)', () => {
    const db = makeMigratedDb();
    const store = new SqliteConfigStateStore(db);

    store.save({ canonical: '{"a":1}', digest: 'digest-1' });
    const secondSave = store.save({ canonical: '{"a":2}', digest: 'digest-2' });
    expect(secondSave.isSuccess).toBe(true);

    const row = db.prepare('SELECT COUNT(*) as n FROM config_state').get() as { n: number };
    expect(row.n).toBe(1);

    const getResult = store.getLast();
    expect(getResult.value).toEqual({ canonical: '{"a":2}', digest: 'digest-2' });
  });
});
