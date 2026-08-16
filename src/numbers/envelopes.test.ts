import { describe, expect, it } from 'vitest';
import { envelopeFor, outflow, resolveEnvelopes, transactionsFor } from './envelopes.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('resolveEnvelopes', () => {
  it('resolves a pair the config claims to its configured envelope, and an uncovered one to a derived envelope', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);

    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({ kind: 'configured', config: { id: 'groceries' } });
    expect(resolved[1]).toMatchObject({
      kind: 'derived',
      category: 'Loisirs et vacances',
      subCategory: 'Cinema',
    });
  });

  it('gives a configured envelope with several matchers one entry, not one per matcher', () => {
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
      tx({ occurredOn: '2026-01-06', amount: -1200, category: 'Alimentation', subCategory: 'Marche' }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ kind: 'configured', config: { id: 'groceries' } });
  });

  it('never derives an envelope for a settlement or a transfer', () => {
    // A configured envelope always appears regardless of the ledger — this
    // config declares "groceries" — so the check is that nothing *derived*
    // shows up for these two, not that the result is empty.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ kind: 'settlement', occurredOn: '2026-01-05', amount: -20000, category: 'Transaction exclue', subCategory: 'Transaction differee' }),
      tx({ kind: 'transfer-in', occurredOn: '2026-01-05', amount: 100000, category: 'Transaction exclue', subCategory: 'Virement interne' }),
    ]);
    expect(resolveEnvelopes(config, ledger).every((e) => e.kind === 'configured')).toBe(true);
  });

  it('sorts by id: the configured envelope\'s own id, or the derived "category / subCategory" id', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      // "Loisirs..." sorts after "groceries" (the configured envelope's id).
      tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const ids = resolveEnvelopes(config, ledger).map((e) => (e.kind === 'configured' ? e.config.id : e.id));
    expect(ids).toEqual(['groceries', 'Loisirs et vacances / Cinema']);
  });
});

describe('envelopeFor', () => {
  it('finds the configured envelope claiming a pair', () => {
    const config = numbersConfig();
    const resolved = resolveEnvelopes(
      config,
      ledgerOf([tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' })]),
    );
    const found = envelopeFor(resolved, 'Alimentation', 'Supermarche');
    expect(found).toMatchObject({ kind: 'configured', config: { id: 'groceries' } });
  });

  it('finds a derived envelope by its exact pair', () => {
    const config = numbersConfig();
    const resolved = resolveEnvelopes(
      config,
      ledgerOf([tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' })]),
    );
    expect(envelopeFor(resolved, 'Loisirs et vacances', 'Cinema')).toMatchObject({ kind: 'derived' });
  });

  it('returns null for a pair nothing resolved claims', () => {
    const config = numbersConfig();
    const resolved = resolveEnvelopes(config, ledgerOf([]));
    expect(envelopeFor(resolved, 'Nothing', 'Here')).toBeNull();
  });
});

describe('transactionsFor', () => {
  it('collects every matcher of a multi-matcher configured envelope', () => {
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
      tx({ id: 'a', occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: 'b', occurredOn: '2026-01-06', amount: -1200, category: 'Alimentation', subCategory: 'Marche' }),
      tx({ id: 'c', occurredOn: '2026-01-07', amount: -500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
    ]);
    const [envelope] = resolveEnvelopes(config, ledger);
    expect(transactionsFor(envelope!, ledger).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes anything that is not a movement', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ id: 'movement', occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({
        id: 'settlement',
        kind: 'settlement',
        occurredOn: '2026-01-05',
        amount: -3000,
        category: 'Alimentation',
        subCategory: 'Supermarche',
      }),
    ]);
    const [envelope] = resolveEnvelopes(config, ledger);
    expect(transactionsFor(envelope!, ledger).map((t) => t.id)).toEqual(['movement']);
  });
});

describe('outflow', () => {
  it('nets a refund against the purchase it applies to', () => {
    const transactions = [
      tx({ occurredOn: '2026-01-05', amount: -3000 }),
      tx({ occurredOn: '2026-01-10', amount: 800 }),
    ];
    expect(outflow(transactions)).toBe(2200);
  });

  it('floors at zero when refunds outweigh purchases, rather than going negative', () => {
    const transactions = [
      tx({ occurredOn: '2026-01-05', amount: -1000 }),
      tx({ occurredOn: '2026-01-10', amount: 1500 }),
    ];
    expect(outflow(transactions)).toBe(0);
  });
});
