/**
 * Unit tests for sanitizeSqlError.
 *
 * fails if: hex tokens of ≥32 chars are not redacted, tokens shorter than 32 chars
 *   pass through (false positive), or multi-token messages are only partially redacted.
 * P2 adopt #1 — idempotency_hash values in SQLite UNIQUE-constraint errors must be
 * redacted from stderr before reaching the user (hashes are transaction fingerprints,
 * correlatable across datasets, treated as PII per security-checklist.md).
 */
import { describe, it, expect } from 'vitest';
import { sanitizeSqlError } from '../../../../src/cli/utils/sanitize-sql-error.js';

describe('sanitizeSqlError', () => {
  it('redacts a 64-char hex token (SHA-256 hash) to <redacted>', () => {
    // fails if: hex strings of 32+ chars pass through verbatim to stderr
    const hash64 = 'a'.repeat(64);
    const msg = `UNIQUE constraint failed: transactions.idempotency_hash = ${hash64}`;
    const result = sanitizeSqlError(msg);
    expect(result).not.toContain(hash64);
    expect(result).toContain('<redacted>');
  });

  it('redacts a 32-char hex token (minimum threshold)', () => {
    // fails if: the threshold is > 32 chars (misses minimum-length hex fingerprints)
    const hash32 = 'b'.repeat(32);
    const result = sanitizeSqlError(`error: ${hash32}`);
    expect(result).not.toContain(hash32);
    expect(result).toContain('<redacted>');
  });

  it('does NOT redact a 31-char hex string (below threshold — not PII-sensitive)', () => {
    // fails if: the regex threshold is too aggressive (would produce false positives
    // on short hex-like strings like file modes, IDs, etc.)
    const short = 'c'.repeat(31);
    const result = sanitizeSqlError(`error: ${short}`);
    expect(result).toContain(short);
    expect(result).not.toContain('<redacted>');
  });

  it('redacts all hex tokens in a message with multiple tokens', () => {
    // fails if: only the first token is redacted (replaceAll vs replace regression)
    const hash1 = 'd'.repeat(64);
    const hash2 = 'e'.repeat(48);
    const msg = `UNIQUE constraint: hash1=${hash1} conflicts with hash2=${hash2}`;
    const result = sanitizeSqlError(msg);
    expect(result).not.toContain(hash1);
    expect(result).not.toContain(hash2);
    expect(result.match(/<redacted>/g)?.length).toBe(2);
  });

  it('passes through a message with no hex tokens unchanged', () => {
    // fails if: normal error messages are garbled by the redaction regex
    const msg = 'SQLITE_CONSTRAINT: NOT NULL constraint failed: transactions.description';
    expect(sanitizeSqlError(msg)).toBe(msg);
  });

  it('passes through an empty string unchanged', () => {
    expect(sanitizeSqlError('')).toBe('');
  });

  it('preserves surrounding non-hex context around a redacted token', () => {
    // fails if: the regex consumes surrounding non-hex characters
    const hash = 'f'.repeat(40);
    const result = sanitizeSqlError(`prefix-${hash}-suffix`);
    expect(result).toContain('prefix-');
    expect(result).toContain('-suffix');
    expect(result).toContain('<redacted>');
  });
});
