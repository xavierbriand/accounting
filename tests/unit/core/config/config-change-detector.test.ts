/**
 * Unit + property tests for ConfigChangeDetector — story-4.5a.
 *
 * Gherkin coverage:
 *   - Scenario 1 (external edit detected and recorded) — diff exactness + origin honesty.
 *   - Scenario 2 (cosmetic edit stays silent) — no-op silence.
 *   (see tests/features/config-change.feature)
 *
 * fails if: detect() reports a change when the canonical digests match (no-op silence),
 *   detect() reports a change on the very first run instead of treating a null previous
 *   state as bootstrap, the returned event ever carries origin other than 'external', or
 *   the changedSections/previousDigest/currentDigest on a real change don't match what
 *   diffConfigs/canonicalConfigForm would independently compute.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ConfigChangeDetector } from '../../../../src/core/config/config-change-detector.js';
import { canonicalConfigForm } from '../../../../src/core/config/config-canonical-form.js';
import type { AppConfig, BufferBucket } from '../../../../src/core/config/app-config.js';
import type { StoredConfigState } from '../../../../src/core/ports/config-state-store.js';
import type { HashFn } from '../../../../src/core/ports/hash-fn.js';
import { Money } from '@core/shared/money.js';

const identityHashFn: HashFn = (canonical: string) => canonical;

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

function storedStateFor(config: AppConfig, hashFn: HashFn = identityHashFn): StoredConfigState {
  const canonical = canonicalConfigForm(config);
  return { canonical, digest: hashFn(canonical) };
}

describe('ConfigChangeDetector — corrupted stored state (coverage completion)', () => {
  it('returns Result.fail (not a throw) when the stored canonical form is not valid JSON', () => {
    const detector = new ConfigChangeDetector(identityHashFn);
    // A digest that deliberately does not match, forcing the parse-and-diff path.
    const result = detector.detect({ canonical: 'not-json{{', digest: 'stale-digest' }, baseConfig());
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('not valid JSON');
  });
});

describe('ConfigChangeDetector — bootstrap', () => {
  it('returns null when previous is null (first run — caller saves the baseline)', () => {
    const detector = new ConfigChangeDetector(identityHashFn);
    const result = detector.detect(null, baseConfig());
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBeNull();
  });
});

describe('ConfigChangeDetector — no-op silence', () => {
  it('returns null when the current config canonicalizes to the same digest as the stored state', () => {
    const config = baseConfig({ buffers: [makeBuffer('Vacation', 1500)] });
    const previous = storedStateFor(config);
    const detector = new ConfigChangeDetector(identityHashFn);
    const result = detector.detect(previous, config);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBeNull();
  });

  it('property: no-op silence holds for arbitrary buffer targets', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (target) => {
        const config = baseConfig({ buffers: [makeBuffer('Vacation', target)] });
        const previous = storedStateFor(config);
        const detector = new ConfigChangeDetector(identityHashFn);
        const result = detector.detect(previous, config);
        return result.isSuccess && result.value === null;
      }),
      { numRuns: 50 },
    );
  });
});

describe('ConfigChangeDetector — real change', () => {
  it('reports origin "external" with matching changedSections and digests', () => {
    const before = baseConfig({ buffers: [makeBuffer('Vacation', 1500)] });
    const after = baseConfig({ buffers: [makeBuffer('Vacation', 1800)] });
    const previous = storedStateFor(before);
    const detector = new ConfigChangeDetector(identityHashFn);

    const result = detector.detect(previous, after);
    expect(result.isSuccess).toBe(true);
    const changed = result.value;
    expect(changed).not.toBeNull();
    expect(changed?.type).toBe('ConfigChanged');
    expect(changed?.origin).toBe('external');
    expect(changed?.previousDigest).toBe(previous.digest);
    expect(changed?.currentDigest).toBe(identityHashFn(canonicalConfigForm(after)));

    const buffersSection = changed?.changedSections.find((s) => s.section === 'buffers');
    expect(buffersSection?.entries).toEqual([
      { key: 'Vacation.target', kind: 'changed', previous: 'EUR 1500.00', current: 'EUR 1800.00' },
    ]);
  });

  it('property: origin is always "external", never "applied"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), fc.integer({ min: 0, max: 100000 }), (a, b) => {
        const before = baseConfig({ buffers: [makeBuffer('Vacation', a)] });
        const after = baseConfig({ buffers: [makeBuffer('Vacation', b)] });
        const previous = storedStateFor(before);
        const detector = new ConfigChangeDetector(identityHashFn);
        const result = detector.detect(previous, after);
        if (!result.isSuccess) return false;
        if (result.value === null) return true; // a === b: no-op, skip
        return result.value.origin === 'external';
      }),
      { numRuns: 50 },
    );
  });
});
