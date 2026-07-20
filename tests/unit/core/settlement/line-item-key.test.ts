import { describe, it, expect } from 'vitest';
import { LineItemKey } from '@core/settlement/line-item-key.js';
import type { LineItem } from '@core/transfer/line-item.js';
import { Money } from '@core/shared/money.js';

function makeItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    kind: 'forecast',
    date: '2026-07-01',
    category: 'Rent',
    description: 'Rent',
    gross: Money.fromCents(100000, 'EUR').value,
    perPartnerSplit: new Map(),
    ...overrides,
  };
}

describe('LineItemKey — of()', () => {
  it('extracts kind, category, description from a LineItem', () => {
    // fails if of() drops or mis-maps a field
    const key = LineItemKey.of(makeItem({ kind: 'buffer-topup', category: 'Car', description: 'Car top-up' }));
    expect(key.kind).toBe('buffer-topup');
    expect(key.category).toBe('Car');
    expect(key.description).toBe('Car top-up');
  });

  it('ignores date and gross when building the key', () => {
    // fails if the key accidentally incorporates date or amount, breaking month-to-month identity
    const a = LineItemKey.of(makeItem({ date: '2026-06-01', gross: Money.fromCents(500, 'EUR').value }));
    const b = LineItemKey.of(makeItem({ date: '2026-07-01', gross: Money.fromCents(900, 'EUR').value }));
    expect(a.equals(b)).toBe(true);
  });
});

describe('LineItemKey — equals()', () => {
  it('returns true for identical kind/category/description', () => {
    // fails if equals() uses reference equality instead of structural equality
    const a = LineItemKey.of(makeItem());
    const b = LineItemKey.of(makeItem());
    expect(a.equals(b)).toBe(true);
  });

  it('returns false when kind differs', () => {
    // fails if kind is not part of the equality check
    const a = LineItemKey.of(makeItem({ kind: 'forecast' }));
    const b = LineItemKey.of(makeItem({ kind: 'buffer-topup' }));
    expect(a.equals(b)).toBe(false);
  });

  it('returns false when category differs', () => {
    // fails if category is not part of the equality check
    const a = LineItemKey.of(makeItem({ category: 'Rent' }));
    const b = LineItemKey.of(makeItem({ category: 'Insurance' }));
    expect(a.equals(b)).toBe(false);
  });

  it('returns false when description differs (a renamed rule reads as a different key)', () => {
    // fails if description is not part of the equality check
    const a = LineItemKey.of(makeItem({ description: 'Rent' }));
    const b = LineItemKey.of(makeItem({ description: 'Rent (new)' }));
    expect(a.equals(b)).toBe(false);
  });
});

describe('LineItemKey — compare() total order', () => {
  it('orders primarily by kind', () => {
    // fails if kind is not the primary sort dimension
    const bufferTopup = LineItemKey.of(makeItem({ kind: 'buffer-topup', category: 'Z', description: 'Z' }));
    const forecast = LineItemKey.of(makeItem({ kind: 'forecast', category: 'A', description: 'A' }));
    expect(bufferTopup.compare(forecast)).toBeLessThan(0);
    expect(forecast.compare(bufferTopup)).toBeGreaterThan(0);
  });

  it('orders by category when kind matches', () => {
    // fails if category is not consulted after kind ties
    const a = LineItemKey.of(makeItem({ kind: 'forecast', category: 'Insurance', description: 'Z' }));
    const b = LineItemKey.of(makeItem({ kind: 'forecast', category: 'Rent', description: 'A' }));
    expect(a.compare(b)).toBeLessThan(0);
  });

  it('orders by description when kind and category match', () => {
    // fails if description is not the final tie-breaker
    const a = LineItemKey.of(makeItem({ kind: 'forecast', category: 'Rent', description: 'Alpha' }));
    const b = LineItemKey.of(makeItem({ kind: 'forecast', category: 'Rent', description: 'Beta' }));
    expect(a.compare(b)).toBeLessThan(0);
  });

  it('orders by description in reverse when the description is lexicographically greater', () => {
    // fails if the description tie-breaker's greater-than arm returns the wrong sign
    const a = LineItemKey.of(makeItem({ kind: 'forecast', category: 'Rent', description: 'Beta' }));
    const b = LineItemKey.of(makeItem({ kind: 'forecast', category: 'Rent', description: 'Alpha' }));
    expect(a.compare(b)).toBeGreaterThan(0);
  });

  it('returns 0 for identical keys', () => {
    // fails if compare() is not reflexive for equal keys
    const a = LineItemKey.of(makeItem());
    const b = LineItemKey.of(makeItem());
    expect(a.compare(b)).toBe(0);
  });

  it('produces a stable sort regardless of input order', () => {
    // fails if compare() is not a genuine total order (e.g. inconsistent tie-breaking)
    const keys = [
      LineItemKey.of(makeItem({ kind: 'forecast', category: 'Rent', description: 'Rent' })),
      LineItemKey.of(makeItem({ kind: 'buffer-topup', category: 'Vacation', description: 'Vacation top-up' })),
      LineItemKey.of(makeItem({ kind: 'forecast', category: 'Insurance', description: 'Insurance' })),
    ];
    const sorted = [...keys].sort((a, b) => a.compare(b));
    const reversedThenSorted = [...keys].reverse().sort((a, b) => a.compare(b));
    expect(sorted.map(k => k.toString())).toEqual(reversedThenSorted.map(k => k.toString()));
    expect(sorted[0].category).toBe('Vacation');
    expect(sorted[1].category).toBe('Insurance');
    expect(sorted[2].category).toBe('Rent');
  });
});
