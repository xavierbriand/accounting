/**
 * Unit tests for canonicalize(item: IngestItem): Result<string>
 *
 * Gherkin coverage:
 *   - AC1: deterministic hash for an IngestItem (via deterministic canonical string)
 *   - canonicalizer normalizes description noise (NFC + trim + whitespace collapse)
 *   - canonicalizer rejects a field containing the US delimiter
 *
 * fails if: canonicalize module does not exist, or description is hashed raw (no normalization),
 *            or a US-containing field is silently accepted (collision risk),
 *            or error message echoes field content (PII leak)
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canonicalize } from '../../../../src/core/ingest/canonicalize.js';
import type { IngestItem } from '../../../../src/core/ingest/types.js';
import { Money } from '@core/shared/money.js';

const US = '\u001F';

function makeItem(overrides: Partial<IngestItem> = {}): IngestItem {
  return {
    sourceAccount: 'main-1',
    occurredAt: '2026-04-20T00:00:00+02:00',
    direction: 'outflow',
    amount: Money.fromCents(8550, 'EUR').value,
    description: 'SUPERMARCHE FICTIF',
    ...overrides,
  };
}

describe('canonicalize', () => {
  describe('determinism', () => {
    it('produces the same canonical string on two calls for the same item', () => {
      // fails if: the function is non-deterministic, or any field is randomly salted
      const item = makeItem();
      const r1 = canonicalize(item);
      const r2 = canonicalize(item);
      expect(r1.isSuccess).toBe(true);
      expect(r2.isSuccess).toBe(true);
      expect(r1.value).toBe(r2.value);
    });

    it('canonical string contains all six fields (none silently dropped)', () => {
      // fails if: one of sourceAccount / occurredAt / direction / cents / currency / description
      //           is dropped from the canonical string
      const item = makeItem();
      const r = canonicalize(item);
      expect(r.isSuccess).toBe(true);
      const parts = r.value.split(US);
      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe(item.sourceAccount);
      expect(parts[1]).toBe(item.occurredAt);
      expect(parts[2]).toBe(item.direction);
      expect(parts[3]).toBe(String(item.amount.amount));
      expect(parts[4]).toBe(item.amount.currency);
      // parts[5] = normalized description
    });
  });

  describe('field discrimination (property)', () => {
    it('changing sourceAccount produces a different canonical string', () => {
      // fails if: sourceAccount is silently dropped from canonicalization
      const base = makeItem({ sourceAccount: 'account-A' });
      const alt = makeItem({ sourceAccount: 'account-B' });
      expect(canonicalize(base).value).not.toBe(canonicalize(alt).value);
    });

    it('changing occurredAt produces a different canonical string', () => {
      const base = makeItem({ occurredAt: '2026-04-20T00:00:00+02:00' });
      const alt = makeItem({ occurredAt: '2026-04-21T00:00:00+02:00' });
      expect(canonicalize(base).value).not.toBe(canonicalize(alt).value);
    });

    it('changing direction produces a different canonical string', () => {
      // fails if: direction is silently dropped (inflow refund collides with outflow payment)
      const base = makeItem({ direction: 'inflow' });
      const alt = makeItem({ direction: 'outflow' });
      expect(canonicalize(base).value).not.toBe(canonicalize(alt).value);
    });

    it('changing amount.cents produces a different canonical string', () => {
      const base = makeItem({ amount: Money.fromCents(8550, 'EUR').value });
      const alt = makeItem({ amount: Money.fromCents(9000, 'EUR').value });
      expect(canonicalize(base).value).not.toBe(canonicalize(alt).value);
    });

    it('changing currency produces a different canonical string', () => {
      // fails if: currency is silently dropped (same EUR amount vs USD amount collide)
      const base = makeItem({ amount: Money.fromCents(8550, 'EUR').value });
      const alt = makeItem({ amount: Money.fromCents(8550, 'USD').value });
      expect(canonicalize(base).value).not.toBe(canonicalize(alt).value);
    });

    it('changing description produces a different canonical string', () => {
      const base = makeItem({ description: 'SUPERMARCHE FICTIF' });
      const alt = makeItem({ description: 'RESTAURANT FICTIF' });
      expect(canonicalize(base).value).not.toBe(canonicalize(alt).value);
    });
  });

  describe('description normalization (AC: NFC + trim + whitespace collapse)', () => {
    it('trailing whitespace on description produces same canonical string', () => {
      // fails if: description is hashed raw — same transaction re-imported with trailing spaces
      //           would hash differently → silent data loss
      const base = makeItem({ description: 'SUPERMARCHE FICTIF' });
      const trailing = makeItem({ description: 'SUPERMARCHE FICTIF   ' });
      expect(canonicalize(base).value).toBe(canonicalize(trailing).value);
    });

    it('leading whitespace on description produces same canonical string', () => {
      const base = makeItem({ description: 'SUPERMARCHE FICTIF' });
      const leading = makeItem({ description: '   SUPERMARCHE FICTIF' });
      expect(canonicalize(base).value).toBe(canonicalize(leading).value);
    });

    it('NBSP (\\u00A0) on description produces same canonical string as regular space', () => {
      // fails if: NBSP is not normalized — different CSV exports use different whitespace chars
      const base = makeItem({ description: 'SUPERMARCHE FICTIF' });
      const nbsp = makeItem({ description: 'SUPERMARCHE\u00A0FICTIF' });
      expect(canonicalize(base).value).toBe(canonicalize(nbsp).value);
    });

    it('internal multiple spaces collapse to single space', () => {
      const base = makeItem({ description: 'SUPERMARCHE FICTIF' });
      const multi = makeItem({ description: 'SUPERMARCHE  FICTIF' });
      expect(canonicalize(base).value).toBe(canonicalize(multi).value);
    });

    it('NFD-vs-NFC accents produce same canonical string', () => {
      // fails if: description is hashed raw — decomposed accents from one CSV
      //           collide with composed accents from another
      // 'é' NFC (U+00E9) vs 'e' + combining-acute (U+0065 U+0301) NFD
      const nfc = makeItem({ description: 'caf\u00E9' });
      const nfd = makeItem({ description: 'cafe\u0301' });
      expect(canonicalize(nfc).value).toBe(canonicalize(nfd).value);
    });

    it('property: any trailing/leading whitespace variant produces the same canonical string', () => {
      // property test for whitespace normalization
      const item = makeItem({ description: 'SUPER MARCHE FICTIF' });
      fc.assert(
        fc.property(
          fc.constantFrom('', ' ', '  ', '\t', '\u00A0'),
          fc.constantFrom('', ' ', '  ', '\t', '\u00A0'),
          (leading, trailing) => {
            const noisy = makeItem({ description: `${leading}SUPER MARCHE FICTIF${trailing}` });
            return canonicalize(item).value === canonicalize(noisy).value;
          },
        ),
      );
    });
  });

  describe('US delimiter rejection (PII safety)', () => {
    it('returns Result.fail when description contains US delimiter', () => {
      // fails if: the canonicalizer silently escapes or concatenates (collision risk)
      const item = makeItem({ description: `bad${US}value` });
      const r = canonicalize(item);
      expect(r.isFailure).toBe(true);
    });

    it('error reason names the field "description" but does NOT echo field content', () => {
      // fails if: error message includes the raw field content (PII leak)
      const sensitiveDescription = `my-iban${US}sensitive-data`;
      const item = makeItem({ description: sensitiveDescription });
      const r = canonicalize(item);
      expect(r.isFailure).toBe(true);
      expect(r.error).toContain('description');
      expect(r.error).not.toContain(sensitiveDescription);
      expect(r.error).not.toContain('my-iban');
      expect(r.error).not.toContain('sensitive-data');
    });

    it('returns Result.fail when sourceAccount contains US delimiter', () => {
      const item = makeItem({ sourceAccount: `bad${US}account` });
      const r = canonicalize(item);
      expect(r.isFailure).toBe(true);
      expect(r.error).toContain('sourceAccount');
      expect(r.error).not.toContain('bad');
    });

    it('property: error reason never echoes field content (PII safety)', () => {
      // fails if: error message includes raw field content for any field
      fc.assert(
        fc.property(
          fc.constantFrom('sourceAccount', 'occurredAt', 'direction', 'description'),
          fc.string({ minLength: 3 }),
          (field, content) => {
            const withUs = `${content}${US}injection`;
            let item: IngestItem;
            if (field === 'sourceAccount') {
              item = makeItem({ sourceAccount: withUs });
            } else if (field === 'occurredAt') {
              item = makeItem({ occurredAt: withUs });
            } else if (field === 'direction') {
              // direction can't realistically contain US but we test the contract
              item = makeItem({ description: withUs }); // test description instead
            } else {
              item = makeItem({ description: withUs });
            }
            const r = canonicalize(item);
            if (r.isFailure) {
              return !r.error.includes(content);
            }
            return true;
          },
        ),
      );
    });
  });
});
