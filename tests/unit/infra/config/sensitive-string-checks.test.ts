/**
 * Unit tests for the sensitive-string tripwire helpers — story-4.5a.
 *
 * Gherkin coverage: none directly (pure helper units) — exercised end-to-end by
 *   tests/features/config-change.feature Scenario 3 (sensitive value tripwire) via the
 *   config-schema.ts superRefine that calls these.
 *
 * fails if: looksLikeIban/looksLikeCardNumber accept a bare-shape string without checking
 *   the mod-97/Luhn checksum (would produce false positives on any 2-letter-prefixed
 *   alphanumeric string or any 13-19 digit run), or reject the well-known synthetic test
 *   vectors used across the industry (Wikipedia's IBAN example, Visa/Stripe test cards).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { looksLikeIban, looksLikeCardNumber } from '../../../../src/infra/config/sensitive-string-checks.js';

describe('looksLikeIban', () => {
  it('accepts well-known synthetic example IBANs (mod-97 valid)', () => {
    expect(looksLikeIban('DE89370400440532013000')).toBe(true);
    expect(looksLikeIban('GB29NWBK60161331926819')).toBe(true);
    expect(looksLikeIban('FR1420041010050500013M02606')).toBe(true);
  });

  it('rejects a shape-matching string with a broken checksum', () => {
    expect(looksLikeIban('DE89370400440532013001')).toBe(false);
  });

  it('rejects plain non-IBAN-shaped strings', () => {
    expect(looksLikeIban('main-account')).toBe(false);
    expect(looksLikeIban('vacation-account')).toBe(false);
    expect(looksLikeIban('')).toBe(false);
  });

  it('is tolerant of embedded whitespace and case', () => {
    expect(looksLikeIban('de89 3704 0044 0532 0130 00')).toBe(true);
  });
});

describe('looksLikeCardNumber', () => {
  it('accepts well-known synthetic test card numbers (Luhn valid)', () => {
    expect(looksLikeCardNumber('4111111111111111')).toBe(true);
    expect(looksLikeCardNumber('4242424242424242')).toBe(true);
  });

  it('rejects a digit run with a broken Luhn checksum', () => {
    expect(looksLikeCardNumber('4111111111111112')).toBe(false);
  });

  it('rejects strings outside the 13-19 digit range', () => {
    expect(looksLikeCardNumber('12345')).toBe(false);
    expect(looksLikeCardNumber('')).toBe(false);
  });

  it('is tolerant of embedded spaces and dashes', () => {
    expect(looksLikeCardNumber('4111-1111-1111-1111')).toBe(true);
    expect(looksLikeCardNumber('4111 1111 1111 1111')).toBe(true);
  });
});

describe('property: neither check flags ordinary user-chosen labels', () => {
  // Deterministically safe by construction, not by luck: a letter somewhere rules out
  // looksLikeCardNumber (digits-only after stripping separators), and a literal `-`/`_`
  // rules out looksLikeIban (its regex has no room for either character) — so this
  // never depends on a mod-97/Luhn checksum coincidentally passing.
  it('hyphen/underscore-joined alphanumeric labels (account ids, category names) never trip either check', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,5}[_-][a-zA-Z0-9]{0,8}$/), (label) => {
        return !looksLikeIban(label) && !looksLikeCardNumber(label);
      }),
      { numRuns: 200 },
    );
  });
});
