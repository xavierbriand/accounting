import { describe, expect, it } from 'vitest';
import { resolveSeasonal } from './seasonal.ts';
import type { ResolvedEnvelope } from './envelopes.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('resolveSeasonal', () => {
  it('a configured shape wins outright, even against contradicting history', () => {
    const config = numbersConfig({
      envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Alimentation", sub_category = "Supermarche" }]
estimate = "1200.00"
seasonal = { months = [6] }
`,
    });
    // All the real spending happened in January — if this were derived, the
    // shape would be January-heavy, not June-only.
    const ledger = ledgerOf([
      tx({ occurredOn: '2025-01-05', amount: -100000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const [envelope] = config.envelopes.map((c) => ({ kind: 'configured' as const, config: c }));

    const shape = resolveSeasonal(envelope!, ledger, 2025);
    expect(shape.provenance).toBe('configured');
    expect(shape.weights).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('derives the shape from prior-year net outflow by month, worked by hand', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ id: 'jan', occurredOn: '2025-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: 'feb-buy', occurredOn: '2025-02-05', amount: -1000, category: 'Alimentation', subCategory: 'Supermarche' }),
      // A partial refund the same month nets the February weight down to 800,
      // not ignored and not left at the full 1000.
      tx({ id: 'feb-refund', occurredOn: '2025-02-10', amount: 200, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const [envelope] = config.envelopes.map((c) => ({ kind: 'configured' as const, config: c }));

    const shape = resolveSeasonal(envelope!, ledger, 2025);
    expect(shape.provenance).toBe('derived-from-history');
    expect(shape.weights).toEqual([3000, 800, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('a single prior-year transaction is enough history to derive from', () => {
    const envelope: ResolvedEnvelope = { kind: 'derived', id: 'x', category: 'X', subCategory: 'Y' };
    const ledger = ledgerOf([tx({ occurredOn: '2025-03-05', amount: -500, category: 'X', subCategory: 'Y' })]);

    const shape = resolveSeasonal(envelope, ledger, 2025);
    expect(shape.provenance).toBe('derived-from-history');
  });

  it('falls back to flat when the envelope has no outflow at all in the prior year', () => {
    const envelope: ResolvedEnvelope = { kind: 'derived', id: 'x', category: 'X', subCategory: 'Y' };
    // Spending exists, but only in the current year — new this year, no prior
    // history to derive a shape from.
    const ledger = ledgerOf([tx({ occurredOn: '2026-03-05', amount: -500, category: 'X', subCategory: 'Y' })]);

    const shape = resolveSeasonal(envelope, ledger, 2025);
    expect(shape.provenance).toBe('flat-no-history');
    expect(shape.weights).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('a month where refunds outweigh purchases contributes zero, not a negative weight', () => {
    const envelope: ResolvedEnvelope = { kind: 'derived', id: 'x', category: 'X', subCategory: 'Y' };
    const ledger = ledgerOf([
      tx({ id: 'buy', occurredOn: '2025-04-05', amount: -1000, category: 'X', subCategory: 'Y' }),
      tx({ id: 'refund', occurredOn: '2025-04-10', amount: 1500, category: 'X', subCategory: 'Y' }),
      tx({ id: 'may', occurredOn: '2025-05-05', amount: -700, category: 'X', subCategory: 'Y' }),
    ]);

    const shape = resolveSeasonal(envelope, ledger, 2025);
    expect(shape.weights[3]).toBe(0); // April, zero-indexed
    expect(shape.weights.every((w) => w >= 0)).toBe(true);
  });
});
