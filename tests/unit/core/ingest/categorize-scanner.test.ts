import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scanForUnmatched } from '../../../../src/core/ingest/categorize-scanner.js';
import type { AutoTagRule } from '../../../../src/core/ingest/auto-tag-rules.js';

// fails if: the scanner fabricates, dedups incorrectly, leaks already-matched strings,
//   misorders by frequency, applies wrong min-count threshold, or ignores existing rules.

const uberId = 'UBER FRANCE';
const altimaId = 'ALTIMA COURTAGE 9876';
const altimaId2 = 'ALTIMA COURTAGE 5432';
const cardId = 'PAIEMENT CARTE X1234 AVRIL';

function makeRule(pattern: string): AutoTagRule {
  return { pattern: new RegExp(pattern, 'i'), category: 'TestCat' };
}

describe('scanForUnmatched — frequency sort', () => {
  it('returns groups sorted by count descending', () => {
    const descriptions = [
      uberId, uberId, uberId, uberId,   // 4 occurrences
      altimaId, altimaId, altimaId,     // 3 occurrences
    ];
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe(uberId);
    expect(result[0].count).toBe(4);
    expect(result[1].description).toBe(altimaId);
    expect(result[1].count).toBe(3);
  });
});

describe('scanForUnmatched — min-count filter', () => {
  it('excludes groups with count < minCount', () => {
    const descriptions = [
      uberId, uberId, uberId,  // 3 occurrences — kept
      'ONE-OFF SHOP',           // 1 occurrence — excluded by minCount=2
    ];
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(uberId);
  });

  it('returns empty when all groups are below minCount', () => {
    const descriptions = ['A', 'B', 'C'];
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(0);
  });

  it('keeps groups with count == minCount', () => {
    const descriptions = [uberId, uberId]; // exactly 2 occurrences
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });
});

describe('scanForUnmatched — existing-rule filter', () => {
  it('excludes descriptions matched by an existing autotag rule', () => {
    const descriptions = [
      uberId, uberId, uberId,   // matched by 'uber' rule
      altimaId, altimaId, altimaId,
    ];
    const rules: AutoTagRule[] = [makeRule('uber')];
    const result = scanForUnmatched(descriptions, rules, { minCount: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(altimaId);
  });

  it('excludes card-settlement descriptions (PAIEMENT CARTE pattern)', () => {
    const descriptions = [
      cardId, cardId, cardId,   // card-settlement pattern
      altimaId, altimaId,
    ];
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(altimaId);
  });

  it('returns empty when all descriptions are already matched', () => {
    const descriptions = [uberId, uberId, uberId];
    const rules: AutoTagRule[] = [makeRule('uber')];
    const result = scanForUnmatched(descriptions, rules, { minCount: 2 });
    expect(result).toHaveLength(0);
  });
});

describe('scanForUnmatched — deduplication', () => {
  it('groups identical descriptions together', () => {
    const descriptions = [uberId, uberId, uberId];
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(uberId);
    expect(result[0].count).toBe(3);
  });

  it('treats distinct strings as distinct groups', () => {
    const descriptions = [
      altimaId, altimaId,
      altimaId2, altimaId2,
    ];
    const result = scanForUnmatched(descriptions, [], { minCount: 2 });
    expect(result).toHaveLength(2);
    const descs = result.map((g) => g.description);
    expect(descs).toContain(altimaId);
    expect(descs).toContain(altimaId2);
  });
});

describe('scanForUnmatched — empty input', () => {
  it('returns empty array for empty descriptions', () => {
    const result = scanForUnmatched([], [], { minCount: 2 });
    expect(result).toHaveLength(0);
  });
});

describe('scanForUnmatched — property test', () => {
  // Scenario (property test, fast-check): scanner output is a permutation/subset of the input
  it('output groups are a subset of input descriptions, pairwise distinct, all count >= minCount, no rule-matched', () => {
    const descriptionArb = fc.stringOf(fc.alphaNumericChar(), { minLength: 1, maxLength: 20 });
    const descriptionsArb = fc.array(descriptionArb, { minLength: 0, maxLength: 30 });
    const minCountArb = fc.integer({ min: 1, max: 5 });

    fc.assert(
      fc.property(descriptionsArb, minCountArb, (descriptions, minCount) => {
        const inputSet = new Set(descriptions);
        const result = scanForUnmatched(descriptions, [], { minCount });

        // 1. Every group.description appears in the input
        for (const group of result) {
          expect(inputSet.has(group.description)).toBe(true);
        }

        // 2. Output groups are pairwise distinct by description
        const outputDescs = result.map((g) => g.description);
        const outputDescSet = new Set(outputDescs);
        expect(outputDescSet.size).toBe(result.length);

        // 3. Every output group has count >= minCount
        for (const group of result) {
          expect(group.count).toBeGreaterThanOrEqual(minCount);
        }

        // 4. Count value matches actual occurrences in input
        for (const group of result) {
          const actualCount = descriptions.filter((d) => d === group.description).length;
          expect(group.count).toBe(actualCount);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('existing-rule filter: no output description is matched by any existingRules[i].pattern', () => {
    const descriptionArb = fc.constantFrom('UBER FRANCE', 'ALTIMA COURTAGE', 'CARREFOUR MARKET', 'ONE-OFF SHOP', 'AMAZON EU');
    const descriptionsArb = fc.array(descriptionArb, { minLength: 5, maxLength: 20 });
    const patternArb = fc.constantFrom('uber', 'altima', 'carrefour', 'amazon');

    fc.assert(
      fc.property(descriptionsArb, fc.array(patternArb, { maxLength: 3 }), (descriptions, patterns) => {
        const rules: AutoTagRule[] = patterns.map((p) => makeRule(p));
        const result = scanForUnmatched(descriptions, rules, { minCount: 1 });

        for (const group of result) {
          for (const rule of rules) {
            expect(rule.pattern.test(group.description)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
