import { describe, expect, it } from 'vitest';
import { envelopeFor, envelopeId, envelopeName, outflow, resolveEnvelopes, transactionsFor } from './envelopes.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('envelopeId', () => {
  it("is the configured envelope's own id", () => {
    expect(envelopeId({ kind: 'configured', config: { id: 'groceries', name: 'Groceries', matches: [], estimate: 0, goal: null, seasonal: null } })).toBe('groceries');
  });

  it("is the derived envelope's category/subCategory id", () => {
    expect(envelopeId({ kind: 'derived', id: 'Loisirs / Cinema', category: 'Loisirs', subCategory: 'Cinema' })).toBe(
      'Loisirs / Cinema',
    );
  });
});

describe('envelopeName', () => {
  it("is the configured envelope's own name, distinct from its id", () => {
    expect(envelopeName({ kind: 'configured', config: { id: 'groceries', name: 'Groceries', matches: [], estimate: 0, goal: null, seasonal: null } })).toBe('Groceries');
  });

  it("falls back to the derived envelope's id, since it has no other name", () => {
    expect(envelopeName({ kind: 'derived', id: 'Loisirs / Cinema', category: 'Loisirs', subCategory: 'Cinema' })).toBe(
      'Loisirs / Cinema',
    );
  });
});

describe('resolveEnvelopes', () => {
  it('resolves a pair the config claims to its configured envelope, and an uncovered one to a derived envelope', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
    ]);
    const resolved = resolveEnvelopes(config, ledger);

    expect(resolved).toHaveLength(2);
    expect(resolved.find((e) => e.kind === 'configured')).toMatchObject({ config: { id: 'groceries' } });
    expect(resolved.find((e) => e.kind === 'derived')).toMatchObject({
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

  it('keeps two distinct pairs distinct even when their category and sub-category, joined, would overlap', () => {
    // "Loisirs et" + "vacances Bar" and "Loisirs et vacances" + "Bar" join to
    // the same string under any single-character delimiter — this must
    // resolve to two derived envelopes, not one silently swallowing the
    // other's spending.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ id: 'x', occurredOn: '2026-01-05', amount: -1000, category: 'Loisirs et', subCategory: 'vacances Bar' }),
      tx({ id: 'y', occurredOn: '2026-01-06', amount: -2000, category: 'Loisirs et vacances', subCategory: 'Bar' }),
    ]);
    const derived = resolveEnvelopes(config, ledger).filter((e) => e.kind === 'derived');
    expect(derived).toHaveLength(2);
    expect(transactionsFor(derived[0]!, ledger).map((t) => t.id)).toHaveLength(1);
    expect(transactionsFor(derived[1]!, ledger).map((t) => t.id)).toHaveLength(1);
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
    // Three ids, declared in an order that is neither the sorted output nor
    // its exact reverse: 'Zebra', 'apple', 'Mango' in TOML declaration order,
    // sorting to ['Mango', 'Zebra', 'apple'] by plain code-point value
    // (uppercase letters sort before lowercase). Reversal specifically was
    // ruled out, not just "some shuffle": a comparator pinned to always
    // return -1 reverses whatever order Array.sort receives, so a declared
    // order that already IS the sorted output's reverse would pass against
    // that broken comparator by coincidence — verified directly, and it is
    // exactly why an earlier version of this test (declared as ['apple',
    // 'Zebra', 'Mango'], the reverse of the sorted output) missed that
    // mutant despite intending to catch it.
    const config = numbersConfig({
      envelopes: `
[envelopes.Zebra]
name = "Zebra"
matches = [{ category = "Z", sub_category = "Z" }]
estimate = "10.00"

[envelopes.apple]
name = "Apple"
matches = [{ category = "A", sub_category = "A" }]
estimate = "10.00"

[envelopes.Mango]
name = "Mango"
matches = [{ category = "M", sub_category = "M" }]
estimate = "10.00"
`,
    });
    const ids = resolveEnvelopes(config, ledgerOf([])).map((e) => envelopeId(e));
    expect(ids).toEqual(['Mango', 'Zebra', 'apple']);
  });

  it('breaks a sort tie by keeping the configured envelope before the derived one it collides with', () => {
    // A configured envelope's id and a derived "category / subCategory" id
    // live in the same namespace with nothing stopping them coinciding: here
    // the configured envelope is named "A / B", and a ledger transaction for
    // category "A" / subCategory "B" is not one of ITS matchers, so it is
    // left uncovered and derives its own envelope — also named "A / B". The
    // comparator returns 0 for the tie, and `.sort()` is spec-guaranteed
    // stable, so the configured one (always first in the pre-sort array)
    // stays first. This is the only way to exercise the comparator's
    // "equal" branch and the `<`/`>` widenings to `<=`/`>=` through the
    // exported function — envelope ids are otherwise unique by construction.
    const config = numbersConfig({
      envelopes: `
[envelopes."A / B"]
name = "Configured A / B"
matches = [{ category = "X", sub_category = "Y" }]
estimate = "10.00"
`,
    });
    const ledger = ledgerOf([tx({ occurredOn: '2026-01-05', amount: -1000, category: 'A', subCategory: 'B' })]);
    const resolved = resolveEnvelopes(config, ledger);
    expect(resolved.map((e) => e.kind)).toEqual(['configured', 'derived']);
    expect(resolved.map((e) => envelopeId(e))).toEqual(['A / B', 'A / B']);
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

  it('demands both category and sub-category from a derived envelope, not either', () => {
    // A derived envelope's identity is its exact (category, subCategory) pair
    // — `resolveEnvelopes` synthesises one per pair, not one per category.
    // Matching on category alone would return the wrong envelope for any two
    // pairs sharing a category, and silently misattribute one's spending to
    // the other.
    const config = numbersConfig();
    const resolved = resolveEnvelopes(
      config,
      ledgerOf([
        tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
      ]),
    );
    expect(envelopeFor(resolved, 'Loisirs et vacances', 'Cinema')).not.toBeNull();
    expect(envelopeFor(resolved, 'Loisirs et vacances', 'Something else')).toBeNull();
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
    const envelope = resolveEnvelopes(config, ledger).find((e) => e.kind === 'configured');
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
