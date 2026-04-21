CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE transaction_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  account TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('debit','credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE INDEX idx_transaction_entries_tx ON transaction_entries(transaction_id);
