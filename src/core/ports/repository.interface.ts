import { Transaction } from '../ledger/transaction.js';

export interface TransactionRepository {
  save(transaction: Transaction): Promise<void>;
}
