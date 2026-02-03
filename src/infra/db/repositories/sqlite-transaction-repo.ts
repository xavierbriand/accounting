import { Database } from 'better-sqlite3';
import { Transaction } from '../../../core/ledger/transaction.js';
import { TransactionRepository } from '../../../core/ports/repository.interface.js';
import { Money } from '../../../core/shared/money.js';

export class SqliteTransactionRepo implements TransactionRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  public async save(transaction: Transaction): Promise<void> {
    if (transaction.entries.length === 0) {
        return;
    }

    // 1. Double check balance (AC Requirement)
    // We assume all entries have the same currency for now, enforced by Money.add
    let sum = Money.zero(transaction.entries[0].amount.currency);
    
    for (const entry of transaction.entries) {
      const result = sum.add(entry.amount);
      if (result.isFailure) {
        throw new Error(`Invariant Violation: ${result.error}`);
      }
      sum = result.value;
    }

    if (sum.amount !== 0) {
      throw new Error(`Invariant Violation: Transaction ${transaction.id} is not balanced. Sum is ${sum.toString()}.`);
    }

    // 2. Prepare Insert
    const insert = this.db.prepare(`
      INSERT INTO transactions (
        id, parent_id, date, amount_cents, currency, description, category, tags
      ) VALUES (
        @id, @parent_id, @date, @amount_cents, @currency, @description, @category, @tags
      )
    `);

    // 3. Execute in Transaction
    const insertMany = this.db.transaction((entries) => {
      for (const entry of entries) {
        insert.run({
          id: entry.id,
          parent_id: transaction.id,
          date: transaction.date.toISOString(),
          amount_cents: entry.amount.amount,
          currency: entry.amount.currency,
          description: transaction.description,
          category: entry.category,
          tags: JSON.stringify(entry.tags)
        });
      }
    });

    insertMany(transaction.entries);
    return Promise.resolve();
  }
}
