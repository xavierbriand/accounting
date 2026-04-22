import type { IngestItem } from './types.js';
import { Result } from '@core/shared/result.js';

const US = '\u001F';

function normalizeDescription(raw: string): string {
  // NFC normalization unifies decomposed accents (NFD) with composed forms (NFC).
  // trim + whitespace-collapse ensures trailing/leading spaces and NBSP (\u00A0)
  // from different CSV exports produce the same canonical string.
  // \s matches Unicode whitespace including \u00A0, so the collapse handles NBSP too.
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function checkField(value: string, fieldName: string): Result<string> | null {
  if (value.includes(US)) {
    // Error names the field but never echoes its content — PII safety.
    return Result.fail(`field '${fieldName}' contains the unit-separator character (\\u001F)`);
  }
  return null;
}

export function canonicalize(item: IngestItem): Result<string> {
  const normalizedDescription = normalizeDescription(item.description);

  const fieldsToCheck: [string, string][] = [
    [item.sourceAccount, 'sourceAccount'],
    [item.occurredAt, 'occurredAt'],
    [item.direction, 'direction'],
    [normalizedDescription, 'description'],
  ];

  for (const [value, name] of fieldsToCheck) {
    const failure = checkField(value, name);
    if (failure !== null) return failure;
  }

  const canonical = [
    item.sourceAccount,
    item.occurredAt,
    item.direction,
    String(item.amount.amount),
    item.amount.currency,
    normalizedDescription,
  ].join(US);

  return Result.ok(canonical);
}
