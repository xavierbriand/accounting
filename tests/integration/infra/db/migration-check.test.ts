/**
 * Integration tests for assertMigrated — pre-flight migration check helper.
 *
 * Gherkin coverage:
 *   - "Fresh / unmigrated DB exits 2 with a friendly hint"
 *     (partial — unit-level probe of the helper; CLI subprocess test covers the full scenario)
 *
 * fails if: helper returns ok on an empty DB (migration guard would be bypassed),
 *   friendly message is missing key strings (user can't act on the hint),
 *   or stable call on a migrated DB suddenly returns failure (regression on repeated check).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { assertMigrated } from '../../../../src/infra/db/migration-check.js';
import { runMigrations } from '../../../../src/infra/db/migrator.js';

const dbs: Database.Database[] = [];

function makeEmptyDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  dbs.push(db);
  return db;
}

function makeMigratedDb(): Database.Database {
  const db = makeEmptyDb();
  runMigrations(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
});

describe('assertMigrated', () => {
  it('(a) empty DB (user_version=0) returns Result.fail with friendly YAML-authoritative hint', () => {
    // fails if: assertMigrated returns ok on an uninitialised DB
    //   (the migration guard would be bypassed, SqliteTransactionRepository constructor
    //    would throw a raw SqliteError that reaches the user as a stack trace)
    // story-maint-11: hint updated to not reference --db-path flag (YAML is authoritative)
    const db = makeEmptyDb();
    const dbPath = '/tmp/test-uninit.db';

    const result = assertMigrated(db, dbPath);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('database not initialised');
    expect(result.error).toContain(dbPath);
    expect(result.error).toContain("hint: run 'accounting migrate' first");
    expect(result.error).toContain('accounting.yaml');
    expect(result.error).not.toContain('--db-path');
  });

  it('(b) migrated DB (after runMigrations) returns Result.ok', () => {
    // fails if: assertMigrated incorrectly reads user_version or the pragma idiom
    //   differs from the migrator's own check — a migrated DB would be wrongly rejected
    const db = makeMigratedDb();
    const dbPath = '/tmp/test-migrated.db';

    const result = assertMigrated(db, dbPath);

    expect(result.isSuccess).toBe(true);
  });

  it('(c) calling assertMigrated twice on a migrated DB is stable — both return ok', () => {
    // fails if: assertMigrated modifies state or has side effects that cause
    //   the second call to behave differently from the first
    const db = makeMigratedDb();
    const dbPath = '/tmp/test-stable.db';

    const first = assertMigrated(db, dbPath);
    const second = assertMigrated(db, dbPath);

    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);
  });
});
