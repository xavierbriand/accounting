CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL, -- Grouping ID for Double-Entry
  date TEXT NOT NULL,      -- ISO8601 YYYY-MM-DD
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,  -- The 'Account' (e.g., Expense:Food)
  tags TEXT NOT NULL       -- JSON Array of strings
);

CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
