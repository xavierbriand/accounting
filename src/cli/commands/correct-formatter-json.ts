import type { TransactionCorrected } from '@core/events/domain-event.js';

// User-facing display only — the recorded TransactionCorrected event (audit trail)
// always keeps Core's "account" vocabulary (glossary: "account/category"); this
// remaps just what's shown to the CLI user, who typed --category.
const DISPLAY_FIELD_NAMES: Readonly<Record<string, string>> = { account: 'category' };

export function toDisplayFieldName(field: string): string {
  return DISPLAY_FIELD_NAMES[field] ?? field;
}

export function formatCorrectJson(event: TransactionCorrected): string {
  const doc = {
    targetTransactionId: event.targetTransactionId,
    producedTransactionIds: event.producedTransactionIds,
    changedFields: event.changedFields.map(toDisplayFieldName),
    reason: event.reason,
  };
  return JSON.stringify(doc) + '\n';
}
