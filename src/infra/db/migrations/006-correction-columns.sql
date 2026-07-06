-- Correction domain columns (Story 4.2a, FR14): reverse-and-correct.
-- kind distinguishes original/reversal/correcting rows; corrects_id links a
-- reversal or correcting row back to the transaction it corrects.
--
-- idempotency_hash relaxes from NOT NULL (migration 004) to nullable, gated by a
-- kind-conditioned CHECK: 'original' rows must carry a hash (ingest ACL invariant
-- unchanged); 'reversal'/'correcting' rows must NOT (story-4.0 firewall — correction
-- rows never speak ingest-ACL vocabulary). This turns the ACL boundary into a DB-level
-- invariant rather than a convention. SQLite treats each NULL as distinct under the
-- existing UNIQUE index, so multiple hash-free correction rows never collide.
--
-- SQLite cannot ALTER COLUMN to change NOT NULL or add a table-level CHECK — the
-- 12-step rebuild idiom from migration 004 applies again: create new table, copy
-- data, drop old, rename. Runner wraps this in db.transaction() for atomicity and
-- toggles PRAGMA foreign_keys = OFF around it (see migrator.ts), running
-- PRAGMA foreign_key_check after the transaction commits.

DROP INDEX IF EXISTS idx_transactions_idempotency_hash;

CREATE TABLE transactions_new (
    id TEXT PRIMARY KEY NOT NULL,
    occurred_at TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    idempotency_hash TEXT,
    corrects_id TEXT REFERENCES transactions(id),
    kind TEXT NOT NULL DEFAULT 'original'
      CHECK (kind IN ('original', 'reversal', 'correcting')),
    CHECK (
      (kind = 'original' AND idempotency_hash IS NOT NULL)
      OR (kind IN ('reversal', 'correcting') AND idempotency_hash IS NULL)
    )
);

INSERT INTO transactions_new (id, occurred_at, description, created_at, idempotency_hash)
  SELECT id, occurred_at, description, created_at, idempotency_hash FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE UNIQUE INDEX idx_transactions_idempotency_hash ON transactions(idempotency_hash);

PRAGMA user_version = 6;
