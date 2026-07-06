export interface TransactionIngested {
  readonly type: 'TransactionIngested';
  readonly transactionIds: readonly string[];
  readonly sourceAccount: string;
}

export interface TransactionCorrected {
  readonly type: 'TransactionCorrected';
  readonly targetTransactionId: string;
  readonly producedTransactionIds: readonly string[];
  readonly changedFields: readonly string[];
  readonly reason: string;
}

export type DomainEvent = TransactionIngested | TransactionCorrected;
