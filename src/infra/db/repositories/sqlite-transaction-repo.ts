import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import { Transaction, EntryDraft } from '@core/ledger/transaction.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';

interface TransactionRow {
  id: string;
  occurred_at: string;
  description: string;
}

interface EntryRow {
  account: string;
  side: string;
  amount_cents: number;
  currency: string;
}

export class SqliteTransactionRepository implements TransactionRepository {
  private readonly insertHeader: Database.Statement;
  private readonly insertEntry: Database.Statement;
  private readonly selectHeader: Database.Statement;
  private readonly selectEntries: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insertHeader = db.prepare(
      'INSERT INTO transactions (id, occurred_at, description) VALUES (?, ?, ?)',
    );
    this.insertEntry = db.prepare(
      'INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES (?, ?, ?, ?, ?)',
    );
    this.selectHeader = db.prepare(
      'SELECT id, occurred_at, description FROM transactions WHERE id = ?',
    );
    this.selectEntries = db.prepare(
      'SELECT account, side, amount_cents, currency FROM transaction_entries WHERE transaction_id = ? ORDER BY id',
    );
  }

  save(transaction: Transaction): Result<void> {
    const write = this.db.transaction(() => {
      this.insertHeader.run(transaction.id, transaction.occurredAt, transaction.description);
      for (const entry of transaction.entries) {
        this.insertEntry.run(
          transaction.id,
          entry.account,
          entry.side,
          entry.amount.amount,
          entry.amount.currency,
        );
      }
    });

    try {
      write();
      return Result.ok();
    } catch (err) {
      return Result.fail(String(err));
    }
  }

  findById(id: string): Result<Transaction | null> {
    const row = this.selectHeader.get(id) as TransactionRow | undefined;
    if (!row) {
      return Result.ok(null);
    }

    const entryRows = this.selectEntries.all(id) as EntryRow[];
    const entryDrafts: EntryDraft[] = [];

    for (const entryRow of entryRows) {
      const moneyResult = Money.fromCents(entryRow.amount_cents, entryRow.currency);
      if (moneyResult.isFailure) {
        return Result.fail(moneyResult.error);
      }
      entryDrafts.push({
        account: entryRow.account,
        side: entryRow.side as 'debit' | 'credit',
        amount: moneyResult.value,
      });
    }

    return Transaction.create({
      id: row.id,
      occurredAt: row.occurred_at,
      description: row.description,
      entries: entryDrafts,
    });
  }
}
