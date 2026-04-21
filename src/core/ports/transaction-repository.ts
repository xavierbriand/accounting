import type { Result } from '@core/shared/result.js';
import type { Transaction } from '@core/ledger/transaction.js';

export interface TransactionRepository {
  save(transaction: Transaction): Result<void>;
  findById(id: string): Result<Transaction | null>;
}
