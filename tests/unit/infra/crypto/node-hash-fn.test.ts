/**
 * Unit tests for NodeHashFn (SHA-256 adapter).
 *
 * Gherkin coverage:
 *   - AC1: deterministic hash — hashing the same canonical string twice yields the same 64-hex-char result
 *   - AC1: hash discriminates on every input field (via property test)
 *
 * fails if: NodeHashFn module does not exist, output is not a 64-hex-char string,
 *            two identical inputs produce different digests (non-deterministic),
 *            or two different inputs produce the same digest (collision for realistic inputs)
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { nodeHashFn } from '../../../../src/infra/crypto/node-hash-fn.js';

describe('nodeHashFn (SHA-256)', () => {
  describe('output format', () => {
    it('returns a 64-character lowercase hexadecimal string', () => {
      // fails if: digest is not SHA-256 hex (e.g. base64 would be 44 chars, SHA-1 would be 40)
      const result = nodeHashFn('test-canonical-string');
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('determinism', () => {
    it('hashing the same string twice returns the same digest', () => {
      // fails if: hash fn is non-deterministic (e.g. includes a random salt)
      const canonical = 'main-1\u001F2026-04-20T00:00:00+02:00\u001Foutflow\u001F8550\u001FEUR\u001FSUPERMARCHE FICTIF';
      expect(nodeHashFn(canonical)).toBe(nodeHashFn(canonical));
    });

    it('property: deterministic for any arbitrary string', () => {
      // fails if: any input triggers non-deterministic behaviour
      fc.assert(
        fc.property(fc.string(), (s) => {
          return nodeHashFn(s) === nodeHashFn(s);
        }),
      );
    });
  });

  describe('discrimination', () => {
    it('two different canonical strings produce different digests', () => {
      // fails if: hash fn silently collapses distinct inputs (collision on a short test case)
      const a = 'main-1\u001F2026-04-20T00:00:00+02:00\u001Foutflow\u001F8550\u001FEUR\u001FSUPERMARCHE FICTIF';
      const b = 'main-1\u001F2026-04-21T00:00:00+02:00\u001Foutflow\u001F8550\u001FEUR\u001FSUPERMARCHE FICTIF';
      expect(nodeHashFn(a)).not.toBe(nodeHashFn(b));
    });

    it('property: any two distinct non-empty strings produce different digests', () => {
      // fails if: a single-field omission from canonicalize creates a structural collision
      // Note: SHA-256 collision probability is negligible for any realistic set of inputs.
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          (a, b) => {
            // Only check discrimination when inputs are actually different
            if (a === b) return true;
            return nodeHashFn(a) !== nodeHashFn(b);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('known vector', () => {
    it('matches the expected SHA-256 digest for a known canonical string', () => {
      // fails if: the algorithm is not SHA-256 hex (e.g. SHA-1 or MD5 would produce a different digest)
      // echo -n 'hello' | sha256sum → 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(nodeHashFn('hello')).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      );
    });
  });
});
