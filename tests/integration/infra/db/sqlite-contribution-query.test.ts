/**
 * Integration tests for SqliteContributionQuery.
 * Uses real in-memory SQLite + runMigrations. No vi.mock (R7 test-mechanism honesty).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteContributionQuery } from '../../../../src/infra/db/repositories/sqlite-contribution-query.js';

function insertEntry(
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

describe('SqliteContributionQuery', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns zero totals when no settlement accounts are configured', () => {
    // fails if the empty-mapping case throws instead of returning zero Money
    const query = new SqliteContributionQuery(db, []);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.attributed).toHaveLength(0);
    expect(result.value.totalActual.amount).toBe(0);
  });

  it('attributes net credits (credit - debit) per mapped account to its partner', () => {
    // fails if the adapter sums only credit-side rows instead of netting credit-debit
    insertEntry(db, 'tx1', '2026-06-15T10:00:00+00:00', 'income:contribution:alex', 'credit', 48000);
    const query = new SqliteContributionQuery(db, [{ account: 'income:contribution:alex', partner: 'Alex' }]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.attributed).toEqual([{ partner: 'Alex', amount: expect.objectContaining({ amount: 48000 }) }]);
    expect(result.value.totalActual.amount).toBe(48000);
  });

  it('aggregates multiple mapped accounts belonging to the same partner', () => {
    // fails if per-account partner aggregation drops or double-counts an account
    insertEntry(db, 'tx1', '2026-06-10T10:00:00+00:00', 'income:contribution:alex-main', 'credit', 30000);
    insertEntry(db, 'tx2', '2026-06-11T10:00:00+00:00', 'income:contribution:alex-side', 'credit', 5000);
    const query = new SqliteContributionQuery(db, [
      { account: 'income:contribution:alex-main', partner: 'Alex' },
      { account: 'income:contribution:alex-side', partner: 'Alex' },
    ]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.attributed).toHaveLength(1);
    expect(result.value.attributed[0].amount.amount).toBe(35000);
  });


  it('a configured account with no transactions in the window contributes zero, not an error', () => {
    // fails if a mapped account with zero matching rows throws instead of defaulting to zero cents
    insertEntry(db, 'tx1', '2026-06-10T10:00:00+00:00', 'income:contribution:alex', 'credit', 30000);
    const query = new SqliteContributionQuery(db, [
      { account: 'income:contribution:alex', partner: 'Alex' },
      { account: 'income:contribution:sam', partner: 'Sam' },
    ]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.attributed).toEqual([
      { partner: 'Alex', amount: expect.objectContaining({ amount: 30000 }) },
      { partner: 'Sam', amount: expect.objectContaining({ amount: 0 }) },
    ]);
    expect(result.value.totalActual.amount).toBe(30000);
  });

  it('nets a reversal + correcting entry to the corrected amount (corrections net out)', () => {
    // fails if SqliteContributionQuery sums only credit-side entries instead of net credits - debits
    insertEntry(db, 'tx-original', '2026-06-10T10:00:00+00:00', 'income:contribution:alex', 'credit', 50000);
    insertEntry(db, 'tx-reversal', '2026-06-12T10:00:00+00:00', 'income:contribution:alex', 'debit', 50000);
    insertEntry(db, 'tx-correcting', '2026-06-12T10:00:00+00:00', 'income:contribution:alex', 'credit', 45000);
    const query = new SqliteContributionQuery(db, [{ account: 'income:contribution:alex', partner: 'Alex' }]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalActual.amount).toBe(45000);
    expect(result.value.attributed[0].amount.amount).toBe(45000);
  });

  it('excludes entries outside the [from, to] window (substr-based date comparison)', () => {
    // fails if the window filter uses raw lexicographic compare or omits a bound
    insertEntry(db, 'tx-before', '2026-05-31T23:59:59+00:00', 'income:contribution:alex', 'credit', 10000);
    insertEntry(db, 'tx-in', '2026-06-15T10:00:00+00:00', 'income:contribution:alex', 'credit', 20000);
    insertEntry(db, 'tx-after', '2026-07-01T00:00:00+00:00', 'income:contribution:alex', 'credit', 40000);
    const query = new SqliteContributionQuery(db, [{ account: 'income:contribution:alex', partner: 'Alex' }]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalActual.amount).toBe(20000);
  });

  it('includes same-day entries at any timezone offset (substr compare, window boundary)', () => {
    // fails if substr-based date comparison excludes same-day entries with non-UTC offsets
    insertEntry(db, 'tx-boundary', '2026-06-30T23:59:59+02:00', 'income:contribution:alex', 'credit', 15000);
    const query = new SqliteContributionQuery(db, [{ account: 'income:contribution:alex', partner: 'Alex' }]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalActual.amount).toBe(15000);
  });

  it('returns Result.fail when a matching entry has a different currency', () => {
    // fails if cross-currency detection is absent
    insertEntry(db, 'tx1', '2026-06-15T10:00:00+00:00', 'income:contribution:alex', 'credit', 48000, 'USD');
    const query = new SqliteContributionQuery(db, [{ account: 'income:contribution:alex', partner: 'Alex' }]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('income:contribution:alex');
    expect(result.error).toContain('USD');
  });

  it('does not filter other accounts into the result (account-name isolation, SQL-injection-safe values)', () => {
    // fails if the dynamic IN-list is built via string interpolation instead of bound placeholders
    insertEntry(db, 'tx1', '2026-06-15T10:00:00+00:00', "income:contribution:o'brien", 'credit', 9000);
    insertEntry(db, 'tx2', '2026-06-15T10:00:00+00:00', 'income:contribution:other', 'credit', 99999);
    const query = new SqliteContributionQuery(db, [{ account: "income:contribution:o'brien", partner: 'Alex' }]);
    const result = query.contributionsInWindow('EUR', '2026-06-01', '2026-06-30');
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalActual.amount).toBe(9000);
  });
});
