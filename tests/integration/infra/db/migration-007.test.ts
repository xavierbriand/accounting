/**
 * Integration tests for migration 007 — config_state table (story-4.5a, FR23).
 *
 * Gherkin coverage: none directly (store-level mechanics, not user-observable behaviour) —
 *   see docs/plans/story-4.5a.md "Verification plan" § Migration idempotency.
 *
 * fails if: migration 007 does not execute, PRAGMA user_version is not bumped to 7, the
 *   config_state table or its canonical/digest NOT NULL columns are missing, the id
 *   CHECK(id = 1) singleton constraint accepts a second row, or the migrator re-runs the
 *   migration on a second call (idempotency guard regression).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';

const dbs: Database.Database[] = [];

function makeFreshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
});

describe('migration 007 — config_state table', () => {
  it('(a) user_version advances to 7 and config_state gains id/canonical/digest', () => {
    const db = makeFreshDb();
    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(7);

    const columns = db.prepare('PRAGMA table_info(config_state)').all() as Array<{
      name: string;
      notnull: number;
      pk: number;
    }>;
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get('id')?.pk).toBe(1);
    expect(byName.get('canonical')?.notnull).toBe(1);
    expect(byName.get('digest')?.notnull).toBe(1);
  });

  it('(b) running migrations a second time at v7 is a no-op (idempotent)', () => {
    const db = makeFreshDb();
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(7);

    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(7);
  });

  it('(c) id CHECK(id = 1) rejects a second row', () => {
    const db = makeFreshDb();
    runMigrations(db);

    db.prepare('INSERT INTO config_state (id, canonical, digest) VALUES (1, ?, ?)').run('{}', 'hash-1');

    expect(() => {
      db.prepare('INSERT INTO config_state (id, canonical, digest) VALUES (2, ?, ?)').run('{}', 'hash-2');
    }).toThrow(/CHECK constraint failed/);
  });

  it('(d) canonical and digest reject NULL', () => {
    const db = makeFreshDb();
    runMigrations(db);

    expect(() => {
      db.prepare('INSERT INTO config_state (id, canonical, digest) VALUES (1, NULL, ?)').run('hash-1');
    }).toThrow(/NOT NULL constraint failed/);
  });
});
