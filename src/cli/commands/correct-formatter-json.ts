import type { TransactionCorrected } from '@core/events/domain-event.js';
import { formatJsonSuccess } from '../utils/json-envelope.js';

// User-facing display only — the recorded TransactionCorrected event (audit trail)
// always keeps Core's "account" vocabulary (glossary: "account/category"); this
// remaps just what's shown to the CLI user, who typed --category. story-4.4b
// finding 8: the JSON branch stopped calling this — it emits domain vocabulary
// ("account") verbatim; only the human-rendering branch (correct-command.ts)
// still remaps for display.
const DISPLAY_FIELD_NAMES: Readonly<Record<string, string>> = { account: 'category' };

export function toDisplayFieldName(field: string): string {
  return DISPLAY_FIELD_NAMES[field] ?? field;
}

export function formatCorrectJson(event: TransactionCorrected): string {
  const doc = {
    targetTransactionId: event.targetTransactionId,
    producedTransactionIds: event.producedTransactionIds,
    changedFields: event.changedFields,
    reason: event.reason,
  };
  return formatJsonSuccess('correct', doc);
}
