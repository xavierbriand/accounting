-- ALTER TABLE ADD COLUMN with inline UNIQUE is not supported by SQLite's ALTER TABLE.
-- The equivalent is: add the plain column, then enforce uniqueness via an index.
-- CREATE UNIQUE INDEX on a nullable column: SQLite treats each NULL as distinct,
-- so multiple NULLs are allowed while duplicate non-null hashes are rejected.
ALTER TABLE transactions ADD COLUMN idempotency_hash TEXT;
CREATE UNIQUE INDEX idx_transactions_idempotency_hash ON transactions(idempotency_hash);
PRAGMA user_version = 3;
