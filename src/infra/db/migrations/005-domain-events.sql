-- Append-only audit trail (FR23). recorded_at is a system recording clock,
-- deliberately distinct from transactions.occurred_at (receipt truth).
CREATE TABLE domain_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload     TEXT NOT NULL
);
PRAGMA user_version = 5;
