import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
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
    { id: 'card-1234', type: 'card', cardSuffix: '1234', filenamePrefix: 'carte_1234_' },
  ],
};

describe('parseRawConfig', () => {
  it('accepts minimal valid config (no buffers)', () => {
    // fails if parseRawConfig rejects a config with empty buffers array
    const result = parseRawConfig(minimalValid);
    expect(result.isSuccess).toBe(true);
    const config = result.value;
    expect(config.defaultCurrency).toBe('EUR');
    expect(config.splits).toHaveLength(1);
    expect(config.splits[0].rules).toHaveLength(2);
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
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 0.4 },
            { partner: 'Sam', ratio: 0.5 },
          ],
        },
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
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 0.5 },
            { partner: 'Alex', ratio: 0.5 },
          ],
        },
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
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 1.5 },
            { partner: 'Sam', ratio: -0.5 },
          ],
        },
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
      buffers: [{ name: 'Car', account: 'assets:buffer:car', target: 200, cap: 100 }],
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
        { name: 'Car', account: 'assets:buffer:car', target: 1000 },
        { name: 'Car', account: 'assets:buffer:car2', target: 2000 },
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
      buffers: [{ name: 'Car', account: 'assets:buffer:car', target: 1000.5, cap: 2000 }],
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
          { id: 'main-12345678901', type: 'bank', filenamePrefix: '12345678901_' },
          { id: 'main-12345678901', type: 'bank', filenamePrefix: 'carte_1234_' },
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
          { id: 'main-aaa', type: 'bank', filenamePrefix: 'shared_prefix_' },
          { id: 'card-bbb', type: 'bank', filenamePrefix: 'shared_prefix_' },
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
        accounts: [{ id: '', type: 'bank', filenamePrefix: '12345678901_' }],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
    });

    it('rejects an account entry with an empty filenamePrefix', () => {
      // fails if parseRawConfig accepts an account with an empty filenamePrefix
      const raw = {
        ...minimalValid,
        accounts: [{ id: 'main-aaa', type: 'bank', filenamePrefix: '' }],
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

  describe('split windows', () => {
    it('(a) accepts grouped-window shape (one window)', () => {
      // fails if: parseRawConfig rejects the new grouped-window splits format
      const result = parseRawConfig(minimalValid);
      expect(result.isSuccess).toBe(true);
      expect(result.value.splits).toHaveLength(1);
      expect(result.value.splits[0].validFrom).toBe('2024-01-01');
      expect(result.value.splits[0].rules).toHaveLength(2);
    });

    it('(b) rejects flat (old-shape) splits with a clear error citing the missing validFrom field', () => {
      // fails if: parseRawConfig still accepts the old flat splits format — Story 3.1
      // breaks backward compatibility intentionally (no production users)
      const raw = {
        ...minimalValid,
        splits: [
          { partner: 'Alex', ratio: 0.5 },
          { partner: 'Sam', ratio: 0.5 },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('validFrom');
    });

    it('(c) rejects duplicate validFrom across windows (path-cited)', () => {
      // fails if: schema accepts two windows with the same validFrom — would create
      // non-deterministic getSplitsAsOf results (whichever sorted first wins)
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('validFrom');
    });

    it('(d) rejects out-of-order windows (path-cited)', () => {
      // fails if: schema accepts windows in non-ascending validFrom order —
      // getSplitsAsOf linear scan relies on ascending order for correctness
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: '2026-03-15', rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }] },
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('validFrom');
    });

    it('(e) rejects per-window ratios not summing to 1.0', () => {
      // fails if: per-window ratio sum check is missing from the window-level superRefine
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.4 }, { partner: 'Sam', ratio: 0.4 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('ratios must sum to 1.0');
    });

    it('(f) rejects partner roster drift between windows — error cites path, no PII', () => {
      // fails if: cross-window partner roster check is missing, allowing mismatched rosters
      // into downstream consumers (getSplitsAsOf would silently return different partner sets)
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
          { validFrom: '2026-03-15', rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Jordan', ratio: 0.4 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      // path citation (P3 #9): error must cite the path of the offending window
      expect(result.error).toContain('splits.1.rules');
      // PII safety (P2 #1.f): partner names are user-controlled — must not echo them
      expect(result.error).not.toContain('Alex');
      expect(result.error).not.toContain('Jordan');
    });

    it.each([
      ['2024-01-01T00:00:00Z', 'timestamp with Z suffix'],
      ['2024-1-1', 'single-digit month/day'],
      ['', 'empty string'],
      [' 2024-01-01', 'leading whitespace'],
    ])('(g) rejects malformed validFrom %s (%s) — error cites validFrom by path', (value) => {
      // fails if: validFrom regex allows timestamps, single-digit dates, empty strings,
      // or whitespace-padded dates — these would pass string comparison but violate the
      // date-only contract; FR22 depends on consistent lexicographic ordering
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: value, rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('validFrom');
    });

    it('(h) rejects a window with fewer than 2 rules (couples-app constraint)', () => {
      // fails if: min(2) rules per window is not enforced — PRD mandates at least 2 partners
      // (couples app); a single-rule window would allow 100% allocation with no second partner
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 1.0 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
    });

    it('(i) accepts a single-window config (open-ended, the default first-time setup)', () => {
      // fails if: parseRawConfig rejects a single-window config (the most common first
      // setup where only one ratio set has ever applied)
      const result = parseRawConfig(minimalValid);
      expect(result.isSuccess).toBe(true);
      expect(result.value.splits).toHaveLength(1);
    });

    it('(j) accepts two windows with identical partner sets in different order (set equality)', () => {
      // fails if: roster check uses array equality instead of set equality —
      // [Alex, Sam] and [Sam, Alex] are the same partner set and must be accepted
      const raw = {
        ...minimalValid,
        splits: [
          { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] },
          { validFrom: '2026-03-15', rules: [{ partner: 'Sam', ratio: 0.4 }, { partner: 'Alex', ratio: 0.6 }] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isSuccess).toBe(true);
    });

    it('duplicate partner within a window is rejected with "duplicate partner" message', () => {
      // fails if: per-window duplicate partner check is missing or returns wrong message
      // (P2 #2: testpinned wording "duplicate partner")
      const raw = {
        ...minimalValid,
        splits: [
          {
            validFrom: '2024-01-01',
            rules: [
              { partner: 'Alex', ratio: 0.5 },
              { partner: 'Alex', ratio: 0.5 },
            ],
          },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate partner');
      expect(result.error).not.toContain('Alex');
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
            { minLength: 2, maxLength: 5 },
          ).filter(items => {
            const names = items.map(i => i.partner);
            return new Set(names).size === names.length;
          }),
          (items) => {
            const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
            const rules = items.map(i => ({ partner: i.partner, ratio: i.weight / totalWeight }));
            const splits = [{ validFrom: '2024-01-01', rules }];
            const raw = { ...minimalValid, splits };
            // fails if parseRawConfig rejects a splits window whose ratios were correctly rescaled to sum to 1
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
            { minLength: 2, maxLength: 3 },
          ).filter(items => {
            const names = items.map(i => i.partner);
            const sum = items.reduce((s, i) => s + i.ratio, 0);
            return new Set(names).size === names.length && Math.abs(sum - 1.0) > 1e-9;
          }),
          (items) => {
            const raw = { ...minimalValid, splits: [{ validFrom: '2024-01-01', rules: items }] };
            // fails if parseRawConfig accepts a splits window whose ratios do not sum to 1
            const result = parseRawConfig(raw);
            return result.isFailure;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // Helper unit tests for findDuplicateIndices semantics (story-maint-11 / #56)
  // The helper is private to config-schema; tested via schema duplicate-detection paths.
  describe('findDuplicateIndices semantics (via schema duplicate paths)', () => {
    it('empty input: no duplicates reported (accounts list of one)', () => {
      // Empty dedup domain: single-account config has no duplicates to find.
      const result = parseRawConfig({
        ...minimalValid,
        accounts: [{ id: 'sole', type: 'bank', filenamePrefix: 'sole_' }],
      });
      expect(result.isSuccess).toBe(true);
    });

    it('all-unique: no duplicate error', () => {
      // All keys distinct: findDuplicateIndices returns [].
      const result = parseRawConfig({
        ...minimalValid,
        accounts: [
          { id: 'a', type: 'bank', filenamePrefix: 'a_' },
          { id: 'b', type: 'bank', filenamePrefix: 'b_' },
          { id: 'c', type: 'bank', filenamePrefix: 'c_' },
        ],
      });
      expect(result.isSuccess).toBe(true);
    });

    it('all-duplicate: every element after the first is flagged', () => {
      // All same key: indices 1 and 2 are duplicates; index 0 is canonical.
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [
          { name: 'X', account: 'assets:buffer:x1', target: 100 },
          { name: 'X', account: 'assets:buffer:x2', target: 200 },
          { name: 'X', account: 'assets:buffer:x3', target: 300 },
        ],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate');
    });

    it('mixed: only later-occurring duplicates are flagged, not the first', () => {
      // [A, B, A]: index 2 is duplicate; index 0 is canonical. B is not a duplicate.
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [
          { name: 'Alpha', account: 'assets:buffer:alpha', target: 100 },
          { name: 'Beta', account: 'assets:buffer:beta', target: 200 },
          { name: 'Alpha', account: 'assets:buffer:alpha2', target: 300 },
        ],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate');
      // Error path must cite index 2 (0-indexed), not index 0
      expect(result.error).toContain('buffers.2.name');
    });

    it('non-adjacent duplicate: third element duplicates first', () => {
      // [A, B, C, A]: index 3 is duplicate of index 0. B and C are unique.
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [
          { name: 'First', account: 'assets:buffer:first', target: 100 },
          { name: 'Second', account: 'assets:buffer:second', target: 200 },
          { name: 'Third', account: 'assets:buffer:third', target: 300 },
          { name: 'First', account: 'assets:buffer:first2', target: 400 },
        ],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate');
      expect(result.error).toContain('buffers.3.name');
    });
  });

  describe('buffer account field (Story 3.2)', () => {
    it('rejects a buffer entry missing the account field', () => {
      // fails if parseRawConfig accepts a buffer without an account field
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [{ name: 'Car', target: 1000 }],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('account');
    });

    it('rejects a buffer entry with an empty account string', () => {
      // fails if parseRawConfig accepts a buffer with an empty account string
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [{ name: 'Car', account: '', target: 1000 }],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('account');
    });

    it('accepts a buffer with a valid account string', () => {
      // fails if parseRawConfig rejects a buffer with a valid account string
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [{ name: 'Car', account: 'assets:buffer:car', target: 1000 }],
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.buffers[0].account).toBe('assets:buffer:car');
    });

    it('rejects duplicate buffer accounts — path-cited at the duplicate index', () => {
      // fails if parseRawConfig does not detect duplicate buffer account strings
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [
          { name: 'Car', account: 'assets:buffer:shared', target: 1000 },
          { name: 'House', account: 'assets:buffer:shared', target: 5000 },
        ],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('duplicate account');
      expect(result.error).toContain('buffers.1.account');
    });

    it('rejects non-adjacent duplicate accounts — path-cited at the later index', () => {
      // fails if duplicate-account detection is position-sensitive
      const result = parseRawConfig({
        ...minimalValid,
        buffers: [
          { name: 'Car', account: 'assets:buffer:car', target: 1000 },
          { name: 'House', account: 'assets:buffer:house', target: 5000 },
          { name: 'Vac', account: 'assets:buffer:car', target: 500 },
        ],
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('buffers.2.account');
    });
  });
});

describe('parseRawConfig — autoTagRules (Story B)', () => {
  describe('Scenario: schema accepts grouped rules and flattens them in YAML order', () => {
    it('flattens two groups with multiple patterns, preserving order and flags', () => {
      // fails if the grouped→flat transform breaks order or omits flags (guards parseRawConfig flatten loop)
      const raw = {
        ...minimalValid,
        autoTagRules: [
          { category: 'Transport', patterns: ['uber\\|bolt', 'taxi'] },
          { category: 'Groceries', patterns: ['carrefour'] },
        ],
      };
      const result = parseRawConfig(raw);
      expect(result.isSuccess).toBe(true);
      const rules = result.value.autoTagRules;
      expect(rules).toHaveLength(3);
      expect(rules[0].category).toBe('Transport');
      expect(rules[0].pattern).toBeInstanceOf(RegExp);
      expect(rules[0].pattern.flags).toContain('i');
      expect(rules[0].pattern.source).toBe('uber\\|bolt');
      expect(rules[1].category).toBe('Transport');
      expect(rules[1].pattern.source).toBe('taxi');
      expect(rules[2].category).toBe('Groceries');
      expect(rules[2].pattern.source).toBe('carrefour');
    });
  });

  describe('Scenario: schema defaults missing autoTagRules to []', () => {
    it('returns autoTagRules = [] when the key is absent', () => {
      // fails if the missing key throws or yields undefined (guards .optional().default([]))
      const result = parseRawConfig(minimalValid);
      expect(result.isSuccess).toBe(true);
      expect(result.value.autoTagRules).toEqual([]);
    });
  });
});
