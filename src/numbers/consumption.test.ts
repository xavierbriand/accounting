import { describe, expect, it } from 'vitest';
import type { Day } from '../core/dates.ts';
import { computeConsumption } from './consumption.ts';
import { resolveEnvelopes } from './envelopes.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('computeConsumption', () => {
  it('computes year-to-date, pace, and over-pace, worked by hand', () => {
    // groceries: estimate 1200.00 (120000c), no configured seasonal — derived
    // from 2025.
    const config = numbersConfig();
    const ledger = ledgerOf([
      // 2025 (prior year): 100.00 in each of Jan/Feb/Mar, nothing else — the
      // derived shape is [10000,10000,10000,0,...,0], sum 30000.
      tx({ id: '25-jan', occurredOn: '2025-01-05', amount: -10000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: '25-feb', occurredOn: '2025-02-05', amount: -10000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: '25-mar', occurredOn: '2025-03-05', amount: -10000, category: 'Alimentation', subCategory: 'Supermarche' }),
      // 2026 (this year), up to the 15th of March:
      tx({ id: '26-jan', occurredOn: '2026-01-10', amount: -50000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: '26-feb', occurredOn: '2026-02-10', amount: -50000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: '26-mar-early', occurredOn: '2026-03-05', amount: -30000, category: 'Alimentation', subCategory: 'Supermarche' }),
      // After the reference day — must not count as "so far".
      tx({ id: '26-mar-late', occurredOn: '2026-03-20', amount: -5000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    const [c] = computeConsumption(ledger, resolved, '2026-03-15' as Day);

    expect(c?.priorYearActual).toBe(30000);
    expect(c?.seasonal).toEqual({
      provenance: 'derived-from-history',
      weights: [10000, 10000, 10000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    // 120000 split proportionally to [10000,10000,10000,0,...]: each of the
    // first three months gets 120000*10000/30000 = 40000 exactly.
    expect(c?.monthlyPlan).toEqual([40000, 40000, 40000, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Cumulative through March (index 2): 40000 * 3 = 120000.
    expect(c?.paceExpected).toBe(120000);
    // Jan + Feb + the one March row before the 15th: 50000+50000+30000.
    expect(c?.yearToDateSpent).toBe(130000);
    expect(c?.overPace).toBe(10000);
  });

  it('does not flag a holiday envelope as over pace before its month arrives', () => {
    // A month with an all-zero weight is exactly where a flat-pacing bug
    // would hide: without seasonal weighting, a July-only envelope would
    // read as "over budget" every month from January on.
    const config = numbersConfig({
      envelopes: `
[envelopes.holiday]
name = "Holiday"
matches = [{ category = "Loisirs et vacances", sub_category = "Vacances" }]
estimate = "2400.00"
seasonal = { months = [7] }
`,
    });
    const ledger = ledgerOf([]);
    const resolved = resolveEnvelopes(config, ledger);
    const [c] = computeConsumption(ledger, resolved, '2026-05-20' as Day);

    expect(c?.monthlyPlan?.[6]).toBe(240000); // July, zero-indexed — the whole estimate
    expect(c?.paceExpected).toBe(0); // nothing expected yet, as of May
    expect(c?.yearToDateSpent).toBe(0);
    expect(c?.overPace).toBe(0);
  });

  it('has no monthly plan for a derived envelope — nothing to pace against', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    const consumption = computeConsumption(ledger, resolved, '2026-06-01' as Day);
    const c = consumption.find((e) => e.envelope.kind === 'derived');

    expect(c?.envelope.kind).toBe('derived');
    expect(c?.monthlyPlan).toBeNull();
    expect(c?.paceExpected).toBe(0);
    // No plan means nothing is "expected" — so any spending at all is, by
    // construction, entirely over pace.
    expect(c?.yearToDateSpent).toBe(1500);
    expect(c?.overPace).toBe(1500);
  });

  it('follows the same order resolveEnvelopes returns', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    const consumption = computeConsumption(ledger, resolved, '2026-06-01' as Day);
    expect(consumption.map((c) => c.envelope)).toEqual(resolved);
  });
});
