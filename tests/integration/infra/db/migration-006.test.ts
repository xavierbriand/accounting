/**
 * Integration tests for migration 006 — corrects_id + kind columns (Story 4.2a, FR14).
 *
 * Gherkin coverage: none directly (store-level mechanics, not user-observable behaviour) —
 *   see docs/plans/story-4.2a.md "Verification plan" § Migration idempotency.
 *
 * fails if: migration 006 does not execute, PRAGMA user_version is not bumped to 6,
 *   the corrects_id/kind columns are missing or mistyped, the kind CHECK constraint
 *   accepts an invalid value, the default kind is not 'original', or the migrator
 *   re-runs the migration on a second call (idempotency guard regression).
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

describe('migration 006 — corrects_id + kind columns', () => {
  it('(a) user_version advances to 6 and the transactions table gains corrects_id + kind', () => {
    const db = makeFreshDb();
    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(6);

    const columns = db.prepare('PRAGMA table_info(transactions)').all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.has('corrects_id')).toBe(true);
    expect(byName.get('corrects_id')?.notnull).toBe(0);

    expect(byName.get('kind')?.notnull).toBe(1);
    expect(byName.get('kind')?.dflt_value).toBe("'original'");
  });

  it('(b) running migrations a second time at v6 is a no-op (idempotent)', () => {
    const db = makeFreshDb();
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(6);

    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(6);
  });

  it('(c) kind defaults to \'original\' for a plain insert that omits it', () => {
    const db = makeFreshDb();
    runMigrations(db);

    db.prepare(
      "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-1', '2026-01-01T00:00:00Z', 'test', 'hash-1')",
    ).run();

    const row = db.prepare('SELECT kind, corrects_id FROM transactions WHERE id = ?').get('tx-1') as {
      kind: string;
      corrects_id: string | null;
    };
    expect(row.kind).toBe('original');
    expect(row.corrects_id).toBeNull();
  });

  it('(d) kind CHECK constraint rejects a value outside original/reversal/correcting', () => {
    const db = makeFreshDb();
    runMigrations(db);

    expect(() => {
      db.prepare(
        "INSERT INTO transactions (id, occurred_at, description, idempotency_hash, kind) VALUES ('tx-2', '2026-01-01T00:00:00Z', 'test', 'hash-2', 'bogus')",
      ).run();
    }).toThrow(/CHECK constraint failed/);
  });

  it('(e) corrects_id FK rejects a dangling reference to a non-existent transaction', () => {
    const db = makeFreshDb();
    runMigrations(db);

    expect(() => {
      db.prepare(
        "INSERT INTO transactions (id, occurred_at, description, idempotency_hash, kind, corrects_id) VALUES ('tx-3', '2026-01-01T00:00:00Z', 'test', 'hash-3', 'reversal', 'does-not-exist')",
      ).run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
});
