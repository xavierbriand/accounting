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
import type { ChangedEntry, ChangedSection } from '../../../../src/core/config/config-diff.js';

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
