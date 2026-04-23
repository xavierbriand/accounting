import type { Result } from '@core/shared/result.js';
import type { Transaction } from '@core/ledger/transaction.js';
import type { BuildOutcome } from '@core/ingest/types.js';

export interface BatchWriteOutcome {
  readonly written: number;
}

export interface TransactionRepository {
  save(transaction: Transaction): Result<void>;
  saveBatch(outcomes: readonly BuildOutcome[]): Result<BatchWriteOutcome>;
  findById(id: string): Result<Transaction | null>;
}
