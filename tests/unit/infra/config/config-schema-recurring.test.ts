/**
 * Unit tests for recurring: schema validation in parseRawConfig (Story 3.3, Slice 2).
 *
 * Cases: required fields, cadence enum, positive amounts, validFrom/validTo ordering,
 * amendments strictly ascending, first amendment > rule.validFrom, last amendment <=
 * validTo (when validTo set), duplicate names, ISO date format validation.
 *
 * fails if: cadence enum is not enforced, non-positive amounts are accepted,
 *   validTo < validFrom is accepted, amendment ordering is not enforced,
 *   first amendment at rule.validFrom boundary is accepted,
 *   duplicate rule names are not caught,
 *   non-ISO date strings in any date field are accepted,
 *   path-citation drops index or field name (breaks user-facing error messages).
 */
import { describe, it, expect } from 'vitest';
import { parseRawConfig } from '../../../../src/infra/config/config-schema.js';

const minimalValid = {
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

function withRecurring(recurring: unknown): Record<string, unknown> {
  return { ...minimalValid, recurring };
}

describe('parseRawConfig — recurring: section (Story 3.3)', () => {
  describe('valid configs', () => {
    it('accepts empty recurring array', () => {
      // fails if an empty recurring array is rejected (valid config)
      const result = parseRawConfig(withRecurring([]));
      expect(result.isSuccess).toBe(true);
      expect(result.value.recurring).toHaveLength(0);
    });

    it('accepts config without recurring section (defaults to [])', () => {
      // fails if missing recurring key is rejected (optional, defaults to [])
      const result = parseRawConfig(minimalValid);
      expect(result.isSuccess).toBe(true);
      expect(result.value.recurring).toHaveLength(0);
    });

    it('accepts a minimal valid rule (monthly, no validTo, no amendments)', () => {
      // fails if minimal valid rule is rejected
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-01-15' },
      ]));
      expect(result.isSuccess).toBe(true);
      const rules = result.value.recurring;
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('Netflix');
      expect(rules[0].cadence).toBe('monthly');
      expect(rules[0].amount.amount).toBe(1299);
      expect(rules[0].amount.currency).toBe('EUR');
      expect(rules[0].validTo).toBeUndefined();
      expect(rules[0].amendments).toHaveLength(0);
    });

    it('accepts a rule with validTo (closed interval)', () => {
      // fails if validTo is not accepted as optional field
      const result = parseRawConfig(withRecurring([
        { name: 'OldStream', category: 'Subscriptions', cadence: 'monthly', amount: 9.99, validFrom: '2025-03-15', validTo: '2026-08-15' },
      ]));
      expect(result.isSuccess).toBe(true);
      expect(result.value.recurring[0].validTo).toBe('2026-08-15');
    });

    it('accepts a rule with amendments (strictly ascending validFrom)', () => {
      // fails if valid amendments are rejected
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [
            { validFrom: '2026-07-01', amount: 1050 },
          ],
        },
      ]));
      expect(result.isSuccess).toBe(true);
      const rule = result.value.recurring[0];
      expect(rule.amendments).toHaveLength(1);
      expect(rule.amendments[0].amount.amount).toBe(105000);
    });

    it('accepts amendment with validFrom == validTo (applies on last occurrence)', () => {
      // fails if amendment.validFrom == validTo boundary is rejected
      // The closed-interval semantics allow this: the occurrence on validTo itself uses
      // the amendment amount.
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          validTo: '2026-07-01',
          amendments: [
            { validFrom: '2026-07-01', amount: 1100 },
          ],
        },
      ]));
      expect(result.isSuccess).toBe(true);
    });

    it('accepts all three cadences: monthly, quarterly, annual', () => {
      // fails if quarterly or annual cadence enum values are rejected
      for (const cadence of ['monthly', 'quarterly', 'annual']) {
        const result = parseRawConfig(withRecurring([
          { name: `Rule-${cadence}`, category: 'X', cadence, amount: 100, validFrom: '2026-01-01' },
        ]));
        expect(result.isSuccess).toBe(true);
        expect(result.value.recurring[0].cadence).toBe(cadence);
      }
    });
  });

  describe('cadence enum validation', () => {
    it('rejects an unknown cadence value — error cites recurring.N.cadence', () => {
      // fails if cadence enum is not enforced
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'fortnightly', amount: 12.99, validFrom: '2026-01-15' },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring.0.cadence');
    });

    it('rejects cadence "weekly"', () => {
      // fails if weekly is mistakenly allowed
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'weekly', amount: 12.99, validFrom: '2026-01-15' },
      ]));
      expect(result.isFailure).toBe(true);
    });

    it('path cites the correct index for the second rule', () => {
      // fails if the error path drops the array index
      const result = parseRawConfig(withRecurring([
        { name: 'Rent', category: 'Rent', cadence: 'monthly', amount: 1000, validFrom: '2024-01-01' },
        { name: 'Netflix', category: 'Subscriptions', cadence: 'fortnightly', amount: 12.99, validFrom: '2026-01-15' },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring.1.cadence');
    });
  });

  describe('amount validation', () => {
    it('rejects amount of 0 — error cites path', () => {
      // fails if zero amount is accepted (amounts must be positive per AC)
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 0, validFrom: '2026-01-15' },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
    });

    it('rejects negative amount', () => {
      // fails if negative amounts are accepted
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: -12.99, validFrom: '2026-01-15' },
      ]));
      expect(result.isFailure).toBe(true);
    });

    it('rejects zero amendment amount', () => {
      // fails if zero amendment amount is accepted
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [{ validFrom: '2026-07-01', amount: 0 }],
        },
      ]));
      expect(result.isFailure).toBe(true);
    });
  });

  describe('date validation (ISO 8601 YYYY-MM-DD)', () => {
    it('rejects non-ISO validFrom in rule', () => {
      // fails if timestamp-format validFrom is accepted
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-01-15T00:00:00Z' },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
    });

    it('rejects non-ISO validTo', () => {
      // fails if timestamp-format validTo is accepted
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-01-15', validTo: '2026/12/31' },
      ]));
      expect(result.isFailure).toBe(true);
    });

    it('rejects non-ISO amendment validFrom', () => {
      // fails if timestamp-format amendment validFrom is accepted
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [{ validFrom: '2026/07/01', amount: 1050 }],
        },
      ]));
      expect(result.isFailure).toBe(true);
    });
  });

  describe('validTo ordering', () => {
    it('rejects validTo < validFrom', () => {
      // fails if the validTo >= validFrom guard is missing
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-06-15', validTo: '2026-01-15' },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
    });

    it('accepts validTo == validFrom (amendment applies on that single day)', () => {
      // Single-day lifecycle: validFrom == validTo, one occurrence on that day
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-06-15', validTo: '2026-06-15' },
      ]));
      expect(result.isSuccess).toBe(true);
    });
  });

  describe('amendments ordering', () => {
    it('rejects amendments not strictly ascending by validFrom', () => {
      // fails if amendments in non-ascending order are accepted
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [
            { validFrom: '2026-07-01', amount: 1050 },
            { validFrom: '2026-06-01', amount: 1100 },
          ],
        },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
    });

    it('rejects duplicate amendment validFrom dates', () => {
      // fails if two amendments with the same validFrom are accepted
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [
            { validFrom: '2026-07-01', amount: 1050 },
            { validFrom: '2026-07-01', amount: 1100 },
          ],
        },
      ]));
      expect(result.isFailure).toBe(true);
    });

    it('rejects first amendment with validFrom == rule.validFrom', () => {
      // fails if first amendment at the rule boundary is accepted
      // The first amendment's validFrom must be STRICTLY after rule.validFrom.
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [
            { validFrom: '2024-01-01', amount: 1050 },
          ],
        },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
    });

    it('rejects last amendment with validFrom strictly after validTo', () => {
      // fails if an amendment that can never apply is accepted
      // amendment.validFrom > validTo means it can never match an occurrence.
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          validTo: '2026-06-01',
          amendments: [
            { validFrom: '2026-07-01', amount: 1050 },
          ],
        },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
    });
  });

  describe('duplicate rule names', () => {
    it('rejects two rules with the same name — error cites recurring.N.name', () => {
      // fails if duplicate-name detection is missing
      const result = parseRawConfig(withRecurring([
        { name: 'Rent', category: 'Rent', cadence: 'monthly', amount: 1000, validFrom: '2024-01-01' },
        { name: 'Rent', category: 'Housing', cadence: 'monthly', amount: 1200, validFrom: '2024-06-01' },
      ]));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('recurring');
      expect(result.error).toContain('duplicate');
    });

    it('two rules with different names are accepted', () => {
      // fails if unique-name check is over-strict
      const result = parseRawConfig(withRecurring([
        { name: 'Rent', category: 'Rent', cadence: 'monthly', amount: 1000, validFrom: '2024-01-01' },
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2024-01-01' },
      ]));
      expect(result.isSuccess).toBe(true);
    });
  });

  describe('Money conversion', () => {
    it('converts decimal amounts to Money cents using defaultCurrency', () => {
      // fails if decimal amounts are not converted to integer cents
      const result = parseRawConfig(withRecurring([
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-01-15' },
      ]));
      expect(result.isSuccess).toBe(true);
      const rule = result.value.recurring[0];
      expect(rule.amount.amount).toBe(1299);
      expect(rule.amount.currency).toBe('EUR');
    });

    it('converts amendment amounts to Money cents', () => {
      // fails if amendment amounts are not converted
      const result = parseRawConfig(withRecurring([
        {
          name: 'Rent',
          category: 'Rent',
          cadence: 'monthly',
          amount: 1000,
          validFrom: '2024-01-01',
          amendments: [{ validFrom: '2026-07-01', amount: 1050.50 }],
        },
      ]));
      expect(result.isSuccess).toBe(true);
      expect(result.value.recurring[0].amendments[0].amount.amount).toBe(105050);
    });
  });
});
