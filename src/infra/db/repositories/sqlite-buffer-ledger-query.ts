import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { BufferLedgerQuery } from '@core/ports/buffer-ledger-query.js';

export class SqliteBufferLedgerQuery implements BufferLedgerQuery {
  constructor(private readonly _db: Database.Database) {}

  sumEntriesByAccount(
    account: string,
    expectedCurrency: string,
    asOfDate: string,
  ): Result<Money> {
    void account;
    void expectedCurrency;
    void asOfDate;
    return Result.fail('SqliteBufferLedgerQuery.sumEntriesByAccount: not implemented');
  }
}
