export interface TransactionIngested {
  readonly type: 'TransactionIngested';
  readonly transactionIds: readonly string[];
  readonly sourceAccount: string;
}

export type DomainEvent = TransactionIngested;
