/**
 * Unit tests for the settlement: section in parseRawConfig (Story 4.3a, slice 6).
 *
 * Cases: optional section (absent config remains valid), duplicate account rejected
 * (findDuplicateIndices, P1-8 precedent), unknown partner rejected via a roster
 * cross-check against splits[0].rules (path-cited, partner name never echoed — PII
 * rule), min(1) on both fields, and the AppConfig.settlement mapping shape.
 *
 * fails if: the zod schema accepts an unknown partner, a duplicate account, an empty
 *   account/partner string, or a config-parse error message echoes a partner name.
 */
import { describe, it, expect } from 'vitest';
import { parseRawConfig } from '../../../../src/infra/config/config-schema.js';

const minimalValid = {
  dbPath: './data/ledger.db',
  defaultCurrency: 'EUR',
  timezone: 'Europe/Paris',
  accounts: [
    { id: 'main-12345678901', type: 'bank', filenamePrefix: '12345678901_' },
  ],
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
};

function withSettlement(settlement: unknown): Record<string, unknown> {
  return { ...minimalValid, settlement };
}

describe('parseRawConfig — settlement: section (Story 4.3a)', () => {
  describe('valid configs', () => {
    it('accepts a config without a settlement section (optional, absent is valid)', () => {
      // fails if the missing settlement key is rejected
      const result = parseRawConfig(minimalValid);
      expect(result.isSuccess).toBe(true);
      expect(result.value.settlement).toBeUndefined();
    });

    it('accepts a minimal settlement section mapping one account to a roster partner', () => {
      // fails if a well-formed single-account mapping is rejected
      const result = parseRawConfig(withSettlement({
        accounts: [{ account: 'income:contribution:alex', partner: 'Alex' }],
      }));
      expect(result.isSuccess).toBe(true);
      expect(result.value.settlement?.accounts).toHaveLength(1);
      expect(result.value.settlement?.accounts[0]).toEqual({ account: 'income:contribution:alex', partner: 'Alex' });
    });

    it('accepts multiple accounts mapped to different roster partners', () => {
      // fails if a well-formed multi-account mapping is rejected
      const result = parseRawConfig(withSettlement({
        accounts: [
          { account: 'income:contribution:alex', partner: 'Alex' },
          { account: 'income:contribution:sam', partner: 'Sam' },
        ],
      }));
      expect(result.isSuccess).toBe(true);
      expect(result.value.settlement?.accounts).toHaveLength(2);
    });

    it('accepts an empty accounts array', () => {
      // fails if an explicitly empty accounts array is rejected
      const result = parseRawConfig(withSettlement({ accounts: [] }));
      expect(result.isSuccess).toBe(true);
      expect(result.value.settlement?.accounts).toHaveLength(0);
    });
  });

  describe('invalid configs', () => {
    it('rejects a partner absent from the splits roster, without echoing the partner name', () => {
      // fails if an unknown partner is accepted, or if the error message leaks the partner string (PII)
      const result = parseRawConfig(withSettlement({
        accounts: [{ account: 'income:contribution:charlie', partner: 'Charlie' }],
      }));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('settlement.accounts.0.partner');
      expect(result.error).not.toContain('Charlie');
    });

    it('rejects a duplicate account via findDuplicateIndices', () => {
      // fails if superRefine is missing or the path is not cited (P1-8 precedent)
      const result = parseRawConfig(withSettlement({
        accounts: [
          { account: 'income:contribution:alex', partner: 'Alex' },
          { account: 'income:contribution:alex', partner: 'Sam' },
        ],
      }));
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('settlement.accounts.1.account: duplicate account');
    });

    it('rejects an empty account string', () => {
      // fails if min(1) is not enforced on account
      const result = parseRawConfig(withSettlement({ accounts: [{ account: '', partner: 'Alex' }] }));
      expect(result.isFailure).toBe(true);
    });

    it('rejects an empty partner string', () => {
      // fails if min(1) is not enforced on partner
      const result = parseRawConfig(withSettlement({ accounts: [{ account: 'income:contribution:alex', partner: '' }] }));
      expect(result.isFailure).toBe(true);
    });

    it('rejects an unknown key inside a settlement account entry (strict schema)', () => {
      // fails if the settlement account schema is not .strict()
      const result = parseRawConfig(withSettlement({
        accounts: [{ account: 'income:contribution:alex', partner: 'Alex', unexpected: true }],
      }));
      expect(result.isFailure).toBe(true);
    });
  });
});
