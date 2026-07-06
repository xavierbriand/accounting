-- Correction domain columns (Story 4.2a, FR14): reverse-and-correct.
-- kind distinguishes original/reversal/correcting rows; corrects_id links a
-- reversal or correcting row back to the transaction it corrects. Additive —
-- existing rows default to kind='original', corrects_id=NULL.
ALTER TABLE transactions ADD COLUMN corrects_id TEXT REFERENCES transactions(id);
ALTER TABLE transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'original'
  CHECK (kind IN ('original', 'reversal', 'correcting'));

PRAGMA user_version = 6;
