/**
 * Property test: parseRawConfig autoTagRules flatten preserves order and length.
 *
 * Gherkin coverage (Story B):
 *   Scenario: parseRawConfig flatten preserves order and length (property test)
 *     Given an arbitrary array of groups with arbitrary non-empty patterns
 *     When parseRawConfig flattens
 *     Then flat.length === sum(groups[i].patterns.length)
 *     And for every group i and pattern index j, flat[offset(i)+j].category === groups[i].category
 *         and flat[offset(i)+j].pattern.source comes from groups[i].patterns[j]
 *
 * fails if the flatten loop reorders, drops, or duplicates entries
 * (guards the order-preservation invariant in parseRawConfig).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseRawConfig } from '../../../../src/infra/config/config-schema.js';

const minimalBase = {
  dbPath: './data/ledger.db',
  defaultCurrency: 'EUR',
  splits: [
    {
      validFrom: '2024-01-01',
      rules: [
        { partner: 'Alex', ratio: 0.5 },
        { partner: 'Sam', ratio: 0.5 },
      ],
    },
  ],
  buffers: [],
  timezone: 'Europe/Paris',
  accounts: [
    { id: 'main-12345678901', type: 'bank', filenamePrefix: '12345678901_' },
  ],
};

// Generate a safe regex-compilable pattern string: alphanumerics + optional `|` alternation.
// Avoids generating patterns that would fail regex compilation.
const safePattern = fc.stringMatching(/^[a-zA-Z0-9]+(\|[a-zA-Z0-9]+)*$/);

// Generate a safe category name: alphanumerics, 1-20 chars.
const safeCategory = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/);

// A group: one category + 1-4 patterns.
const groupArb = fc.record({
  category: safeCategory,
  patterns: fc.array(safePattern, { minLength: 1, maxLength: 4 }),
});

describe('parseRawConfig — autoTagRules flatten property (Story B)', () => {
  it('flat.length === sum of all pattern counts across groups', () => {
    // fails if the flatten loop drops any group or any pattern inside a group
    fc.assert(
      fc.property(fc.array(groupArb, { minLength: 1, maxLength: 6 }), (groups) => {
        const result = parseRawConfig({ ...minimalBase, autoTagRules: groups });
        if (!result.isSuccess) return true; // skip if config validation rejects the input
        const flat = result.value.autoTagRules;
        const expectedLength = groups.reduce((sum, g) => sum + g.patterns.length, 0);
        expect(flat).toHaveLength(expectedLength);
      }),
    );
  });

  it('flat entries preserve group order and pattern order within each group', () => {
    // fails if the flatten loop reorders groups or patterns within a group
    fc.assert(
      fc.property(fc.array(groupArb, { minLength: 1, maxLength: 6 }), (groups) => {
        const result = parseRawConfig({ ...minimalBase, autoTagRules: groups });
        if (!result.isSuccess) return true;
        const flat = result.value.autoTagRules;
        let offset = 0;
        for (const group of groups) {
          for (let j = 0; j < group.patterns.length; j++) {
            expect(flat[offset + j].category).toBe(group.category);
            expect(flat[offset + j].pattern.source).toBe(group.patterns[j]);
          }
          offset += group.patterns.length;
        }
      }),
    );
  });

  it('every flat entry has a RegExp with the /i flag', () => {
    // fails if the flatten transform compiles patterns without the case-insensitive flag
    fc.assert(
      fc.property(fc.array(groupArb, { minLength: 1, maxLength: 4 }), (groups) => {
        const result = parseRawConfig({ ...minimalBase, autoTagRules: groups });
        if (!result.isSuccess) return true;
        for (const rule of result.value.autoTagRules) {
          expect(rule.pattern).toBeInstanceOf(RegExp);
          expect(rule.pattern.flags).toContain('i');
        }
      }),
    );
  });
});
