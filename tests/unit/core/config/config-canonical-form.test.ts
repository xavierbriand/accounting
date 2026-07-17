/**
 * Unit + property tests for canonicalConfigForm — story-4.5a.
 *
 * Gherkin coverage: none directly — Core determinism guarantee, exercised end-to-end by
 *   tests/features/config-change.feature Scenario 2 (cosmetic edit stays silent).
 *
 * fails if: the canonical form is not deterministic, array element order leaks into the
 *   digest (would make a no-op array reorder look like a change), Money serializes via its
 *   internal Dinero shape instead of Money.toString() (digest would drift across dinero.js
 *   bumps), or dbPath leaks into the canonical form (an absolute path must never enter the
 *   append-only trail — security-checklist § Secrets & PII).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { canonicalConfigForm } from '../../../../src/core/config/config-canonical-form.js';
import type { AppConfig, BufferBucket } from '../../../../src/core/config/app-config.js';
import { Money } from '@core/shared/money.js';

function money(decimal: number, currency = 'EUR'): Money {
  return Money.fromDecimal(decimal, currency).value;
}

function baseConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    dbPath: './test.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alice', ratio: 0.5 }, { partner: 'Bob', ratio: 0.5 }] }],
    buffers: [],
    accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
    recurring: [],
    autoTagRules: [],
    ...overrides,
  };
}

function makeBuffer(name: string, target: number): BufferBucket {
  return { name, account: `${name.toLowerCase()}-account`, target: money(target), targetDate: '2026-12-01' };
}

describe('canonicalConfigForm — determinism', () => {
  it('is deterministic: the same config produces the same string twice', () => {
    const config = baseConfig({ buffers: [makeBuffer('Vacation', 1500)] });
    expect(canonicalConfigForm(config)).toBe(canonicalConfigForm(config));
  });

  it('produces different strings for configs that differ in a buffer target', () => {
    const a = baseConfig({ buffers: [makeBuffer('Vacation', 1500)] });
    const b = baseConfig({ buffers: [makeBuffer('Vacation', 1800)] });
    expect(canonicalConfigForm(a)).not.toBe(canonicalConfigForm(b));
  });
});

describe('canonicalConfigForm — dbPath exclusion', () => {
  it('two configs differing only in dbPath produce the same canonical form', () => {
    const a = baseConfig({ dbPath: './a.db' });
    const b = baseConfig({ dbPath: '/absolute/path/to/b.db' });
    expect(canonicalConfigForm(a)).toBe(canonicalConfigForm(b));
  });
});

describe('canonicalConfigForm — Money serialization', () => {
  it('serializes buffer target via Money.toString(), not the Dinero internal shape', () => {
    const config = baseConfig({ buffers: [makeBuffer('Vacation', 1500)] });
    const form = canonicalConfigForm(config);
    expect(form).toContain('EUR 1500.00');
    expect(form).not.toContain('scale');
    expect(form).not.toContain('amount":150000');
  });

  it('digest invariance: a Money value reconstructed via a different path serializes identically', () => {
    const viaDecimal = baseConfig({ buffers: [{ ...makeBuffer('Vacation', 1500), target: Money.fromDecimal(1500, 'EUR').value }] });
    const viaCents = baseConfig({ buffers: [{ ...makeBuffer('Vacation', 1500), target: Money.fromCents(150000, 'EUR').value }] });
    expect(canonicalConfigForm(viaDecimal)).toBe(canonicalConfigForm(viaCents));
  });
});

describe('canonicalConfigForm — array reorder stability (property)', () => {
  it('buffers array order does not affect the canonical form', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom('Vacation', 'Car', 'Emergency', 'Wedding'), { minLength: 2, maxLength: 4 }),
        (names) => {
          const buffers = names.map((n, i) => makeBuffer(n, 1000 + i * 100));
          const forward = baseConfig({ buffers });
          const shuffled = baseConfig({ buffers: [...buffers].reverse() });
          return canonicalConfigForm(forward) === canonicalConfigForm(shuffled);
        },
      ),
      { numRuns: 50 },
    );
  });
});
