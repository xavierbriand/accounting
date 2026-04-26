import type { Result } from '@core/shared/result.js';
import type { Money } from '@core/shared/money.js';

export interface BufferLedgerQuery {
  sumEntriesByAccount(
    account: string,
    expectedCurrency: string,
    asOfDate: string,
  ): Result<Money>;
}
