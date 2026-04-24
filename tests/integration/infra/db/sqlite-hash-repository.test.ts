/**
 * Integration tests for migration 003 + SqliteHashRepository.
 *
 * Gherkin coverage:
 *   - AC2: HashRepository returns only the subset of candidate hashes already in the ledger
 *   - migration 003 idempotent: re-running migrator is a no-op (ALTER TABLE would reject
 *     "duplicate column name" if the migrator fired twice)
 *   - candidate-count at and beyond SQLite's 999-variable floor:
 *     0, 1, 500, 999 → correct subset; 1000 → Result.fail with 999-limit hint
 *
 * fails if: migration 003 module does not exist, SqliteHashRepository does not exist,
 *           or listKnownHashes returns the wrong subset, silently drops candidates,
 *           or accepts 1000+ candidates without returning Result.fail
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteHashRepository } from '../../../../src/infra/db/repositories/sqlite-hash-repository.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function seedHashes(db: Database.Database, hashes: string[]): void {
  // Insert rows directly with idempotency_hash values to simulate prior write path.
  // No hash writes in Story 2.2 — integration tests seed the DB directly.
  const insert = db.prepare(
    "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)",
  );
  for (let i = 0; i < hashes.length; i++) {
    insert.run(`tx-seed-${i}`, '2026-04-20T00:00:00+00:00', `Seeded transaction ${i}`, hashes[i]);
  }
}

describe('migration 003 (idempotency_hash column) + migration 004 (NOT NULL)', () => {
  it('adds the idempotency_hash column on a fresh DB (user_version 0→4 after all migrations)', () => {
    // fails if: migration 003 does not exist, or the migrator skips it
    // Note: full migration run now goes to user_version 4 (migration 004 tightens NOT NULL)
    const db = freshDb();
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(4);

    // Column must exist and be NOT NULL (migration 004)
    const cols = db.pragma('table_info(transactions)') as { name: string; notnull: number }[];
    const hashCol = cols.find((c) => c.name === 'idempotency_hash');
    expect(hashCol).toBeDefined();
    expect(hashCol!.notnull).toBe(1);
    db.close();
  });

  it('re-running migrator is a no-op (user_version stays 4 after two runs)', () => {
    // fails if: the migrator does not gate on user_version — SQLite would throw
    // "duplicate column name: idempotency_hash" if ALTER TABLE fired twice
    const db = freshDb();
    runMigrations(db); // first run: 0→4
    expect(() => runMigrations(db)).not.toThrow(); // second run: no-op
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(4);
    db.close();
  });
});

describe('SqliteHashRepository.listKnownHashes', () => {
  let db: Database.Database;
  let repo: SqliteHashRepository;

  beforeEach(() => {
    db = freshDb();
    runMigrations(db);
    repo = new SqliteHashRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns an empty set when ledger is empty and candidates is empty', () => {
    // fails if: the repository crashes on empty input
    const result = repo.listKnownHashes([]);
    expect(result.isSuccess).toBe(true);
    expect(result.value.size).toBe(0);
  });

  it('returns an empty set when ledger has hashes but no candidates are provided', () => {
    seedHashes(db, ['h1', 'h2', 'h3']);
    const result = repo.listKnownHashes([]);
    expect(result.isSuccess).toBe(true);
    expect(result.value.size).toBe(0);
  });

  it('returns an empty set when no candidates exist in the ledger', () => {
    seedHashes(db, ['h1', 'h2', 'h3']);
    const result = repo.listKnownHashes(['h4', 'h5', 'h6']);
    expect(result.isSuccess).toBe(true);
    expect(result.value.size).toBe(0);
  });

  it('AC2: returns exactly the subset of candidates that exist in the ledger', () => {
    // fails if: the repository returns all hashes in the ledger regardless of query,
    //           returns hashes that do not exist, or omits a hash that does exist
    seedHashes(db, ['h1', 'h2', 'h3']);
    const result = repo.listKnownHashes(['h1', 'h4', 'h5', 'h2', 'h6']);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(new Set(['h1', 'h2']));
  });

  it('returns all candidates when all exist in the ledger (1 candidate)', () => {
    seedHashes(db, ['known-hash']);
    const result = repo.listKnownHashes(['known-hash']);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toEqual(new Set(['known-hash']));
  });

  it('handles 500 candidates correctly — returns the subset that exists', () => {
    // Seed 250 known hashes, query with 500 (250 known + 250 unknown)
    const knownHashes = Array.from({ length: 250 }, (_, i) => `known-${i}`);
    const unknownHashes = Array.from({ length: 250 }, (_, i) => `unknown-${i}`);
    seedHashes(db, knownHashes);

    const candidates = [...knownHashes, ...unknownHashes];
    expect(candidates).toHaveLength(500);

    const result = repo.listKnownHashes(candidates);
    expect(result.isSuccess).toBe(true);
    expect(result.value.size).toBe(250);
    for (const h of knownHashes) {
      expect(result.value.has(h)).toBe(true);
    }
  });

  it('handles 999 candidates correctly — boundary of the defensive cap', () => {
    // fails if: the defensive cap incorrectly rejects 999 (which is the allowed max)
    const knownHashes = Array.from({ length: 100 }, (_, i) => `known-${i}`);
    seedHashes(db, knownHashes);

    const candidates = [
      ...knownHashes,
      ...Array.from({ length: 899 }, (_, i) => `unknown-${i}`),
    ];
    expect(candidates).toHaveLength(999);

    const result = repo.listKnownHashes(candidates);
    expect(result.isSuccess).toBe(true);
    expect(result.value.size).toBe(100);
  });

  it('returns Result.fail for 1000+ candidates (defensive 999-variable cap)', () => {
    // fails if: we silently drop the 1000th candidate (silent data loss),
    //           or mis-cap (999 works, 1000 should fail defensively)
    const candidates = Array.from({ length: 1000 }, (_, i) => `candidate-${i}`);
    const result = repo.listKnownHashes(candidates);
    expect(result.isFailure).toBe(true);
    // Error should hint at the 999-variable SQLite limit
    expect(result.error).toContain('999');
  });

  it('UNIQUE constraint rejects duplicate idempotency_hash values', () => {
    // fails if: migration 003 does not add the UNIQUE constraint
    const insert = db.prepare(
      "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)",
    );
    insert.run('tx-unique-1', '2026-04-20T00:00:00+00:00', 'test 1', 'duplicate-hash');
    expect(() => {
      insert.run('tx-unique-2', '2026-04-20T00:00:00+00:00', 'test 2', 'duplicate-hash');
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('rejects NULL idempotency_hash (NOT NULL enforced after migration 004)', () => {
    // fails if: migration 004 did not tighten the column to NOT NULL
    // (prior to 004, NULLs were allowed; this replaces the old "allows multiple NULLs" test)
    const insert = db.prepare(
      "INSERT INTO transactions (id, occurred_at, description) VALUES (?, ?, ?)",
    );
    expect(() => {
      insert.run('tx-null-1', '2026-04-20T00:00:00+00:00', 'test null 1');
    }).toThrow(/NOT NULL constraint failed/);
  });
});
