import { describe, expect, it } from 'vitest';
import type { Day } from '../core/dates.ts';
import { checkPlan } from './checks.ts';
import { resolveEnvelopes } from './envelopes.ts';
import { computeConsumption } from './consumption.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

function check(configOverrides: Parameters<typeof numbersConfig>[0], transactions: Parameters<typeof tx>[0][], referenceDay: string) {
  const config = numbersConfig(configOverrides);
  const ledger = ledgerOf(transactions.map(tx));
  const resolved = resolveEnvelopes(config, ledger);
  const consumption = computeConsumption(ledger, resolved, referenceDay as Day);
  return checkPlan(config, ledger, consumption, referenceDay as Day);
}

describe('checkPlan — goal status', () => {
  const GOAL_ENVELOPE = `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Alimentation", sub_category = "Supermarche" }]
estimate = "1200.00"
goal = "1000.00"
seasonal = { weights = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }
`;

  it('is no-goal when the envelope declares none', () => {
    const result = check({}, [], '2026-06-01');
    const envelope = result.envelopes.find((e) => e.envelope.kind === 'configured');
    expect(envelope?.goalStatus).toBe('no-goal');
    expect(envelope?.projectedFullYear).toBeNull();
  });

  it('is too-early when the reference month has no expected pace yet', () => {
    // Seasonal weight entirely in December: as of June, paceExpected is 0.
    const result = check(
      { envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [{ category = "Alimentation", sub_category = "Supermarche" }]
estimate = "1200.00"
goal = "1000.00"
seasonal = { months = [12] }
` },
      [],
      '2026-06-01',
    );
    const envelope = result.envelopes.find((e) => e.envelope.kind === 'configured');
    expect(envelope?.goalStatus).toBe('too-early');
    expect(envelope?.projectedFullYear).toBeNull();
  });

  it('is on-track when the projection lands exactly on the goal — the boundary is inclusive', () => {
    // Flat weights, estimate 1200.00 (120000c) => 10000/month. Reference
    // June (month 6): paceExpected = 60000. Spend exactly 50000 so far:
    // projectedFullYear = 50000 * 120000 / 60000 = 100000 = goal exactly.
    const result = check(
      { envelopes: GOAL_ENVELOPE },
      [{ occurredOn: '2026-03-01', amount: -50000, category: 'Alimentation', subCategory: 'Supermarche' }],
      '2026-06-01',
    );
    const envelope = result.envelopes.find((e) => e.envelope.kind === 'configured');
    expect(envelope?.projectedFullYear).toBe(100000);
    expect(envelope?.goalStatus).toBe('on-track');
  });

  it('is at-risk the moment the projection is one cent above the goal', () => {
    const result = check(
      { envelopes: GOAL_ENVELOPE },
      [{ occurredOn: '2026-03-01', amount: -50001, category: 'Alimentation', subCategory: 'Supermarche' }],
      '2026-06-01',
    );
    const envelope = result.envelopes.find((e) => e.envelope.kind === 'configured');
    expect(envelope?.goalStatus).toBe('at-risk');
  });

  it('marks an envelope past pace only once spending exceeds what was expected, not at equality', () => {
    // Flat, estimate 120000: paceExpected through June = 60000.
    const atPace = check({ envelopes: GOAL_ENVELOPE }, [
      { occurredOn: '2026-03-01', amount: -60000, category: 'Alimentation', subCategory: 'Supermarche' },
    ], '2026-06-01');
    expect(atPace.envelopes.find((e) => e.envelope.kind === 'configured')?.pastPace).toBe(false);

    const overPace = check({ envelopes: GOAL_ENVELOPE }, [
      { occurredOn: '2026-03-01', amount: -60001, category: 'Alimentation', subCategory: 'Supermarche' },
    ], '2026-06-01');
    expect(overPace.envelopes.find((e) => e.envelope.kind === 'configured')?.pastPace).toBe(true);
  });
});

describe('checkPlan — plannedTotal, trailingYearActual, drift', () => {
  it('plannedTotal sums only configured envelopes’ estimates, never a derived one’s spending', () => {
    const result = check({}, [
      { occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' },
      { occurredOn: '2026-01-06', amount: -999999, category: 'Loisirs et vacances', subCategory: 'Cinema' },
    ], '2026-06-01');
    expect(result.plannedTotal).toBe(120000); // groceries' estimate only
  });

  it('trailingYearActual sums the 12 months ending on the reference day, worked by hand', () => {
    const result = check({}, [
      { id: 'too-old', occurredOn: '2025-06-20', amount: -1000, category: 'Alimentation', subCategory: 'Supermarche' }, // excluded: before the window
      { id: 'window-start', occurredOn: '2025-07-01', amount: -2000, category: 'Alimentation', subCategory: 'Supermarche' }, // included: exactly 12 months back
      { id: 'in-range', occurredOn: '2026-06-15', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }, // included: the reference day itself
      { id: 'too-new', occurredOn: '2026-06-20', amount: -4000, category: 'Alimentation', subCategory: 'Supermarche' }, // excluded: after the reference day
    ], '2026-06-15');
    expect(result.trailingYearActual).toBe(5000);
  });

  it('drift is trailingYearActual minus plannedTotal', () => {
    const result = check({}, [
      { occurredOn: '2026-06-01', amount: -150000, category: 'Alimentation', subCategory: 'Supermarche' },
    ], '2026-06-15');
    expect(result.trailingYearActual).toBe(150000);
    expect(result.plannedTotal).toBe(120000);
    expect(result.drift).toBe(30000);
  });
});

describe('checkPlan — worstObservedMonth and bufferSufficient', () => {
  it('counts a card settlement at settlesOn, not the card purchase at occurredOn', () => {
    // If the card purchase counted directly, January would be -81000 —
    // worse than February's settlement — and this would fail.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-10', amount: -1000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({
        occurredOn: '2026-01-15',
        settlesOn: '2026-01-15',
        amount: -80000,
        source: { kind: 'card', id: 'carte_1111', cardNumber: '1111' },
      }),
      tx({
        kind: 'settlement',
        occurredOn: '2026-02-04',
        settlesOn: '2026-02-04',
        amount: -80000,
        category: 'Transaction exclue',
        subCategory: 'Transaction differee',
      }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    const consumption = computeConsumption(ledger, resolved, '2026-02-15' as Day);
    const result = checkPlan(config, ledger, consumption, '2026-02-15' as Day);
    expect(result.worstObservedMonth).toBe(-80000);
  });

  it('counts a contribution in the month it funds, not the month it posts', () => {
    // Posted Jan 26, after the cutoff day (25) — funds February, not January.
    // If wrongly attributed to January, the worst month would be 0 instead
    // of -20000.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-10', amount: -20000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ kind: 'transfer-in', occurredOn: '2026-01-26', label: 'VIR ALICE MARTIN', amount: 50000 }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    const consumption = computeConsumption(ledger, resolved, '2026-02-15' as Day);
    const result = checkPlan(config, ledger, consumption, '2026-02-15' as Day);
    expect(result.worstObservedMonth).toBe(-20000);
  });

  it('counts a transfer-out immediately, the mirror of a transfer-in', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-out', occurredOn: '2026-01-20', amount: -15000 }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    const consumption = computeConsumption(ledger, resolved, '2026-01-25' as Day);
    const result = checkPlan(config, ledger, consumption, '2026-01-25' as Day);
    expect(result.worstObservedMonth).toBe(-15000);
  });

  it('is sufficient exactly at the boundary, insufficient one cent past it', () => {
    // Default buffer.target is 2500.00 (250000c).
    const config = numbersConfig();
    const atBoundary = ledgerOf([tx({ kind: 'transfer-out', occurredOn: '2026-01-05', amount: -250000 })]);
    const resolvedA = resolveEnvelopes(config, atBoundary);
    const resultA = checkPlan(
      config,
      atBoundary,
      computeConsumption(atBoundary, resolvedA, '2026-01-10' as Day),
      '2026-01-10' as Day,
    );
    expect(resultA.worstObservedMonth).toBe(-250000);
    expect(resultA.bufferSufficient).toBe(true);

    const overBoundary = ledgerOf([tx({ kind: 'transfer-out', occurredOn: '2026-01-05', amount: -250001 })]);
    const resolvedB = resolveEnvelopes(config, overBoundary);
    const resultB = checkPlan(
      config,
      overBoundary,
      computeConsumption(overBoundary, resolvedB, '2026-01-10' as Day),
      '2026-01-10' as Day,
    );
    expect(resultB.bufferSufficient).toBe(false);
  });
});
