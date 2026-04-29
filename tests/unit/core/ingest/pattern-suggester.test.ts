import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { suggestPattern, NOISE_TOKENS } from '../../../../src/core/ingest/pattern-suggester.js';

// fails if: the longest-token rule is not respected (guards core/ingest/pattern-suggester.ts)
// fails if: noise tokens leak past the filter (guards the NOISE_TOKENS list)
// fails if: a noise-only or numeric-only description yields a non-null suggestion (guards the null-fallback path)
// fails if: the result is not alphabetic-only, length < 4, not present in description, in NOISE_TOKENS, or not the longest eligible token

describe('suggestPattern — golden cases', () => {
  it('returns the longest alphabetic token ≥4 chars (altima=6, courtage=8 → courtage)', () => {
    // Gherkin scenario 1: ALTIMA COURTAGE 9876 → courtage (longest wins)
    expect(suggestPattern('ALTIMA COURTAGE 9876')).toBe('courtage');
  });

  it('drops noise tokens and returns the longest non-noise token', () => {
    // Gherkin scenario 2: VIR SARL CARREFOUR
    // vir < 4 chars (length-filtered), sarl in NOISE_TOKENS, carrefour=9 → carrefour
    expect(suggestPattern('VIR SARL CARREFOUR')).toBe('carrefour');
  });

  it('returns null when no token qualifies (CB 12345 23/04)', () => {
    // Gherkin scenario 3: all tokens are noise, too short, or numeric
    expect(suggestPattern('CB 12345 23/04')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(suggestPattern('')).toBeNull();
  });

  it('returns null for all-numeric description', () => {
    expect(suggestPattern('12345 67890')).toBeNull();
  });

  it('returns null when all alphabetic tokens are in NOISE_TOKENS', () => {
    expect(suggestPattern('SARL SAS FRANCE')).toBeNull();
  });

  it('returns null when all alphabetic tokens are < 4 chars', () => {
    expect(suggestPattern('CB VIR RIB')).toBeNull();
  });

  it('tie-break: returns the first occurrence when two tokens have equal length', () => {
    // "abcd" and "efgh" are both 4 chars, alphabetic, non-noise → first occurrence wins
    expect(suggestPattern('ABCD EFGH')).toBe('abcd');
  });

  it('handles mixed case — returns lowercased result', () => {
    expect(suggestPattern('PAYPAL')).toBe('paypal');
  });

  it('handles underscore as separator', () => {
    // tokenizes on /[\W_]+/ so underscore is a separator
    expect(suggestPattern('ALTIMA_COURTAGE')).toBe('courtage');
  });
});

describe('suggestPattern — NOISE_TOKENS export', () => {
  it('exports NOISE_TOKENS as a readonly array', () => {
    expect(Array.isArray(NOISE_TOKENS)).toBe(true);
    expect(NOISE_TOKENS.length).toBeGreaterThan(0);
  });

  it('NOISE_TOKENS contains expected French banking noise', () => {
    // spot-check a few known entries from the plan
    expect(NOISE_TOKENS).toContain('sarl');
    expect(NOISE_TOKENS).toContain('vir');
    expect(NOISE_TOKENS).toContain('prlv');
    expect(NOISE_TOKENS).toContain('carte');
    expect(NOISE_TOKENS).toContain('france');
    expect(NOISE_TOKENS).toContain('paris');
  });
});

describe('suggestPattern — property tests (fast-check)', () => {
  it('non-null result satisfies all 5 invariants', () => {
    // Invariants when result is non-null:
    // (1) alphabetic only [a-z]+
    // (2) length >= 4
    // (3) present in the lowercased description
    // (4) not in NOISE_TOKENS
    // (5) is the LONGEST eligible token (tie-break: first occurrence)
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (desc) => {
          const result = suggestPattern(desc);
          if (result === null) return true; // null case is valid

          // (1) alphabetic only
          expect(/^[a-z]+$/.test(result)).toBe(true);

          // (2) length >= 4
          expect(result.length).toBeGreaterThanOrEqual(4);

          // (3) present in the lowercased description
          expect(desc.toLowerCase()).toContain(result);

          // (4) not in NOISE_TOKENS
          expect(NOISE_TOKENS).not.toContain(result);

          // (5) is the LONGEST eligible token in the description
          // find all eligible tokens: alphabetic only, length >= 4, not noise, present in lowercased desc
          const tokens = desc.toLowerCase().split(/[\W_]+/).filter(
            (t) => /^[a-z]+$/.test(t) && t.length >= 4 && !NOISE_TOKENS.includes(t),
          );
          // result should have length >= all other eligible tokens
          for (const t of tokens) {
            expect(result.length).toBeGreaterThanOrEqual(t.length);
          }

          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('tie-break: when two tokens share the longest length, first occurrence is returned', () => {
    // Generate a description with two equal-length eligible tokens
    fc.assert(
      fc.property(
        fc.tuple(
          fc.stringMatching(/^[a-z]{4,8}$/).filter((t) => !NOISE_TOKENS.includes(t)),
          fc.stringMatching(/^[a-z]{4,8}$/).filter((t) => !NOISE_TOKENS.includes(t)),
        ).filter(([a, b]) => a !== b && a.length === b.length),
        ([first, second]) => {
          const desc = `${first.toUpperCase()} ${second.toUpperCase()}`;
          const result = suggestPattern(desc);
          expect(result).toBe(first); // first occurrence wins on tie
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});
