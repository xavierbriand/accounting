/**
 * Unit tests for the ConfigDiff value objects (ChangedEntry / ChangedSection) — story-4.5a.
 *
 * Gherkin coverage: none directly — Core value-object shape, exercised end-to-end by
 *   tests/features/config-change.feature (see docs/plans/story-4.5a.md).
 *
 * fails if: ChangedEntry carries fields beyond key/kind/previous/current, or a conforming
 *   value fails to satisfy the type for any of the three kinds.
 */
import { describe, it, expect } from 'vitest';
import { diffConfigs } from '../../../../src/core/config/config-diff.js';
import type { ChangedEntry, ChangedSection } from '../../../../src/core/config/config-diff.js';
import type { CanonicalAppConfig } from '../../../../src/core/config/config-canonical-form.js';

describe('ChangedEntry — value object shape', () => {
  it('an "added" entry carries key, kind, and current (no previous)', () => {
    const entry: ChangedEntry = { key: 'Vacation', kind: 'added', current: '{"name":"Vacation"}' };
    expect(Object.keys(entry).sort()).toEqual(['current', 'key', 'kind'].sort());
  });

  it('a "removed" entry carries key, kind, and previous (no current)', () => {
    const entry: ChangedEntry = { key: 'Car', kind: 'removed', previous: '{"name":"Car"}' };
    expect(Object.keys(entry).sort()).toEqual(['key', 'kind', 'previous'].sort());
  });

  it('a "changed" entry carries key, kind, previous, and current', () => {
    const entry: ChangedEntry = {
      key: 'Vacation.target',
      kind: 'changed',
      previous: 'EUR 1500.00',
      current: 'EUR 1800.00',
    };
    expect(Object.keys(entry).sort()).toEqual(['current', 'key', 'kind', 'previous'].sort());
  });
});

describe('ChangedSection — value object shape', () => {
  it('groups entries under a section name', () => {
    const section: ChangedSection = {
      section: 'buffers',
      entries: [{ key: 'Vacation.target', kind: 'changed', previous: 'EUR 1500.00', current: 'EUR 1800.00' }],
    };
    expect(section.section).toBe('buffers');
    expect(section.entries).toHaveLength(1);
  });
});

function baseCanonical(overrides?: Partial<CanonicalAppConfig>): CanonicalAppConfig {
  return {
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
    splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alice', ratio: 0.5 }, { partner: 'Bob', ratio: 0.5 }] }],
    buffers: [],
    recurring: [],
    autoTagRules: [],
    settlement: null,
    ...overrides,
  };
}

describe('diffConfigs — exactness', () => {
  it('returns no sections when nothing differs', () => {
    const config = baseCanonical({ buffers: [{ name: 'Vacation', account: 'vac', target: 'EUR 1500.00', targetDate: '2026-12-01' }] });
    expect(diffConfigs(config, config)).toEqual([]);
  });

  it('a scalar field change (timezone) produces exactly one section with one entry', () => {
    const previous = baseCanonical({ timezone: 'Europe/Paris' });
    const current = baseCanonical({ timezone: 'Europe/Berlin' });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'timezone', entries: [{ key: 'timezone', kind: 'changed', previous: 'Europe/Paris', current: 'Europe/Berlin' }] },
    ]);
  });

  it('a buffer field edit produces one "<name>.<field>" entry under the buffers section', () => {
    const previous = baseCanonical({ buffers: [{ name: 'Vacation', account: 'vac', target: 'EUR 1500.00', targetDate: '2026-12-01' }] });
    const current = baseCanonical({ buffers: [{ name: 'Vacation', account: 'vac', target: 'EUR 1800.00', targetDate: '2026-12-01' }] });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'buffers', entries: [{ key: 'Vacation.target', kind: 'changed', previous: 'EUR 1500.00', current: 'EUR 1800.00' }] },
    ]);
  });

  it('adding a buffer produces one "added" entry keyed by the buffer name', () => {
    const previous = baseCanonical({ buffers: [] });
    const added = { name: 'Vacation', account: 'vac', target: 'EUR 1500.00', targetDate: '2026-12-01' };
    const current = baseCanonical({ buffers: [added] });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'buffers', entries: [{ key: 'Vacation', kind: 'added', current: JSON.stringify(added) }] },
    ]);
  });

  it('removing a buffer produces one "removed" entry keyed by the buffer name', () => {
    const removed = { name: 'Vacation', account: 'vac', target: 'EUR 1500.00', targetDate: '2026-12-01' };
    const previous = baseCanonical({ buffers: [removed] });
    const current = baseCanonical({ buffers: [] });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'buffers', entries: [{ key: 'Vacation', kind: 'removed', previous: JSON.stringify(removed) }] },
    ]);
  });

  it('unchanged buffers never appear alongside a changed one (exactness)', () => {
    const untouched = { name: 'Emergency', account: 'em', target: 'EUR 300.00', targetDate: '2027-01-01' };
    const previous = baseCanonical({
      buffers: [untouched, { name: 'Vacation', account: 'vac', target: 'EUR 1500.00', targetDate: '2026-12-01' }],
    });
    const current = baseCanonical({
      buffers: [untouched, { name: 'Vacation', account: 'vac', target: 'EUR 1800.00', targetDate: '2026-12-01' }],
    });
    const sections = diffConfigs(previous, current);
    expect(sections).toHaveLength(1);
    expect(sections[0].entries).toHaveLength(1);
    expect(sections[0].entries[0].key).toBe('Vacation.target');
  });

  it('settlement flipping from absent to present produces one "added" entry', () => {
    const previous = baseCanonical({ settlement: null });
    const current = baseCanonical({ settlement: { accounts: [{ account: 'joint', partner: 'Alice' }] } });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'settlement', entries: [{ key: 'settlement', kind: 'added', current: JSON.stringify(current.settlement) }] },
    ]);
  });

  it('a settlement mapping field edit produces one "<account>.partner" entry', () => {
    const previous = baseCanonical({ settlement: { accounts: [{ account: 'joint', partner: 'Alice' }] } });
    const current = baseCanonical({ settlement: { accounts: [{ account: 'joint', partner: 'Bob' }] } });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'settlement', entries: [{ key: 'joint.partner', kind: 'changed', previous: 'Alice', current: 'Bob' }] },
    ]);
  });
});
