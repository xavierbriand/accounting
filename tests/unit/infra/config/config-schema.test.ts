import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseRawConfig } from '../../../../src/infra/config/config-schema.js';

const minimalValid = {
  dbPath: './data/ledger.db',
  defaultCurrency: 'EUR',
  splits: [
    { partner: 'Alex', ratio: 0.5 },
    { partner: 'Sam', ratio: 0.5 },
  ],
  buffers: [],
  timezone: 'Europe/Paris',
  accounts: [
    { id: 'main-12345678901', filenamePrefix: '12345678901_' },
    { id: 'card-1234', filenamePrefix: 'carte_1234_' },
  ],
};

describe('parseRawConfig', () => {
  it('accepts minimal valid config (no buffers)', () => {
    // fails if parseRawConfig rejects a config with empty buffers array
    const result = parseRawConfig(minimalValid);
    expect(result.isSuccess).toBe(true);
    const config = result.value;
    expect(config.defaultCurrency).toBe('EUR');
    expect(config.splits).toHaveLength(2);
  });

  it('rejects missing splits with friendly message', () => {
    const raw = { dbPath: './data/ledger.db', defaultCurrency: 'EUR', buffers: [] };
    // fails if parseRawConfig does not produce a human-readable error for missing splits
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('splits');
    expect(result.error).not.toContain('ZodError');
    expect(result.error).not.toContain('at Object');
  });

  it('rejects ratios not summing to 1', () => {
    const raw = {
      ...minimalValid,
      splits: [
        { partner: 'Alex', ratio: 0.4 },
        { partner: 'Sam', ratio: 0.5 },
      ],
    };
    // fails if parseRawConfig does not validate that split ratios sum to 1.0
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('ratios must sum to 1.0');
  });

  it('rejects duplicate partner names — error cites path not value', () => {
    const raw = {
      ...minimalValid,
      splits: [
        { partner: 'Alex', ratio: 0.5 },
        { partner: 'Alex', ratio: 0.5 },
      ],
    };
    // fails if parseRawConfig does not detect duplicate partner names
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('duplicate');
    // PII-safe: error must NOT contain the actual partner name value
    expect(result.error).not.toContain('Alex');
  });

  it('rejects ratio out of [0,1]', () => {
    const raw = {
      ...minimalValid,
      splits: [
        { partner: 'Alex', ratio: 1.5 },
        { partner: 'Sam', ratio: -0.5 },
      ],
    };
    // fails if parseRawConfig does not validate ratio range [0, 1]
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
  });

  it('rejects non-ISO currency ("EURO")', () => {
    const raw = { ...minimalValid, defaultCurrency: 'EURO' };
    // fails if parseRawConfig does not enforce 3-letter ISO currency code
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('3-letter ISO 4217');
  });

  it('rejects buffer with cap < target', () => {
    const raw = {
      ...minimalValid,
      buffers: [{ name: 'Car', target: 200, cap: 100 }],
    };
    // fails if parseRawConfig does not enforce cap >= target for buffers
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('cap');
  });

  it('rejects duplicate bucket names — error cites path not value', () => {
    const raw = {
      ...minimalValid,
      buffers: [
        { name: 'Car', target: 1000 },
        { name: 'Car', target: 2000 },
      ],
    };
    // fails if parseRawConfig does not detect duplicate bucket names
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('duplicate');
    // PII-safe: error must NOT contain the actual bucket name value
    expect(result.error).not.toContain('Car');
  });

  it('rejects unknown top-level key ("dbPaht")', () => {
    const raw = { ...minimalValid, dbPaht: './data/ledger.db' };
    // fails if parseRawConfig does not reject unknown top-level keys (schema not strict)
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('dbPaht');
  });

  it('maps decimal targets/caps to Money with defaultCurrency', () => {
    const raw = {
      ...minimalValid,
      buffers: [{ name: 'Car', target: 1000.5, cap: 2000 }],
    };
    // fails if parseRawConfig does not convert decimal amounts to Money using defaultCurrency
    const result = parseRawConfig(raw);
    expect(result.isSuccess).toBe(true);
    const bucket = result.value.buffers[0];
    expect(bucket.target.amount).toBe(100050);
    expect(bucket.target.currency).toBe('EUR');
    expect(bucket.cap?.amount).toBe(200000);
    expect(bucket.cap?.currency).toBe('EUR');
  });

  describe('timezone field', () => {
    it('accepts a valid IANA timezone', () => {
      // fails if parseRawConfig rejects a valid IANA timezone string
      const result = parseRawConfig({ ...minimalValid, timezone: 'Europe/Paris' });
      expect(result.isSuccess).toBe(true);
      expect(result.value.timezone).toBe('Europe/Paris');
    });

    it('accepts UTC as a valid IANA timezone', () => {
      // fails if parseRawConfig rejects 'UTC' as a valid timezone
      const result = parseRawConfig({ ...minimalValid, timezone: 'UTC' });
      expect(result.isSuccess).toBe(true);
      expect(result.value.timezone).toBe('UTC');
    });

    it('rejects an invalid timezone string', () => {
      // fails if parseRawConfig accepts an invalid IANA timezone like 'Not/AZone'
      const result = parseRawConfig({ ...minimalValid, timezone: 'Not/AZone' });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('timezone');
    });

    it('rejects a missing timezone field', () => {
      // fails if parseRawConfig accepts a config with no timezone field
      const withoutTimezone = Object.fromEntries(
        Object.entries(minimalValid).filter(([k]) => k !== 'timezone'),
      );
      const result = parseRawConfig(withoutTimezone);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('timezone');
    });
  });

  describe('accounts field', () => {
    it('accepts a valid accounts list', () => {
      // fails if parseRawConfig rejects a valid accounts array
      const result = parseRawConfig(minimalValid);
      expect(result.isSuccess).toBe(true);
      expect(result.value.accounts).toHaveLength(2);
      expect(result.value.accounts[0].id).toBe('main-12345678901');
      expect(result.value.accounts[0].filenamePrefix).toBe('12345678901_');
    });

    it('rejects a missing accounts field', () => {
      // fails if parseRawConfig accepts a config with no accounts field
      const withoutAccounts = Object.fromEntries(
        Object.entries(minimalValid).filter(([k]) => k !== 'accounts'),
      );
      const result = parseRawConfig(withoutAccounts);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('accounts');
    });

    it('rejects an empty accounts array', () => {
      // fails if parseRawConfig accepts an empty accounts array
      const result = parseRawConfig({ ...minimalValid, accounts: [] });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('accounts');
    });

    it('rejects duplicate account ids — error cites path not value', () => {
      const raw = {
        ...minimalValid,
        accounts: [
          { id: 'main-12345678901', filenamePrefix: '12345678901_' },
          { id: 'main-12345678901', filenamePrefix: 'carte_1234_' },
        ],
      };
      // fails if parseRawConfig does not detect duplicate account ids
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate');
      // PII-safe: error must NOT echo the user-chosen id value
      expect(result.error).not.toContain('main-12345678901');
    });

    it('rejects duplicate filenamePrefix values — error cites path not value', () => {
      const raw = {
        ...minimalValid,
        accounts: [
          { id: 'main-aaa', filenamePrefix: 'shared_prefix_' },
          { id: 'card-bbb', filenamePrefix: 'shared_prefix_' },
        ],
      };
      // fails if parseRawConfig does not detect duplicate filenamePrefix values
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate');
      // PII-safe: error must NOT echo the user-chosen prefix value
      expect(result.error).not.toContain('shared_prefix_');
    });

    it('rejects an account entry with an empty id', () => {
      // fails if parseRawConfig accepts an account with an empty id
      const raw = {
        ...minimalValid,
        accounts: [{ id: '', filenamePrefix: '12345678901_' }],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
    });

    it('rejects an account entry with an empty filenamePrefix', () => {
      // fails if parseRawConfig accepts an account with an empty filenamePrefix
      const raw = {
        ...minimalValid,
        accounts: [{ id: 'main-aaa', filenamePrefix: '' }],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
    });

    describe('type field (Story 2.3)', () => {
      it('accepts a bank account with type: bank', () => {
        // fails if parseRawConfig rejects a valid bank-type account entry
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'main-1', type: 'bank', filenamePrefix: '12345678901_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isSuccess).toBe(true);
        expect(result.value.accounts[0].type).toBe('bank');
      });

      it('accepts a card account with type: card and valid cardSuffix', () => {
        // fails if parseRawConfig rejects a valid card-type account with a 4-digit cardSuffix
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'main-1', type: 'bank', filenamePrefix: '12345678901_' },
            { id: 'card-1234', type: 'card', cardSuffix: '1234', filenamePrefix: 'carte_1234_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isSuccess).toBe(true);
        expect(result.value.accounts[1].type).toBe('card');
        expect(result.value.accounts[1].cardSuffix).toBe('1234');
      });

      it('rejects an account with an unknown type value — error names the field not the value', () => {
        // fails if parseRawConfig accepts an account with type !== 'bank' | 'card'
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'main-1', type: 'savings', filenamePrefix: '12345678901_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isFailure).toBe(true);
        expect(result.error).toContain('type');
        // PII-safe: must not echo the user-supplied value
        expect(result.error).not.toContain('savings');
      });

      it('rejects a missing type field', () => {
        // fails if parseRawConfig accepts an account entry with no type field
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'main-1', filenamePrefix: '12345678901_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isFailure).toBe(true);
        expect(result.error).toContain('type');
      });

      it('rejects a card account missing cardSuffix — error names the field not the value', () => {
        // fails if parseRawConfig accepts a card-type account without a cardSuffix
        // (cross-field superRefine: type==='card' requires cardSuffix)
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'card-1234', type: 'card', filenamePrefix: 'carte_1234_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isFailure).toBe(true);
        expect(result.error).toContain('cardSuffix');
      });

      it('rejects a card account with a non-4-digit cardSuffix', () => {
        // fails if parseRawConfig accepts cardSuffix not matching /^\d{4}$/
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'card-1234', type: 'card', cardSuffix: '12', filenamePrefix: 'carte_1234_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isFailure).toBe(true);
        expect(result.error).toContain('cardSuffix');
      });

      it('rejects a bank account that has a cardSuffix — error names the field not the value', () => {
        // fails if parseRawConfig allows cardSuffix on a bank account
        // (cross-field superRefine: type==='bank' must not have cardSuffix)
        const raw = {
          ...minimalValid,
          accounts: [
            { id: 'main-1', type: 'bank', cardSuffix: '1234', filenamePrefix: '12345678901_' },
          ],
        };
        const result = parseRawConfig(raw);
        expect(result.isFailure).toBe(true);
        expect(result.error).toContain('cardSuffix');
        // PII-safe: must not echo the user-supplied suffix value
        expect(result.error).not.toContain('1234');
      });
    });
  });

  describe('property tests', () => {
    it('succeeds for any splits where ratios sum to 1 with unique partners', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              partner: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z]+$/.test(s)),
              weight: fc.float({ min: Math.fround(0.01), max: Math.fround(1.0), noNaN: true }),
            }),
            { minLength: 1, maxLength: 5 },
          ).filter(items => {
            const names = items.map(i => i.partner);
            return new Set(names).size === names.length;
          }),
          (items) => {
            const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
            const splits = items.map(i => ({ partner: i.partner, ratio: i.weight / totalWeight }));
            const raw = { ...minimalValid, splits };
            // fails if parseRawConfig rejects a splits array whose ratios were correctly rescaled to sum to 1
            const result = parseRawConfig(raw);
            return result.isSuccess;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('fails for any splits where ratios do not sum to 1', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              partner: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z]+$/.test(s)),
              ratio: fc.float({ min: Math.fround(0.01), max: Math.fround(0.4), noNaN: true }),
            }),
            { minLength: 1, maxLength: 3 },
          ).filter(items => {
            const names = items.map(i => i.partner);
            const sum = items.reduce((s, i) => s + i.ratio, 0);
            return new Set(names).size === names.length && Math.abs(sum - 1.0) > 1e-9;
          }),
          (items) => {
            const raw = { ...minimalValid, splits: items };
            // fails if parseRawConfig accepts a splits array whose ratios do not sum to 1
            const result = parseRawConfig(raw);
            return result.isFailure;
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
