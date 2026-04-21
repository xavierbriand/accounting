import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteTransactionRepository } from '../../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { Transaction } from '../../../../src/core/ledger/transaction.js';
import { Money } from '../../../../src/core/shared/money.js';

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeBalancedTx(id: string): Transaction {
  return Transaction.create({
    id,
    occurredAt: '2026-04-21T14:30:00+02:00',
    description: 'Transport',
    entries: [
      { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
}

describe('SqliteTransactionRepository', () => {
  let db: Database.Database;
  let repo: SqliteTransactionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new SqliteTransactionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('save + findById round-trip preserves all fields', () => {
    const tx = makeBalancedTx('tx-round-trip');
    const saveResult = repo.save(tx);

    expect(saveResult.isSuccess).toBe(true);

    const findResult = repo.findById('tx-round-trip');
    expect(findResult.isSuccess).toBe(true);
    const found = findResult.value;
    expect(found).not.toBeNull();
    expect(found!.id).toBe('tx-round-trip');
    expect(found!.occurredAt).toBe('2026-04-21T14:30:00+02:00');
    expect(found!.description).toBe('Transport');
    expect(found!.entries).toHaveLength(2);
    expect(found!.entries[0].account).toBe('Expense:Transport');
    expect(found!.entries[0].side).toBe('debit');
    expect(found!.entries[0].amount.amount).toBe(2000);
    expect(found!.entries[0].amount.currency).toBe('EUR');
  });

  it('findById returns Result.ok(null) for unknown id', () => {
    const result = repo.findById('does-not-exist');
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBeNull();
  });
});
