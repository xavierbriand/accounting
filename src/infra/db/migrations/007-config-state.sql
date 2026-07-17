-- Single-row store for ambient config-change detection (story-4.5a, FR23): the last-seen
-- canonical form + digest of accounting.yaml, compared against the live config on every
-- ledger-opening command. id CHECK(id = 1) enforces the singleton; SqliteConfigStateStore
-- upserts via ON CONFLICT(id) rather than relying on application-level discipline.
CREATE TABLE config_state (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  canonical TEXT NOT NULL,
  digest    TEXT NOT NULL
);
PRAGMA user_version = 7;
