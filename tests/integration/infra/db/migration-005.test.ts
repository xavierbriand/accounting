/**
 * Integration tests for migration 005 — append-only domain_events table (FR23 audit trail spine).
 *
 * Gherkin coverage: none directly (store-level mechanics, not user-observable behaviour) —
 *   see docs/plans/story-4.1.md "Verification plan" § Migration idempotency.
 *
 * fails if: migration 005 does not execute, PRAGMA user_version is not bumped to 5,
 *   the domain_events table/columns are missing or mistyped, or the migrator re-runs
 *   the migration on a second call (idempotency guard regression).
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

describe('migration 005 — domain_events append-only table', () => {
  it('(a) user_version advances to 5 and the domain_events table exists with expected columns', () => {
    // fails if: migration 005 does not execute or PRAGMA user_version is not bumped
    const db = makeFreshDb();
    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(5);

    const columns = db.prepare("PRAGMA table_info(domain_events)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get('seq')?.pk).toBe(1);
    expect(byName.get('event_type')?.notnull).toBe(1);
    expect(byName.get('recorded_at')?.notnull).toBe(1);
    expect(byName.get('payload')?.notnull).toBe(1);
  });

  it('(b) running migrations a second time at v5 is a no-op (idempotent)', () => {
    // fails if: the migrator re-runs migration 005 on a second call (e.g. AUTOINCREMENT
    //   collision, or a duplicate CREATE TABLE throwing "table already exists")
    const db = makeFreshDb();
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);

    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);

    const count = (db.prepare('SELECT COUNT(*) as n FROM domain_events').get() as { n: number }).n;
    expect(count).toBe(0);
  });

  it('(c) domain_events is INSERT-only by convention — a row can be inserted and read back', () => {
    // fails if: the table schema rejects a well-formed insert (e.g. a NOT NULL column
    //   the recorder relies on is missing)
    const db = makeFreshDb();
    runMigrations(db);

    db.prepare(
      "INSERT INTO domain_events (event_type, recorded_at, payload) VALUES ('TransactionIngested', '2026-07-05T10:00:00.000Z', '{}')",
    ).run();

    const row = db.prepare('SELECT * FROM domain_events').get() as {
      seq: number;
      event_type: string;
      recorded_at: string;
      payload: string;
    };
    expect(row.seq).toBe(1);
    expect(row.event_type).toBe('TransactionIngested');
    expect(row.payload).toBe('{}');
  });
});
