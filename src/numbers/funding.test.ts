import { describe, expect, it } from 'vitest';
import { attributeContributions, compare, contributionsByMonth } from './funding.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('compare', () => {
  // Direct, not through a `.sort()` call: `.sort()` only ever invokes a
  // comparator with specific argument orderings (a stable sort presents the
  // later-positioned element first), which can leave some of a comparator's
  // own mutants unobservable through the sort even though the function
  // itself is wrong — see the note beside `attributeContributions`'s own
  // sort below, and the identical situation documented in `envelopes.ts`
  // and `audit.ts`. Calling `compare` directly sidesteps that entirely.
  it('orders strings by plain code-point value', () => {
    expect(compare('a', 'b')).toBeLessThan(0);
    expect(compare('b', 'a')).toBeGreaterThan(0);
  });

  it('returns exactly zero for equal strings, not merely falsy', () => {
    expect(compare('a', 'a')).toBe(0);
  });

  it('is code-point order, not locale order', () => {
    // Uppercase sorts before lowercase in code-point order; the two would
    // commonly disagree under localeCompare().
    expect(compare('Z', 'a')).toBeLessThan(0);
  });
});

describe('attributeContributions', () => {
  it('credits a transfer to its own month when it arrives before the cutoff day', () => {
    // Default fixture config: funding.cutoff_day = 25.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-24', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const [c] = attributeContributions(config, ledger);
    expect(c?.fundingMonth).toBe('2026-01');
  });

  it('credits a transfer to the following month exactly on the cutoff day', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-25', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const [c] = attributeContributions(config, ledger);
    expect(c?.fundingMonth).toBe('2026-02');
  });

  it('credits the person whose label the transfer matches', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const [c] = attributeContributions(config, ledger);
    expect(c?.people.map((p) => p.id)).toEqual(['alice']);
  });

  it('matches nobody when no declared label catches the transfer', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR UNKNOWN SENDER', amount: 100000 }),
    ]);
    const [c] = attributeContributions(config, ledger);
    expect(c?.people).toEqual([]);
  });

  it('matches two people when a label satisfies both their patterns, without guessing', () => {
    // Two labels engineered not to contain one another (config refuses that at
    // parse time), but which both appear in one transaction's real label — the
    // runtime ambiguity no static config check can see.
    const config = numbersConfig({
      people: `
[people.alice]
name = "Alice"
transfer_labels = ["ALICE"]

[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.carol]
name = "Carol"
transfer_labels = ["CAROL"]

[[people.carol.income]]
label = "Salary"
monthly = "2000.00"
`,
    });
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE CAROL JOINT', amount: 50000 }),
    ]);
    const [c] = attributeContributions(config, ledger);
    expect(c?.people.map((p) => p.id).sort()).toEqual(['alice', 'carol']);
  });

  it('considers only transfer-in transactions', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'movement', occurredOn: '2026-01-05', amount: -5000 }),
      tx({ kind: 'transfer-out', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: -100000 }),
      tx({ kind: 'settlement', occurredOn: '2026-01-05', amount: -20000 }),
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    expect(attributeContributions(config, ledger)).toHaveLength(1);
  });

  it('sorts by funding month, then by transaction id', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ id: 'b', kind: 'transfer-in', occurredOn: '2026-02-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
      tx({ id: 'a', kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const contributions = attributeContributions(config, ledger);
    expect(contributions.map((c) => c.transaction.id)).toEqual(['a', 'b']);
  });

  it('breaks a tie between two contributions funding the same month by transaction id', () => {
    // Two transfers landing in the same funding month have nothing else to
    // order them by — the month-comparison branch of the sort never even
    // runs for this pair, so only the tie-break is exercised.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ id: 'z', kind: 'transfer-in', occurredOn: '2026-01-20', label: 'VIR ALICE MARTIN', amount: 50000 }),
      tx({ id: 'a', kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const contributions = attributeContributions(config, ledger);
    expect(contributions.map((c) => c.transaction.id)).toEqual(['a', 'z']);
  });
});

describe('contributionsByMonth', () => {
  it('sums named and unattributed contributions separately, into one total', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ id: 'named', kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
      tx({ id: 'unnamed', kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR UNKNOWN', amount: 50000 }),
    ]);
    const [month] = contributionsByMonth(attributeContributions(config, ledger));

    expect(month?.month).toBe('2026-01');
    expect(month?.byPerson.get('alice')).toBe(100000);
    expect(month?.unattributed).toBe(50000);
    expect(month?.total).toBe(150000);
  });

  it('folds a two-person match into unattributed, not into either person', () => {
    const config = numbersConfig({
      people: `
[people.alice]
name = "Alice"
transfer_labels = ["ALICE"]

[[people.alice.income]]
label = "Salary"
monthly = "3200.00"

[people.carol]
name = "Carol"
transfer_labels = ["CAROL"]

[[people.carol.income]]
label = "Salary"
monthly = "2000.00"
`,
    });
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE CAROL JOINT', amount: 50000 }),
    ]);
    const [month] = contributionsByMonth(attributeContributions(config, ledger));

    expect(month?.byPerson.size).toBe(0);
    expect(month?.unattributed).toBe(50000);
    expect(month?.total).toBe(50000);
  });

  it('sorts months ascending', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-03-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const months = contributionsByMonth(attributeContributions(config, ledger));
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-03']);
  });
});
