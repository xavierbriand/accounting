import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fc from 'fast-check';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { getDb, closeDb } from '../../../../src/infra/db/sqlite-client.js';
import { SqliteTransactionRepository } from '../../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { Transaction } from '@core/ledger/transaction.js';
import { Money } from '@core/shared/money.js';
import type { BuildOutcome } from '@core/ingest/types.js';

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeBalancedTx(id: string): Transaction {
  return Transaction.create({
    id,
    occurredAt: '2026-04-21T14:30:00+02:00',
    description: 'Transport',
    entries: [
      { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
}

describe('SqliteTransactionRepository', () => {
  let db: Database.Database;
  let repo: SqliteTransactionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new SqliteTransactionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('save + findById round-trip preserves all fields', () => {
    const tx = makeBalancedTx('tx-round-trip');
    const saveResult = repo.save(tx);

    expect(saveResult.isSuccess).toBe(true);

    const findResult = repo.findById('tx-round-trip');
    expect(findResult.isSuccess).toBe(true);
    const found = findResult.value;
    expect(found).not.toBeNull();
    expect(found!.id).toBe('tx-round-trip');
    expect(found!.occurredAt).toBe('2026-04-21T14:30:00+02:00');
    expect(found!.description).toBe('Transport');
    expect(found!.entries).toHaveLength(2);
    expect(found!.entries[0].account).toBe('Expense:Transport');
    expect(found!.entries[0].side).toBe('debit');
    expect(found!.entries[0].amount.amount).toBe(2000);
    expect(found!.entries[0].amount.currency).toBe('EUR');
  });

  it('findById returns Result.ok(null) for unknown id', () => {
    const result = repo.findById('does-not-exist');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBeNull();
  });

  describe('Schema CHECK constraints', () => {
    it('rejects 4-char currency (CHECK length(currency)=3)', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('no-tx','a','debit',100,'EURO')",
        ).run();
      }).toThrow(/CHECK constraint failed/);
    });

    it('rejects negative amount_cents (CHECK amount_cents >= 0)', () => {
      db.prepare(
        "INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-neg','2026-01-01T00:00:00Z','test','hash-tx-neg')",
      ).run();
      expect(() => {
        db.prepare(
          "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('tx-neg','a','debit',-1,'EUR')",
        ).run();
      }).toThrow(/CHECK constraint failed/);
    });

    it('rejects unknown side value (CHECK side IN (...))', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('no-tx','a','split',100,'EUR')",
        ).run();
      }).toThrow(/CHECK constraint failed/);
    });
  });

  describe('Foreign key enforcement', () => {
    it('rejects an entry whose transaction_id does not exist', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('ghost-id','a','debit',100,'EUR')",
        ).run();
      }).toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  describe('Atomic save', () => {
    it('leaves zero rows when a CHECK failure occurs mid-save', () => {
      const txId = 'tx-atomic';
      db.prepare(
        `INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('${txId}','2026-01-01T00:00:00Z','test','hash-${txId}')`,
      ).run();

      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('${txId}','a','debit',100,'EUR')`,
          ).run();
          // This insert will fail: EURO has 4 chars
          db.prepare(
            `INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES ('${txId}','b','credit',100,'EURO')`,
          ).run();
        })();
      } catch {
        // expected
      }

      // Because we wrapped in a transaction, the header row is still there (we inserted it directly)
      // but the entries should be absent
      const entries = db
        .prepare("SELECT * FROM transaction_entries WHERE transaction_id = ?")
        .all(txId);
      expect(entries).toHaveLength(0);
    });

    it('save() is atomic under PK collision — original entries untouched', () => {
      // First save: should succeed
      const first = Transaction.create({
        id: 'tx-dup',
        occurredAt: '2026-04-21T14:30:00+02:00',
        description: 'Original',
        entries: [
          { account: 'Expense:Food', side: 'debit', amount: makeEur(1000) },
          { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(1000) },
        ],
      }).value;
      expect(repo.save(first).isSuccess).toBe(true);

      // Second save with same id: PK collision on the header INSERT must roll back
      const second = Transaction.create({
        id: 'tx-dup',
        occurredAt: '2026-04-21T15:00:00+02:00',
        description: 'Duplicate',
        entries: [
          { account: 'Expense:Other', side: 'debit', amount: makeEur(5000) },
          { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(5000) },
        ],
      }).value;
      const saveResult = repo.save(second);
      expect(saveResult.isFailure).toBe(true);

      // DB state must match the original tx exactly — no bleed from second attempt
      const found = repo.findById('tx-dup').value;
      expect(found).not.toBeNull();
      expect(found!.description).toBe('Original');
      expect(found!.entries).toHaveLength(2);
      expect(found!.entries[0].account).toBe('Expense:Food');
    });
  });

  describe('WAL mode', () => {
    it('getDb() configures WAL and foreign_keys on first open', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-test-'));
      closeDb(); // reset singleton so getDb() treats this path as first open
      try {
        const db = getDb(path.join(tmpDir, 'test.db'));
        runMigrations(db);

        expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
        expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      } finally {
        closeDb();
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('File permissions (NFR11)', () => {
    it.skipIf(process.platform === 'win32')(
      'getDb() chmods a newly-created DB file to 0o600 on POSIX',
      () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-chmod-test-'));
        closeDb();
        try {
          const dbPath = path.join(tmpDir, 'new.db');
          // fails if getDb() does not chmod a newly-created DB file to 0o600
          getDb(dbPath);
          const stat = fs.statSync(dbPath);
          expect(stat.mode & 0o777).toBe(0o600);
        } finally {
          closeDb();
          fs.rmSync(tmpDir, { recursive: true });
        }
      },
    );

    it.skipIf(process.platform === 'win32')(
      'getDb() leaves an existing DB file perms unchanged (0o644 stays 0o644 on POSIX)',
      () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-chmod-test-'));
        closeDb();
        try {
          const dbPath = path.join(tmpDir, 'existing.db');
          // Pre-create the file with 0o644 permissions
          fs.writeFileSync(dbPath, '');
          fs.chmodSync(dbPath, 0o644);
          // fails if getDb() modifies permissions on a pre-existing DB file
          getDb(dbPath);
          const stat = fs.statSync(dbPath);
          expect(stat.mode & 0o777).toBe(0o644);
        } finally {
          closeDb();
          fs.rmSync(tmpDir, { recursive: true });
        }
      },
    );
  });

  describe('Repository surface (type-level)', () => {
    it('exposes save and findById', () => {
      expect(typeof repo.save).toBe('function');
      expect(typeof repo.findById).toBe('function');
    });

    it('does not expose update or delete', () => {
      // @ts-expect-error — update should not exist on TransactionRepository
      expect(repo.update).toBeUndefined();
      // @ts-expect-error — delete should not exist on TransactionRepository
      expect(repo.delete).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // saveBatch tests (Story 2.5)
  // ---------------------------------------------------------------------------

  describe('saveBatch — Story 2.5', () => {
    function makeBuildOutcome(id: string, hash: string): BuildOutcome {
      return {
        transaction: Transaction.create({
          id,
          occurredAt: '2026-04-21T14:30:00+02:00',
          description: `Txn ${id}`,
          entries: [
            { account: 'Expense:Transport', side: 'debit', amount: makeEur(1000) },
            { account: 'Assets:Bank:main-1', side: 'credit', amount: makeEur(1000) },
          ],
        }).value,
        category: 'Transport',
        classification: 'expense',
        confidence: 'high',
        idempotencyHash: hash,
      };
    }

    it('(a) happy-path: 3 outcomes → 3 header rows with matching idempotency_hash + 6 entry rows', () => {
      // fails if: saveBatch does not exist, any hash is NULL, or entry count is wrong
      const outcomes = [
        makeBuildOutcome('tx-a1', 'hash-a1'),
        makeBuildOutcome('tx-a2', 'hash-a2'),
        makeBuildOutcome('tx-a3', 'hash-a3'),
      ];

      // saveBatch does not exist yet — this call will fail (expected red)
      const result = repo.saveBatch(outcomes);
      expect(result.isSuccess).toBe(true);
      expect(result.value.written).toBe(3);

      // Verify header rows + hash equality
      for (const outcome of outcomes) {
        const row = db.prepare('SELECT idempotency_hash FROM transactions WHERE id = ?').get(outcome.transaction.id) as { idempotency_hash: string } | undefined;
        expect(row).toBeDefined();
        expect(row!.idempotency_hash).toBe(outcome.idempotencyHash);
      }

      // 6 entry rows total
      const entryCount = (db.prepare('SELECT COUNT(*) as n FROM transaction_entries').get() as { n: number }).n;
      expect(entryCount).toBe(6);
    });

    it('(b) mid-batch Transaction invariant failure → entire batch rolled back', () => {
      // fails if: the first valid outcome is persisted while the second fails
      // Build a bad outcome by pre-inserting a duplicate id to force a PK collision
      const outcomes = [
        makeBuildOutcome('tx-b1', 'hash-b1'),
        makeBuildOutcome('tx-b2', 'hash-b2'),
        makeBuildOutcome('tx-b3', 'hash-b3'),
      ];
      // Pre-insert tx-b2 to force a UNIQUE/PK constraint on the second outcome
      db.prepare("INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-b2', '2026-01-01T00:00:00Z', 'pre', 'pre-hash-b2')").run();

      const result = repo.saveBatch(outcomes);
      expect(result.isFailure).toBe(true);

      // tx-b1 must NOT be in the DB (entire batch rolled back)
      const txB1 = db.prepare('SELECT id FROM transactions WHERE id = ?').get('tx-b1');
      expect(txB1).toBeUndefined();
      // entries must be zero for all three
      const entryCount = (db.prepare('SELECT COUNT(*) as n FROM transaction_entries WHERE transaction_id IN (?,?,?)').get('tx-b1', 'tx-b2', 'tx-b3') as { n: number }).n;
      expect(entryCount).toBe(0);
    });

    it('(c) duplicate hash within same batch → entire batch rolled back by UNIQUE index', () => {
      // fails if: saveBatch does not run inside a single SQL transaction
      const outcomes = [
        makeBuildOutcome('tx-c1', 'same-hash'),
        makeBuildOutcome('tx-c2', 'same-hash'), // UNIQUE violation
      ];

      const result = repo.saveBatch(outcomes);
      expect(result.isFailure).toBe(true);

      const rowCount = (db.prepare('SELECT COUNT(*) as n FROM transactions WHERE id IN (?,?)').get('tx-c1', 'tx-c2') as { n: number }).n;
      expect(rowCount).toBe(0);
    });

    it('(d) cross-batch hash collision (pre-existing hash in DB) → batch rolled back', () => {
      // fails if: UNIQUE index only prevents duplicates within a single batch
      db.prepare("INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES ('tx-existing', '2026-01-01T00:00:00Z', 'pre', 'existing-hash')").run();

      const outcomes = [
        makeBuildOutcome('tx-d1', 'new-hash-d1'),
        makeBuildOutcome('tx-d2', 'existing-hash'), // collides with pre-existing row
      ];

      const result = repo.saveBatch(outcomes);
      expect(result.isFailure).toBe(true);

      // tx-d1 must NOT be in the DB
      const txD1 = db.prepare('SELECT id FROM transactions WHERE id = ?').get('tx-d1');
      expect(txD1).toBeUndefined();
    });

    it('(e) property: saveBatch populates idempotency_hash 1:1 for every outcome', () => {
      // fails if: the INSERT binds idempotency_hash from the wrong outcome (off-by-one in loop),
      //   defaults to a placeholder, stores NULL, or writes the hash column out-of-order.
      // Core coverage invariant for hash-population (P3 finding #2 lock-in).
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `prop-${s}`),
              hash: fc.string({ minLength: 1, maxLength: 40 }).map((s) => `h-${s}`),
            }),
            { selector: (x) => x.id, minLength: 1, maxLength: 20 },
          ).chain((items) =>
            fc.constant(items.filter((_, i, arr) => {
              // deduplicate by hash too (unique hash required for UNIQUE index)
              const seen = new Set<string>();
              return !seen.has(arr[i].hash) && seen.add(arr[i].hash);
            }))
          ),
          (items) => {
            if (items.length === 0) return true;
            const db2 = new Database(':memory:');
            db2.pragma('foreign_keys = ON');
            runMigrations(db2);
            const repo2 = new SqliteTransactionRepository(db2);

            const outcomes: BuildOutcome[] = items.map(({ id, hash }) => makeBuildOutcome(id, hash));

            const result = repo2.saveBatch(outcomes);
            if (result.isFailure) {
              db2.close();
              return false; // unexpected failure
            }

            let allMatch = true;
            for (const outcome of outcomes) {
              const row = db2.prepare('SELECT idempotency_hash FROM transactions WHERE id = ?').get(outcome.transaction.id) as { idempotency_hash: string } | undefined;
              if (!row || row.idempotency_hash !== outcome.idempotencyHash) {
                allMatch = false;
                break;
              }
            }

            // Also check no NULL rows
            const nullCount = (db2.prepare('SELECT COUNT(*) as n FROM transactions WHERE idempotency_hash IS NULL').get() as { n: number }).n;
            db2.close();
            return allMatch && nullCount === 0;
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
