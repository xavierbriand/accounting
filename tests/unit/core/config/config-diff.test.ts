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
import * as fc from 'fast-check';
import { diffConfigs } from '../../../../src/core/config/config-diff.js';
import type { ChangedEntry, ChangedSection } from '../../../../src/core/config/config-diff.js';
import type { CanonicalAppConfig, CanonicalBuffer } from '../../../../src/core/config/config-canonical-form.js';

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

  it('settlement flipping from present to absent produces one "removed" entry', () => {
    const previous = baseCanonical({ settlement: { accounts: [{ account: 'joint', partner: 'Alice' }] } });
    const current = baseCanonical({ settlement: null });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      { section: 'settlement', entries: [{ key: 'settlement', kind: 'removed', previous: JSON.stringify(previous.settlement) }] },
    ]);
  });
});

describe('diffConfigs — coverage completion (accounts/splits/recurring/autoTagRules)', () => {
  it('an account field edit (filenamePrefix) produces one "<id>.filenamePrefix" entry', () => {
    const previous = baseCanonical({ accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }] });
    const current = baseCanonical({ accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main2_' }] });
    expect(diffConfigs(previous, current)).toEqual([
      { section: 'accounts', entries: [{ key: 'main-account.filenamePrefix', kind: 'changed', previous: 'main_', current: 'main2_' }] },
    ]);
  });

  it('adding a card account with cardSuffix produces one "added" entry', () => {
    const previous = baseCanonical({ accounts: [] });
    const added = { id: 'card-account', type: 'card', filenamePrefix: 'carte_', cardSuffix: '1234' };
    const current = baseCanonical({ accounts: [added] });
    expect(diffConfigs(previous, current)).toEqual([
      { section: 'accounts', entries: [{ key: 'card-account', kind: 'added', current: JSON.stringify(added) }] },
    ]);
  });

  it('a split window rules edit produces one "<validFrom>.rules" entry', () => {
    const previous = baseCanonical({
      splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alice', ratio: 0.5 }, { partner: 'Bob', ratio: 0.5 }] }],
    });
    const current = baseCanonical({
      splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alice', ratio: 0.6 }, { partner: 'Bob', ratio: 0.4 }] }],
    });
    const sections = diffConfigs(previous, current);
    expect(sections).toEqual([
      {
        section: 'splits',
        entries: [{
          key: '2024-01-01.rules',
          kind: 'changed',
          previous: JSON.stringify(previous.splits[0].rules),
          current: JSON.stringify(current.splits[0].rules),
        }],
      },
    ]);
  });

  it('a recurring rule field edit (amount) produces one "<name>.amount" entry', () => {
    const previous = baseCanonical({
      recurring: [{ name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 'EUR 12.99', validFrom: '2026-01-01', amendments: [] }],
    });
    const current = baseCanonical({
      recurring: [{ name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 'EUR 14.99', validFrom: '2026-01-01', amendments: [] }],
    });
    expect(diffConfigs(previous, current)).toEqual([
      { section: 'recurring', entries: [{ key: 'Netflix.amount', kind: 'changed', previous: 'EUR 12.99', current: 'EUR 14.99' }] },
    ]);
  });

  it('removing a recurring rule with a validTo/amendments produces one "removed" entry', () => {
    const removed = {
      name: 'Netflix',
      category: 'Subscriptions',
      cadence: 'monthly',
      amount: 'EUR 12.99',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      amendments: [{ validFrom: '2026-06-01', amount: 'EUR 14.99' }],
    };
    const previous = baseCanonical({ recurring: [removed] });
    const current = baseCanonical({ recurring: [] });
    expect(diffConfigs(previous, current)).toEqual([
      { section: 'recurring', entries: [{ key: 'Netflix', kind: 'removed', previous: JSON.stringify(removed) }] },
    ]);
  });

  it('an autoTagRule category edit produces one "<pattern>.category" entry', () => {
    const previous = baseCanonical({ autoTagRules: [{ pattern: 'uber', category: 'Transport' }] });
    const current = baseCanonical({ autoTagRules: [{ pattern: 'uber', category: 'RideShare' }] });
    expect(diffConfigs(previous, current)).toEqual([
      { section: 'autoTagRules', entries: [{ key: 'uber.category', kind: 'changed', previous: 'Transport', current: 'RideShare' }] },
    ]);
  });

  it('adding an autoTagRule produces one "added" entry', () => {
    const added = { pattern: 'uber', category: 'Transport' };
    const previous = baseCanonical({ autoTagRules: [] });
    const current = baseCanonical({ autoTagRules: [added] });
    expect(diffConfigs(previous, current)).toEqual([
      { section: 'autoTagRules', entries: [{ key: 'uber', kind: 'added', current: JSON.stringify(added) }] },
    ]);
  });
});

describe('diffConfigs — model-note invariant 2: diff exactness (property over config pairs)', () => {
  // fails if: diffConfigs reports an entry for an unchanged element (unsoundness) or
  //   omits an entry for a genuinely added/removed/edited element (incompleteness).
  const roleTaggedBuffer = fc.record({
    name: fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
    role: fc.constantFrom('unchanged' as const, 'changed' as const, 'removed' as const, 'added' as const),
    target: fc.integer({ min: 1, max: 99_999 }),
  });

  function bufferOf(name: string, target: number): CanonicalBuffer {
    return { name, account: 'joint', target: `EUR ${target}.00`, targetDate: '2027-01-01', cap: undefined };
  }

  it('exactly the differing buffers appear: added/removed/changed as themselves, unchanged never', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(roleTaggedBuffer, { selector: (e) => e.name, maxLength: 10 }),
        (tagged) => {
          const previous = baseCanonical({
            buffers: tagged.filter((e) => e.role !== 'added').map((e) => bufferOf(e.name, e.target)),
          });
          const current = baseCanonical({
            buffers: tagged
              .filter((e) => e.role !== 'removed')
              .map((e) => bufferOf(e.name, e.role === 'changed' ? e.target + 1 : e.target)),
          });

          const expected: ChangedEntry[] = [
            ...tagged
              .filter((e) => e.role === 'removed')
              .map((e): ChangedEntry => ({ key: e.name, kind: 'removed', previous: JSON.stringify(bufferOf(e.name, e.target)) })),
            ...tagged
              .filter((e) => e.role === 'added')
              .map((e): ChangedEntry => ({ key: e.name, kind: 'added', current: JSON.stringify(bufferOf(e.name, e.target)) })),
            ...tagged
              .filter((e) => e.role === 'changed')
              .map(
                (e): ChangedEntry => ({
                  key: `${e.name}.target`,
                  kind: 'changed',
                  previous: `EUR ${e.target}.00`,
                  current: `EUR ${e.target + 1}.00`,
                }),
              ),
          ];

          const byEntryKey = (a: ChangedEntry, b: ChangedEntry): number => a.key.localeCompare(b.key);
          const buffersSection = diffConfigs(previous, current).find((s) => s.section === 'buffers');

          if (expected.length === 0) {
            expect(buffersSection).toBeUndefined();
            return;
          }
          expect(buffersSection).toBeDefined();
          expect([...(buffersSection as ChangedSection).entries].sort(byEntryKey)).toEqual(
            [...expected].sort(byEntryKey),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
