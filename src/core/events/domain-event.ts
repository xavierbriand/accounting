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

export interface DataExported {
  readonly type: 'DataExported';
  // Bundle directory name only — never an absolute path (extends the dbPath
  // no-paths-in-the-trail ruling to this event's payload, model note § Events).
  readonly archiveLocation: string;
  readonly exported: {
    readonly transactions: number;
    readonly events: number;
  };
}

export type DomainEvent = TransactionIngested | TransactionCorrected | ConfigChanged | DataExported;
