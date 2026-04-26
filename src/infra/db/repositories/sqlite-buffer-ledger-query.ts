import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { BufferLedgerQuery } from '@core/ports/buffer-ledger-query.js';

interface SideRow {
  side: string;
  total_cents: number;
  currency: string;
}

export class SqliteBufferLedgerQuery implements BufferLedgerQuery {
  private readonly stmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    // substr(occurred_at, 1, 10) compares receipt-truth local dates: it includes
    // same-day rows regardless of timezone offset, where a raw `<= 'YYYY-MM-DD'`
    // would lex-exclude any row with a `T...` suffix.
    this.stmt = db.prepare(`
      SELECT side, currency, SUM(amount_cents) AS total_cents
      FROM transaction_entries te
      JOIN transactions t ON t.id = te.transaction_id
      WHERE te.account = ?
        AND substr(t.occurred_at, 1, 10) <= ?
      GROUP BY side, currency
    `);
  }

  sumEntriesByAccount(
    account: string,
    expectedCurrency: string,
    asOfDate: string,
  ): Result<Money> {
    const rows = this.stmt.all(account, asOfDate) as SideRow[];

    for (const row of rows) {
      if (row.currency !== expectedCurrency) {
        return Result.fail(
          `${account}: currency mismatch — expected ${expectedCurrency}, found ${row.currency}`,
        );
      }
    }

    let debitCents = 0;
    let creditCents = 0;
    for (const row of rows) {
      if (row.side === 'debit') debitCents += row.total_cents;
      else creditCents += row.total_cents;
    }

    return Money.fromCents(debitCents - creditCents, expectedCurrency);
  }
}
