import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getDb, closeDb } from '../../../../src/infra/db/sqlite-client.js';
import { SqliteTransactionRepo } from '../../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { Transaction, LedgerEntry } from '../../../../src/core/ledger/transaction.js';
import { Money } from '../../../../src/core/shared/money.js';
import { randomUUID } from 'crypto';
import fs from 'fs';

const TEST_DB = 'test_ledger.db';

describe('SqliteTransactionRepo', () => {
  let db: Database.Database; // Use namespace for type
  let repo: SqliteTransactionRepo;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = getDb(TEST_DB);
    
    // Read and execute migration
    const migration = fs.readFileSync('src/infra/db/migrations/002-create-transactions-table.sql', 'utf-8');
    db.exec(migration);
    
    repo = new SqliteTransactionRepo(db);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('saves a balanced transaction successfully', async () => {
    const amount = Money.fromCents(1000, 'EUR').value;
    const negAmount = Money.fromCents(-1000, 'EUR').value;
    
    const entry1 = LedgerEntry.reconstruct({ 
        id: randomUUID(), 
        amount, 
        category: 'Income', 
        tags: [] 
    });
    const entry2 = LedgerEntry.reconstruct({ 
        id: randomUUID(), 
        amount: negAmount, 
        category: 'Bank', 
        tags: [] 
    });
    
    const txn = Transaction.reconstruct({
        id: randomUUID(),
        date: new Date('2023-01-01T12:00:00Z'),
        description: 'Test Txn',
        entries: [entry1, entry2]
    });

    await expect(repo.save(txn)).resolves.not.toThrow();
    
    const rows = db.prepare('SELECT * FROM transactions').all() as { parent_id: string, amount_cents: number, date: string }[];
    expect(rows.length).toBe(2);
    expect(rows[0].parent_id).toBe(txn.id);
    expect(rows[0].amount_cents).toBe(1000);
    expect(rows[0].date).toBe('2023-01-01T12:00:00.000Z');
  });

  it('rejects an unbalanced transaction', async () => {
    const amount = Money.fromCents(1000, 'EUR').value;
    const entry1 = LedgerEntry.reconstruct({ 
        id: randomUUID(), 
        amount, 
        category: 'Income', 
        tags: [] 
    });
    
    const txn = Transaction.reconstruct({
        id: randomUUID(),
        date: new Date(),
        description: 'Bad Txn',
        entries: [entry1]
    });

    await expect(repo.save(txn)).rejects.toThrow(/Invariant Violation/);
  });
});
