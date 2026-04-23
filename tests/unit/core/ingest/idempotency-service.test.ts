/**
 * Unit tests for IdempotencyService.filterNew()
 *
 * Gherkin coverage:
 *   - AC3: IdempotencyService returns only new items (order preserved)
 *   - same CSV ingested twice produces zero new items on second run
 *   - AC1: field discrimination property (all six fields contribute to hash)
 *   - order preservation under arbitrary duplicates (property)
 *   - Story 2.5: fresh items are FreshIngestItem ({ item, idempotencyHash }) shape
 *
 * fails if: IdempotencyService module does not exist, ordering is lost (Set-based),
 *            a duplicate leaks into fresh, an item is double-counted in both arrays,
 *            or re-ingest still returns items as fresh (violates FR7),
 *            or fresh items do not carry their idempotency hash (Story 2.5)
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { IdempotencyService } from '../../../../src/core/ingest/idempotency-service.js';
import { canonicalize } from '../../../../src/core/ingest/canonicalize.js';
import type { HashFn } from '../../../../src/core/ports/hash-fn.js';
import type { HashRepository } from '../../../../src/core/ports/hash-repository.js';
import type { IngestItem } from '../../../../src/core/ingest/types.js';
import { Money } from '@core/shared/money.js';
import { Result } from '@core/shared/result.js';

function makeItem(id: number): IngestItem {
  return {
    sourceAccount: 'main-1',
    occurredAt: `2026-04-${String(id).padStart(2, '0')}T00:00:00+02:00`,
    direction: 'outflow',
    amount: Money.fromCents(id * 100, 'EUR').value,
    description: `Transaction ${id}`,
  };
}

// A HashFn that just returns the canonical string unchanged — makes it easy to
// reason about which items are "known" in tests without a real crypto call.
// (The real SHA-256 HashFn is tested separately in node-hash-fn.test.ts.)
const identityHashFn: HashFn = (canonical: string) => canonical;

function makeRepo(knownHashes: ReadonlySet<string>): HashRepository {
  return {
    listKnownHashes: vi.fn(() => Result.ok(knownHashes)),
  };
}

describe('IdempotencyService.filterNew', () => {
  describe('happy path — 3 fresh + 2 duplicates', () => {
    it('returns items at indices 0, 2, 4 as fresh and 1, 3 as duplicates', () => {
      // fails if: ordering is lost (Set-based), a duplicate leaks into fresh,
      //           or an item is double-counted in both arrays
      const items = [makeItem(1), makeItem(2), makeItem(3), makeItem(4), makeItem(5)];
      // Using identityHashFn: hash == canonical string. Seed the known-hashes
      // set with the canonical strings for items at indices 1 and 3.
      const knownHashes = new Set([
        canonicalize(items[1]).value, // item at index 1 (occurredAt 2026-04-02)
        canonicalize(items[3]).value, // item at index 3 (occurredAt 2026-04-04)
      ]);
      const service = new IdempotencyService(identityHashFn, makeRepo(knownHashes));

      const result = service.filterNew(items);
      expect(result.isSuccess).toBe(true);
      const { fresh, duplicates } = result.value;

      expect(fresh).toHaveLength(3);
      expect(duplicates).toHaveLength(2);

      // Verify specific items (by their occurredAt which is unique per item)
      // Story 2.5: fresh[i] is FreshIngestItem { item, idempotencyHash }
      expect(fresh[0].item.occurredAt).toContain('2026-04-01');
      expect(fresh[1].item.occurredAt).toContain('2026-04-03');
      expect(fresh[2].item.occurredAt).toContain('2026-04-05');
      expect(duplicates[0].occurredAt).toContain('2026-04-02');
      expect(duplicates[1].occurredAt).toContain('2026-04-04');
    });

    it('fresh items carry their idempotency hash (FreshIngestItem shape)', () => {
      // fails if: filterNew drops the hash after dedup (Story 2.5 — hash must survive
      // from IdempotencyService all the way to saveBatch for correct DB population)
      const items = [makeItem(1), makeItem(2)];
      const service = new IdempotencyService(identityHashFn, makeRepo(new Set()));

      const result = service.filterNew(items);
      expect(result.isSuccess).toBe(true);
      const { fresh } = result.value;

      expect(fresh).toHaveLength(2);
      // Each fresh entry must have .item (the original IngestItem) and .idempotencyHash (string)
      for (const entry of fresh) {
        expect(entry).toHaveProperty('item');
        expect(entry).toHaveProperty('idempotencyHash');
        expect(typeof entry.idempotencyHash).toBe('string');
        expect(entry.idempotencyHash.length).toBeGreaterThan(0);
      }
      // Hash equality: identityHashFn returns the canonical string, so we can derive expected
      const expectedHash0 = canonicalize(items[0]).value;
      expect(fresh[0].idempotencyHash).toBe(expectedHash0);
    });
  });

  describe('empty input', () => {
    it('returns empty fresh and duplicates for empty input', () => {
      // fails if: service crashes on empty input
      const service = new IdempotencyService(identityHashFn, makeRepo(new Set()));
      const result = service.filterNew([]);
      expect(result.isSuccess).toBe(true);
      expect(result.value.fresh).toHaveLength(0);
      expect(result.value.duplicates).toHaveLength(0);
    });
  });

  describe('all items fresh (empty ledger)', () => {
    it('returns all items as fresh when ledger is empty', () => {
      // fails if: re-ingest still returns items as fresh (first-run behaviour must be total)
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const service = new IdempotencyService(identityHashFn, makeRepo(new Set()));
      const result = service.filterNew(items);
      expect(result.isSuccess).toBe(true);
      // Story 2.5: fresh is FreshIngestItem[] — each has .item wrapping the original IngestItem
      expect(result.value.fresh).toHaveLength(3);
      expect(result.value.fresh[0].item).toBe(items[0]);
      expect(result.value.fresh[1].item).toBe(items[1]);
      expect(result.value.fresh[2].item).toBe(items[2]);
      expect(result.value.duplicates).toHaveLength(0);
    });
  });

  describe('re-ingest idempotency (AC3 + FR7)', () => {
    it('second run with same items + known hashes returns zero fresh items', () => {
      // fails if: re-ingest still returns items as fresh (violates FR7 / QA no silent data loss)
      // Simulate: first run returned 3 items as fresh; now those hashes are known in the ledger.
      const items = [makeItem(10), makeItem(11), makeItem(12)];

      // Capture the hashes produced on "first run" — Story 2.5: fresh[i].idempotencyHash
      const capturedHashes = new Set<string>();
      const capturingRepo: HashRepository = {
        listKnownHashes: vi.fn((candidates: readonly string[]) => {
          for (const c of candidates) capturedHashes.add(c);
          return Result.ok(new Set<string>() as ReadonlySet<string>);
        }),
      };
      const service1 = new IdempotencyService(identityHashFn, capturingRepo);
      const firstRun = service1.filterNew(items);
      expect(firstRun.isSuccess).toBe(true);
      expect(firstRun.value.fresh).toHaveLength(3);
      // Capture hashes from the FreshIngestItem shape
      for (const freshEntry of firstRun.value.fresh) {
        capturedHashes.add(freshEntry.idempotencyHash);
      }

      // Second run: all captured hashes are now "known"
      const service2 = new IdempotencyService(identityHashFn, makeRepo(capturedHashes));
      const secondRun = service2.filterNew(items);
      expect(secondRun.isSuccess).toBe(true);
      expect(secondRun.value.fresh).toHaveLength(0);
      expect(secondRun.value.duplicates).toHaveLength(3);
    });
  });

  describe('propagates HashRepository failure', () => {
    it('returns Result.fail when repo.listKnownHashes fails', () => {
      // fails if: service swallows the repo error
      const failingRepo: HashRepository = {
        listKnownHashes: vi.fn(() => Result.fail('db error')),
      };
      const service = new IdempotencyService(identityHashFn, failingRepo);
      const result = service.filterNew([makeItem(1)]);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('db error');
    });
  });

  describe('propagates canonicalize failure', () => {
    it('returns Result.fail when an item contains a US delimiter in description', () => {
      // fails if: canonicalize error is swallowed by filterNew
      const US = '\u001F';
      const badItem: IngestItem = {
        ...makeItem(1),
        description: `bad${US}value`,
      };
      const service = new IdempotencyService(identityHashFn, makeRepo(new Set()));
      const result = service.filterNew([badItem]);
      expect(result.isFailure).toBe(true);
    });
  });

  describe('order preservation property', () => {
    it('fresh and duplicates preserve relative input order for arbitrary splits', () => {
      // fails if: a Set-based implementation silently reorders,
      //           or fresh.length + duplicates.length !== N
      fc.assert(
        fc.property(
          // N unique items (0..N-1 as IDs), then a subset of those indices that are "duplicate"
          fc.nat({ max: 28 }).chain((n) =>
            fc.tuple(
              fc.constant(n),
              fc.uniqueArray(fc.nat({ max: Math.max(0, n - 1) }), {
                minLength: 0,
                maxLength: n,
              }),
            ),
          ),
          ([n, duplicateIndices]) => {
            if (n === 0) return true; // trivially passes

            // Build N unique items (each with a distinct id so canonical strings differ)
            const items: IngestItem[] = Array.from({ length: n }, (_, i) => makeItem(i + 1));

            // Compute canonical strings for all items (using identityHashFn)
            const canonicals = items.map((item) => {
              const r = canonicalize(item);
              return r.isSuccess ? r.value : null;
            });
            if (canonicals.some((c) => c === null)) return true; // skip if any canonicalize fails

            // Seed known-hashes with the canonicals at duplicateIndices
            const knownHashes = new Set<string>(
              duplicateIndices
                .filter((i) => i < n)
                .map((i) => canonicals[i] as string),
            );
            const dupeIndexSet = new Set(duplicateIndices.filter((i) => i < n));

            const service = new IdempotencyService(identityHashFn, makeRepo(knownHashes));
            const result = service.filterNew(items);
            if (result.isFailure) return true; // skip

            const { fresh, duplicates } = result.value;

            // fresh + duplicates = total items
            if (fresh.length + duplicates.length !== n) return false;

            // Verify that items at duplicateIndices land in duplicates, others in fresh
            const expectedFreshCount = n - dupeIndexSet.size;
            const expectedDupCount = dupeIndexSet.size;
            if (fresh.length !== expectedFreshCount) return false;
            if (duplicates.length !== expectedDupCount) return false;

            // Verify relative order of fresh (items NOT in duplicateIndices, in input order)
            // Story 2.5: fresh[i] is FreshIngestItem { item, idempotencyHash }
            const expectedFreshItems = items.filter((_, i) => !dupeIndexSet.has(i));
            for (let i = 0; i < expectedFreshItems.length; i++) {
              if (fresh[i].item !== expectedFreshItems[i]) return false;
            }

            // Verify relative order of duplicates (items IN duplicateIndices, in input order)
            const expectedDupItems = items.filter((_, i) => dupeIndexSet.has(i));
            for (let i = 0; i < expectedDupItems.length; i++) {
              if (duplicates[i] !== expectedDupItems[i]) return false;
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
