// Hand-rolled RFC-4180 field escaper (~15 lines) — no new dependency. Round-trip
// proven against the project's own `csv-parse` (see rfc4180.test.ts); the export
// bundle never re-reads its own CSVs, so a full parser/writer library would be
// overkill (plan § Selected solution "CSV writing").
const NEEDS_QUOTING = /[",\r\n]/;

export function escapeCsvField(field: string): string {
  if (!NEEDS_QUOTING.test(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

export function toCsvLine(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(',');
}
