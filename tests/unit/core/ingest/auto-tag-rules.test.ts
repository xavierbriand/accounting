/**
 * Unit tests for auto-tag rule seed.
 *
 * Gherkin coverage (Scenario: TransactionBuilder + auto-tagger obvious basics):
 *   - Each seed rule matches a known BPCE-style description
 *   - A known decoy does not match any rule
 *   - Unmatched descriptions fall through to Uncategorized
 *
 * fails if: a seed rule pattern is missing, mis-spelled, or uses wrong flags;
 *           or if a rule accidentally matches unrelated descriptions
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RULES } from '../../../../src/core/ingest/auto-tag-rules.js';

function matchCategory(description: string): string | undefined {
  const rule = DEFAULT_RULES.find((r) => r.pattern.test(description));
  return rule?.category;
}

describe('DEFAULT_RULES auto-tag seed', () => {
  it('matches Transport for Uber', () => {
    // fails if the /uber/i rule is absent or misspelled
    expect(matchCategory('UBER TRIP 2026')).toBe('Transport');
    expect(matchCategory('BOLT EATS')).toBe('Transport');
    expect(matchCategory('TAXI PARISIEN')).toBe('Transport');
  });

  it('matches Groceries for French supermarkets', () => {
    // fails if supermarket patterns are absent
    expect(matchCategory('CARREFOUR MARKET')).toBe('Groceries');
    expect(matchCategory('MONOPRIX PARIS')).toBe('Groceries');
    expect(matchCategory('BIOCOOP LYON')).toBe('Groceries');
  });

  it('matches Fuel for petrol stations', () => {
    // fails if fuel patterns are absent
    expect(matchCategory('TOTAL STATION 75')).toBe('Fuel');
    expect(matchCategory('SHELL SERVICES')).toBe('Fuel');
  });

  it('matches Restaurant for dining', () => {
    // fails if restaurant pattern is absent
    expect(matchCategory('LE PETIT RESTAURANT')).toBe('Restaurant');
    expect(matchCategory('CAFE DU MARCHE')).toBe('Restaurant');
  });

  it('matches Utilities for telecom/energy', () => {
    // fails if utilities patterns are absent
    expect(matchCategory('EDF PRELEVEMENT')).toBe('Utilities');
    expect(matchCategory('FREE MOBILE')).toBe('Utilities');
    expect(matchCategory('ORANGE TELECOM')).toBe('Utilities');
  });

  it('matches BankingFees for bank charges', () => {
    // fails if banking-fees patterns are absent
    expect(matchCategory('COTISATION CB VISA')).toBe('BankingFees');
    expect(matchCategory('FRAIS BANCAIRES MENSUELS')).toBe('BankingFees');
  });

  it('matches Insurance for mutuelle/assurance', () => {
    // fails if insurance patterns are absent
    expect(matchCategory('ASSURANCE HABITATION')).toBe('Insurance');
    expect(matchCategory('MUTUELLE OBLIGATOIRE')).toBe('Insurance');
  });

  it('matches Subscriptions for streaming/digital', () => {
    // fails if subscription patterns are absent
    expect(matchCategory('NETFLIX.COM')).toBe('Subscriptions');
    expect(matchCategory('SPOTIFY PREMIUM')).toBe('Subscriptions');
    expect(matchCategory('ABONNEMENT PRESSE')).toBe('Subscriptions');
  });

  it('returns undefined for an unrelated description (decoy)', () => {
    // fails if a rule over-matches and catches unrelated text
    expect(matchCategory('WEIRD MERCHANT XYZ 99999')).toBeUndefined();
    expect(matchCategory('PAIEMENT CARTE X1234')).toBeUndefined();
  });
});
