/**
 * Integration tests for migration 004 — idempotency_hash NOT NULL tightening.
 *
 * Gherkin coverage:
 *   - "migration 004 — tightens idempotency_hash to NOT NULL"
 *   - "migration 004 is idempotent"
 *   - "migration 004 preserves children under foreign_keys=OFF toggle"
 *   - FK-check inside tx rolls back version on failure (P3 #4 lock-in)
 *
 * fails if: rebuild drops the UNIQUE attribute (Story 2.2 dedup would silently break),
 *   NULL inserts still succeed, FK check surfaces orphaned child rows, runner loses the
 *   version guard and re-runs the rebuild, migrator forgets the PRAGMA foreign_keys toggle
 *   (silent cascade-delete), or PRAGMA foreign_key_check runs outside the transaction
 *   (user_version would then be bumped even on a broken schema).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../../../../src/infra/db/migrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a fresh in-memory DB at user_version 3 (post-migration-003 schema).
// We cannot call runMigrations() here because that would run migration 004;
// instead we manually apply migrations 001–003 SQL directly.
function makeV3Db(): Database.Database {
  const db = new Database(':memory:');
  // Enable WAL + FK for realism (same as production path)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Migration 001 (test stub — just sets user_version 1)
  const migrations001Path = path.join(__dirname, '../../../../src/infra/db/migrations/001-initial-test.sql');
  const migrations002Path = path.join(__dirname, '../../../../src/infra/db/migrations/002-ledger.sql');
  const migrations003Path = path.join(__dirname, '../../../../src/infra/db/migrations/003-idempotency-hash.sql');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  db.exec(fs.readFileSync(migrations001Path, 'utf-8'));
  db.exec(fs.readFileSync(migrations002Path, 'utf-8'));
  db.exec(fs.readFileSync(migrations003Path, 'utf-8'));
  // user_version is now 3
  return db;
}

const dbs: Database.Database[] = [];

function tracked<T extends Database.Database>(db: T): T {
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
});

describe('migration 004 — idempotency_hash NOT NULL tightening', () => {
  it('(a) user_version advances from 3 to 4 after running migrations', () => {
    // fails if: migration 004 does not execute or PRAGMA user_version is not bumped
    const db = tracked(makeV3Db());
    expect(db.pragma('user_version', { simple: true })).toBe(3);

    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(4);
  });

  it('(b) INSERT with idempotency_hash = NULL fails after migration', () => {
    // fails if: NOT NULL constraint is not in place after the rebuild
    const db = tracked(makeV3Db());
    runMigrations(db);

    expect(() => {
      db.prepare(
        "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-null', '2026-01-01T00:00:00Z', 'test', NULL)",
      ).run();
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('(c) unique index is recreated as UNIQUE after rebuild', () => {
    // fails if: ALTER TABLE rebuild creates a plain (non-unique) index
    //           (Story 2.2 dedup would silently break — multiple rows with same hash)
    const db = tracked(makeV3Db());
    runMigrations(db);

    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_transactions_idempotency_hash'",
      )
      .get() as { sql: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.sql.toUpperCase()).toContain('UNIQUE');
  });

  it('(d) PRAGMA foreign_key_check returns zero rows after migration', () => {
    // fails if: the rebuild breaks FK integrity (orphaned transaction_entries rows)
    const db = tracked(makeV3Db());
    runMigrations(db);

    const issues = db.pragma('foreign_key_check') as unknown[];
    expect(issues).toHaveLength(0);
  });

  it('(e) running migrations a second time at v4 is a no-op (idempotent)', () => {
    // fails if: runner loses the version guard and re-runs the rebuild
    const db = tracked(makeV3Db());
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(4);

    // Second call must be a no-op
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(4);

    // Schema is still valid
    expect(() => {
      db.prepare(
        "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-1', '2026-01-01T00:00:00Z', 'test', NULL)",
      ).run();
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('(f) rebuild preserves children under FK-off toggle — 1 tx + 2 entries survive', () => {
    // fails if: migrator forgets PRAGMA foreign_keys = OFF before the DROP TABLE
    //   (the FK constraint would cascade-delete transaction_entries, silently destroying data)
    //   This is Plan-agent Decision 3 lock-in — the critical-bug guard.
    const db = tracked(makeV3Db());

    // Seed v3 DB with 1 transaction + 2 entries (idempotency_hash set to satisfy NOT NULL later)
    // Note: at v3 the column is nullable; we set a non-null value so the INSERT SELECT succeeds
    db.prepare(
      "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-seed', '2026-01-01T00:00:00Z', 'seed', 'hash-seed')",
    ).run();
    db.prepare(
      "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('tx-seed', 'Expense:Test', 'debit', 1000, 'EUR')",
    ).run();
    db.prepare(
      "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('tx-seed', 'Assets:Bank:main', 'credit', 1000, 'EUR')",
    ).run();

    runMigrations(db);

    // Transaction must survive
    const tx = db
      .prepare('SELECT id, idempotency_hash FROM transactions WHERE id = ?')
      .get('tx-seed') as { id: string; idempotency_hash: string } | undefined;
    expect(tx).toBeDefined();
    expect(tx!.idempotency_hash).toBe('hash-seed');

    // Both entries must survive
    const entries = db
      .prepare('SELECT * FROM transaction_entries WHERE transaction_id = ?')
      .all('tx-seed');
    expect(entries).toHaveLength(2);

    // FK check confirms referential integrity
    const fkIssues = db.pragma('foreign_key_check') as unknown[];
    expect(fkIssues).toHaveLength(0);
  });

  it('(g) FK-check failure inside tx rolls back user_version (P3 #4 lock-in)', () => {
    // fails if: PRAGMA foreign_key_check runs OUTSIDE the migration's db.transaction():
    //   in that case, the user_version would be bumped to 4 even when FK integrity is broken,
    //   leaving the DB in a half-migrated state. This test verifies the check rolls back
    //   atomically with the DDL + user_version bump.
    //
    // Approach: seed a v3 DB with an orphaned transaction_entries row (no matching transaction).
    // Migration 004 drops+rebuilds the transactions table. After the rebuild, the orphaned
    // transaction_entries row has a transaction_id that references a non-existent transactions
    // row — PRAGMA foreign_key_check detects this and the migrator must throw.
    // Because the FK check runs INSIDE db.transaction(), both the schema change AND the
    // user_version bump roll back atomically. user_version must remain 3.
    const db = tracked(makeV3Db());

    // Directly insert an orphaned entry (transaction_id does not exist in transactions)
    db.pragma('foreign_keys = OFF');
    db.prepare(
      "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('ghost-tx', 'Expense:Test', 'debit', 100, 'EUR')",
    ).run();
    db.pragma('foreign_keys = ON');

    // Running migration 004 must FAIL: after DROP TABLE transactions + rename transactions_new,
    // the orphaned entry in transaction_entries has no parent → PRAGMA foreign_key_check finds it.
    // The migrator throws, the transaction rolls back → user_version stays 3.
    expect(() => runMigrations(db)).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });
});
