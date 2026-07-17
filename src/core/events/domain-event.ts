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

// Receipt-only event (model note § Events, story-4.5c invariant 7): recorded into
// the dissolution receipt (src/infra/fs/dissolution-receipt.ts), never into the
// append-only trail — the DB it would be recorded to is the very one being
// destroyed. Deliberately NOT a member of the DomainEvent union above: leaving it
// out makes a would-be `domainEventRecorder.record(dissolutionPerformedEvent)` call
// a type error, enforcing the model note's "persisted in the receipt, not the
// doomed DB" sentence at the type level rather than by convention alone.
export interface DissolutionPerformed {
  readonly type: 'DissolutionPerformed';
  readonly archiveLocation: string;
  readonly manifestHash: string;
  readonly wipedStores: readonly string[];
}
