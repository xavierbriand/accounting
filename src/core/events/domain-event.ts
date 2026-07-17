import type { ChangedSection } from '@core/config/config-diff.js';

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

export interface ConfigChanged {
  readonly type: 'ConfigChanged';
  readonly origin: 'external' | 'applied';
  readonly changedSections: readonly ChangedSection[];
  readonly previousDigest: string;
  readonly currentDigest: string;
}

export type DomainEvent = TransactionIngested | TransactionCorrected | ConfigChanged;
