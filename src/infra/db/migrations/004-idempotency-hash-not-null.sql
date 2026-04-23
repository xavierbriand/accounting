-- SQLite cannot ALTER COLUMN … SET NOT NULL directly.
-- Standard rebuild idiom: create new table with NOT NULL, copy data, drop old, rename new.
-- Runner wraps this in db.transaction() for atomicity.
-- Runner toggles PRAGMA foreign_keys = OFF around this transaction (see migrator.ts)
-- and runs PRAGMA foreign_key_check after the transaction commits.

-- Drop the old index first so the DROP TABLE below doesn't trip over it.
DROP INDEX IF EXISTS idx_transactions_idempotency_hash;

CREATE TABLE transactions_new (
    id TEXT PRIMARY KEY NOT NULL,
    occurred_at TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    idempotency_hash TEXT NOT NULL
);

INSERT INTO transactions_new (id, occurred_at, description, created_at, idempotency_hash)
  SELECT id, occurred_at, description, created_at, idempotency_hash FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE UNIQUE INDEX idx_transactions_idempotency_hash ON transactions(idempotency_hash);

PRAGMA user_version = 4;
