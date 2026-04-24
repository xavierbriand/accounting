// Redacts hex-like tokens of 32+ consecutive hex chars from SQLite error messages.
// SQLite UNIQUE-constraint violations embed the offending value verbatim in the
// error text (e.g. "…idempotency_hash = 3a4b5c…64 chars…"). These hashes are
// transaction fingerprints — correlatable across datasets — and count as PII
// per security-checklist.md (P2 adopt #1).
const HEX_TOKEN_RE = /[0-9a-f]{32,}/gi;

export function sanitizeSqlError(msg: string): string {
  return msg.replace(HEX_TOKEN_RE, '<redacted>');
}
