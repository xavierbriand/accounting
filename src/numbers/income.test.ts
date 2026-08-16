import { describe, expect, it } from 'vitest';
import { sum } from '../core/money.ts';
import { computeShares, netMonthly } from './income.ts';
import { numbersConfig, person } from './__fixtures__/build.ts';

describe('netMonthly', () => {
  it('sums monthly entries directly', () => {
    const p = person({
      id: 'alice',
      income: [
        { cadence: 'monthly', label: 'Salary', net: 320000 },
        { cadence: 'monthly', label: 'Side job', net: 25000 },
      ],
    });
    expect(netMonthly(p)).toBe(345000);
  });

  it('folds an annual entry in at net / 12', () => {
    const p = person({ id: 'alice', income: [{ cadence: 'annual', label: 'Profit share', net: 480000 }] });
    expect(netMonthly(p)).toBe(40000);
  });

  it('rounds a non-exact annual division rather than losing the remainder', () => {
    // 115 cents / 12 = 9.58...: chosen so rounding and truncation disagree
    // (9 vs 10) — a value like 100/12 = 8.33 would pass either way and not
    // actually prove Math.round() is what runs. The rounding is deliberately
    // not exactness-checked here, only where it feeds allocate() as the
    // household total.
    const p = person({ id: 'alice', income: [{ cadence: 'annual', label: 'Bonus', net: 115 }] });
    expect(netMonthly(p)).toBe(10);
  });

  it('combines monthly and annual sources for the same person', () => {
    const p = person({
      id: 'alice',
      income: [
        { cadence: 'monthly', label: 'Salary', net: 320000 },
        { cadence: 'annual', label: 'Profit share', net: 480000 },
      ],
    });
    expect(netMonthly(p)).toBe(360000);
  });
});

describe('computeShares', () => {
  it('splits proportionally to income and sums exactly to the requirement', () => {
    // alice 3200.00, bruno 2450.00 net monthly, from the shared fixture.
    // weight sum 565000; requirement 1000.00 (100000c).
    // alice: 100000*320000/565000 = 56637.168..., floor 56637
    // bruno: 100000*245000/565000 = 43362.832..., floor 43362 — sums to
    // 99999, one cent short, and bruno's fraction (.832) is larger than
    // alice's (.168), so bruno gets it: 56637 + 43363 = 100000.
    const config = numbersConfig();
    const shares = computeShares(config.people, 100000);

    expect(shares).toEqual([
      { personId: 'alice', netMonthly: 320000, amount: 56637 },
      { personId: 'bruno', netMonthly: 245000, amount: 43363 },
    ]);
    expect(sum(shares.map((s) => s.amount))).toBe(100000);
  });

  it('keeps the sum exact for a requirement that does not divide evenly among three', () => {
    const people = [
      person({ id: 'a', income: [{ cadence: 'monthly', label: 'Salary', net: 100000 }] }),
      person({ id: 'b', income: [{ cadence: 'monthly', label: 'Salary', net: 100000 }] }),
      person({ id: 'c', income: [{ cadence: 'monthly', label: 'Salary', net: 100000 }] }),
    ];
    const shares = computeShares(people, 1000);
    expect(sum(shares.map((s) => s.amount))).toBe(1000);
  });

  it('preserves the order people were declared in', () => {
    const config = numbersConfig();
    const shares = computeShares(config.people, 100000);
    expect(shares.map((s) => s.personId)).toEqual(['alice', 'bruno']);
  });
});
