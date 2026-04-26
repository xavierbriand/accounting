/**
 * Integration tests for SqliteBufferLedgerQuery.
 * Uses real in-memory SQLite + runMigrations. No vi.mock (R7 test-mechanism honesty).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteBufferLedgerQuery } from '../../../../src/infra/db/repositories/sqlite-buffer-ledger-query.js';

function insertTx(
  db: Database.Database,
  id: string,
  occurredAt: string,
  account: string,
  side: 'debit' | 'credit',
  amountCents: number,
  currency = 'EUR',
): void {
  db.prepare(
    'INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)',
  ).run(id, occurredAt, `tx ${id}`, `hash-${id}`);
  db.prepare(
    'INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES (?, ?, ?, ?, ?)',
  ).run(id, account, side, amountCents, currency);
}

describe('SqliteBufferLedgerQuery', () => {
  let db: Database.Database;
  let query: SqliteBufferLedgerQuery;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    query = new SqliteBufferLedgerQuery(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns Money.zero when no entries match the account', () => {
    // fails if empty-result case returns error or wrong amount
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(0);
    expect(result.value.currency).toBe('EUR');
  });

  it('sums debit entries only (debit - credit = positive)', () => {
    // fails if debit/credit aggregation is wrong
    insertTx(db, 'tx1', '2026-04-20T10:00:00+00:00', 'assets:buffer:car', 'debit', 50000);
    insertTx(db, 'tx2', '2026-04-21T10:00:00+00:00', 'assets:buffer:car', 'debit', 30000);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(80000);
  });

  it('computes debit - credit (signed balance)', () => {
    // fails if credits are not subtracted from debits
    insertTx(db, 'tx1', '2026-04-20T10:00:00+00:00', 'assets:buffer:car', 'debit', 50000);
    insertTx(db, 'tx2', '2026-04-21T10:00:00+00:00', 'assets:buffer:car', 'credit', 20000);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(30000);
  });

  it('filters entries by asOf date using substr-based date comparison', () => {
    // fails if SQL uses raw lexicographic compare on full timestamp
    insertTx(db, 'tx1', '2026-04-21T14:30:00+02:00', 'assets:buffer:car', 'debit', 50000);
    insertTx(db, 'tx2', '2026-04-22T10:00:00+00:00', 'assets:buffer:car', 'debit', 30000);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-21');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(50000);
  });

  it('includes same-day entries at any timezone offset (substr compare)', () => {
    // fails if substr-based date comparison excludes same-day entries with non-UTC offsets
    // An entry at 2026-04-21T23:59:59+02:00 has local date 2026-04-21 → must be included
    insertTx(db, 'tx1', '2026-04-21T23:59:59+02:00', 'assets:buffer:car', 'debit', 50000);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-21');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(50000);
  });

  it('excludes entries after asOf date', () => {
    // fails if future entries are included in balance
    insertTx(db, 'tx1', '2026-04-20T10:00:00+00:00', 'assets:buffer:car', 'debit', 50000);
    insertTx(db, 'tx2', '2026-04-27T10:00:00+00:00', 'assets:buffer:car', 'debit', 30000);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(50000);
  });

  it('filters entries by account — does not include other accounts', () => {
    // fails if account filter is missing
    insertTx(db, 'tx1', '2026-04-20T10:00:00+00:00', 'assets:buffer:car', 'debit', 50000);
    insertTx(db, 'tx2', '2026-04-20T10:00:00+00:00', 'assets:buffer:house', 'debit', 99999);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(50000);
  });

  it('returns Result.fail when a matching entry has a different currency', () => {
    // fails if cross-currency detection is absent
    insertTx(db, 'tx1', '2026-04-20T10:00:00+00:00', 'assets:buffer:car', 'debit', 10000, 'USD');
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('assets:buffer:car');
    expect(result.error).toContain('USD');
  });

  it('handles credits exceeding debits (negative balance)', () => {
    // fails if adapter cannot produce negative signed balance
    insertTx(db, 'tx1', '2026-04-20T10:00:00+00:00', 'assets:buffer:car', 'debit', 20000);
    insertTx(db, 'tx2', '2026-04-21T10:00:00+00:00', 'assets:buffer:car', 'credit', 50000);
    const result = query.sumEntriesByAccount('assets:buffer:car', 'EUR', '2026-04-26');
    expect(result.isSuccess).toBe(true);
    expect(result.value.amount).toBe(-30000);
  });
});
