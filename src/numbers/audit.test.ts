import { describe, expect, it } from 'vitest';
import { auditPlan, UNCATEGORISED_INCOMING, UNCATEGORISED_OUTGOING } from './audit.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('auditPlan — matcher-matches-nothing', () => {
  it('flags a matcher that never fires against a real transaction', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([]); // no groceries spending at all
    const warnings = auditPlan(config, ledger);
    expect(warnings).toContainEqual({
      kind: 'matcher-matches-nothing',
      envelopeId: 'groceries',
      matcher: { kind: 'sub-category', category: 'Alimentation', subCategory: 'Supermarche' },
    });
  });

  it('does not flag a matcher that does fire', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const warnings = auditPlan(config, ledger);
    expect(warnings.some((w) => w.kind === 'matcher-matches-nothing')).toBe(false);
  });

  it('flags each dead matcher of a multi-matcher envelope independently — one fires, one does not', () => {
    const config = numbersConfig({
      envelopes: `
[envelopes.groceries]
name = "Groceries"
matches = [
  { category = "Alimentation", sub_category = "Supermarche" },
  { category = "Alimentation", sub_category = "Marche" },
]
estimate = "1200.00"
`,
    });
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const warnings = auditPlan(config, ledger).filter((w) => w.kind === 'matcher-matches-nothing');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ matcher: { subCategory: 'Marche' } });
  });
});

describe('auditPlan — label-matches-nothing', () => {
  it('flags a transfer label that never catches a real transfer', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([]); // no transfers at all
    const warnings = auditPlan(config, ledger);
    expect(warnings).toContainEqual({
      kind: 'label-matches-nothing',
      personId: 'alice',
      label: 'VIR ALICE MARTIN',
    });
  });

  it('does not flag a label that does catch a transfer', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', label: 'VIR ALICE MARTIN', amount: 100000 }),
    ]);
    const warnings = auditPlan(config, ledger).filter((w) => w.kind === 'label-matches-nothing');
    expect(warnings.some((w) => w.kind === 'label-matches-nothing' && w.personId === 'alice')).toBe(false);
  });
});

describe('auditPlan — transfer-matches-two-people', () => {
  it('flags a real transfer whose label satisfies two people at once', () => {
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
    const warnings = auditPlan(config, ledger).filter((w) => w.kind === 'transfer-matches-two-people');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ people: expect.arrayContaining([expect.objectContaining({ id: 'alice' }), expect.objectContaining({ id: 'carol' })]) });
  });
});

describe('auditPlan — uncategorised-rows', () => {
  it('counts and totals rows the bank has not filed under a real category yet', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: UNCATEGORISED_OUTGOING, subCategory: 'Virement emis - a categoriser' }),
      tx({ occurredOn: '2026-01-06', amount: 5000, category: UNCATEGORISED_INCOMING, subCategory: 'Virement recu - a categoriser' }),
    ]);
    const warnings = auditPlan(config, ledger);
    expect(warnings).toContainEqual({ kind: 'uncategorised-rows', count: 2, total: 2000 });
  });

  it('says nothing when there are no uncategorised rows', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const warnings = auditPlan(config, ledger);
    expect(warnings.some((w) => w.kind === 'uncategorised-rows')).toBe(false);
  });
});

describe('auditPlan — order', () => {
  it('is stated: grouped by kind, uncategorised-rows last', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: UNCATEGORISED_OUTGOING, subCategory: 'Virement emis - a categoriser' }),
    ]);
    const warnings = auditPlan(config, ledger);
    expect(warnings.map((w) => w.kind)).toEqual([
      'matcher-matches-nothing',
      'label-matches-nothing',
      'label-matches-nothing',
      'uncategorised-rows',
    ]);
  });

  it('sorts within a kind by its own key, not by declaration order', () => {
    // "zoe" is declared before "alice" — encounter order (a no-op sort
    // would preserve it, since Array.sort is stable) would put zoe's
    // warning first. The sorted contract puts alice's first.
    const config = numbersConfig({
      people: `
[people.zoe]
name = "Zoe"
transfer_labels = ["VIR ZOE"]

[[people.zoe.income]]
label = "Salary"
monthly = "3000.00"

[people.alice]
name = "Alice"
transfer_labels = ["VIR ALICE"]

[[people.alice.income]]
label = "Salary"
monthly = "3000.00"
`,
    });
    const ledger = ledgerOf([]); // neither label ever fires
    const warnings = auditPlan(config, ledger).filter((w) => w.kind === 'label-matches-nothing');
    expect(warnings.map((w) => (w.kind === 'label-matches-nothing' ? w.personId : null))).toEqual(['alice', 'zoe']);
  });
});
