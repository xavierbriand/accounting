import type { TransactionCorrected } from '@core/events/domain-event.js';

export function formatCorrectJson(event: TransactionCorrected): string {
  const doc = {
    targetTransactionId: event.targetTransactionId,
    producedTransactionIds: event.producedTransactionIds,
    changedFields: event.changedFields,
    reason: event.reason,
  };
  return JSON.stringify(doc) + '\n';
}
