/**
 * Unit tests for the config-schema PII tripwire (story-4.5a, invariant 4 — model note
 * docs/domain/model-notes/story-4.5.md).
 *
 * Gherkin coverage:
 *   - Scenario 3 (sensitive value tripwire) — see tests/features/config-change.feature.
 *
 * fails if: an IBAN-shaped or card-number-shaped string anywhere in accounting.yaml
 *   parses successfully instead of being rejected, or the rejection doesn't cite the
 *   offending field's path (so the user can't find and fix it).
 */
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
  buffers: [
    { name: 'Vacation', account: 'vacation-account', target: 1500, targetDate: '2026-12-01' },
  ],
  timezone: 'Europe/Paris',
  accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
};

// Well-known synthetic test vectors (Wikipedia's canonical IBAN example, Visa/Stripe's
// public test card number) — never real bank data (QA § Privacy, security-checklist §
// Secrets & PII "test fixtures contain synthetic data only").
const SENTINEL_IBAN = 'DE89370400440532013000';
const SENTINEL_CARD = '4111111111111111';

describe('config-schema PII tripwire — rejects sensitive-shaped strings anywhere', () => {
  it('rejects an IBAN-shaped string in a buffer account field, citing the path', () => {
    const raw = {
      ...minimalValid,
      buffers: [{ name: 'Vacation', account: SENTINEL_IBAN, target: 1500, targetDate: '2026-12-01' }],
    };
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('buffers.0.account');
  });

  it('rejects a card-shaped string in an account id field, citing the path', () => {
    const raw = { ...minimalValid, accounts: [{ id: SENTINEL_CARD, type: 'bank', filenamePrefix: 'main_' }] };
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('accounts.0.id');
  });

  it('rejects an IBAN-shaped string nested in a recurring rule name', () => {
    const raw = {
      ...minimalValid,
      recurring: [
        { name: SENTINEL_IBAN, category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-01-01' },
      ],
    };
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('recurring.0.name');
  });

  it('does not flag an ordinary valid config (no false positive)', () => {
    const result = parseRawConfig(minimalValid);
    expect(result.isSuccess).toBe(true);
  });
});

describe('config-schema PII tripwire — property: sentinel value at any unconstrained string field fails with its path', () => {
  // Each field below has no pre-existing format validator (unlike defaultCurrency/timezone,
  // which would reject the sentinel anyway on their own regex) — a rejection here can only
  // be attributed to the tripwire itself.
  it('placing a sentinel value in any of several unconstrained field positions always fails, citing that exact path', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<[string, unknown, string]>(
          ['dbPath', SENTINEL_IBAN, 'dbPath'],
          ['dbPath', SENTINEL_CARD, 'dbPath'],
        ),
        ([field, sentinelValue, expectedPath]) => {
          const raw = { ...minimalValid, [field]: sentinelValue };
          const result = parseRawConfig(raw);
          return result.isFailure && result.error.includes(expectedPath);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('placing a sentinel value in accounts.0.filenamePrefix (unconstrained format) fails, citing that path', () => {
    const raw = { ...minimalValid, accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: SENTINEL_IBAN }] };
    const result = parseRawConfig(raw);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('accounts.0.filenamePrefix');
  });
});
