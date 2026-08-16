import { describe, expect, it } from 'vitest';
import { generateEnvelopeBlock } from './generate.ts';
import { parseConfig } from '../config/schema.ts';
import { configToml } from '../config/__fixtures__/build.ts';
import { ledgerOf, numbersConfig, tx } from './__fixtures__/build.ts';

describe('generateEnvelopeBlock', () => {
  it('emits an id slugified from the pair — spaces folded to underscore', () => {
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    expect(block).toContain('[envelopes.alimentation_supermarche]');
  });

  it('strips accents from the id, not just from the display name', () => {
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Énergie', subCategory: 'Électricité' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    expect(block).toContain('[envelopes.energie_electricite]');
    // The display name keeps the accents — only the id is folded to ASCII.
    expect(block).toContain('name = "Énergie / Électricité"');
  });

  it('sets estimate to the year’s net outflow, worked by hand', () => {
    const ledger = ledgerOf([
      tx({ id: 'a', occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: 'b', occurredOn: '2026-02-05', amount: -1200, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ id: 'refund', occurredOn: '2026-02-10', amount: 200, category: 'Alimentation', subCategory: 'Supermarche' }),
      // A different year — must not be counted.
      tx({ id: 'other-year', occurredOn: '2025-01-05', amount: -99999, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    // 3000 + 1200 - 200 (the refund nets it down) = 4000 = "40.00".
    expect(block).toContain('estimate = "40.00"');
  });

  it('derives the seasonal shape from the SAME year, not the year before', () => {
    const ledger = ledgerOf([
      tx({ occurredOn: '2025-06-05', amount: -99999, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ occurredOn: '2026-03-05', amount: -1000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    // If this used 2025 (year - 1) as the source year, the weight would be
    // all in June (index 5); it must be all in March (index 2) instead.
    expect(block).toContain('weights = [0, 0, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0]');
  });

  it('skips a pair a configured envelope already claims', () => {
    const config = numbersConfig(); // declares groceries over Alimentation/Supermarche
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ occurredOn: '2026-01-06', amount: -1500, category: 'Loisirs et vacances', subCategory: 'Cinema' }),
    ]);
    const block = generateEnvelopeBlock(ledger, config, 2026);
    expect(block).not.toContain('alimentation_supermarche');
    expect(block).toContain('loisirs_et_vacances_cinema');
  });

  it('notes a declared envelope with no spending this year, rather than staying silent', () => {
    const config = numbersConfig(); // declares groceries
    const ledger = ledgerOf([
      tx({ occurredOn: '2025-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }), // only in 2025
    ]);
    const block = generateEnvelopeBlock(ledger, config, 2026);
    expect(block).toContain('"groceries" had no spending in 2026');
  });

  it('still notes it when the only transaction this year is a refund, not a purchase', () => {
    // A transaction exists in 2026 — a `.some(...)` check on presence alone
    // would miss this. Net outflow is what actually matters: a refund with
    // no purchase behind it this year is zero real spending.
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-03-05', amount: 1500, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const block = generateEnvelopeBlock(ledger, config, 2026);
    expect(block).toContain('"groceries" had no spending in 2026');
  });

  it('orders new envelopes by (category, subCategory), not ledger encounter order', () => {
    const ledger = ledgerOf([
      // Built in reverse of the expected output order — "Z"'s transaction
      // comes first in the ledger, "A"'s second.
      tx({ occurredOn: '2026-01-06', amount: -1000, category: 'Z', subCategory: 'Z' }),
      tx({ occurredOn: '2026-01-05', amount: -2000, category: 'A', subCategory: 'A' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    const aIndex = block.indexOf('[envelopes.a_a]');
    const zIndex = block.indexOf('[envelopes.z_z]');
    expect(aIndex).toBeGreaterThanOrEqual(0);
    expect(zIndex).toBeGreaterThan(aIndex);
  });

  it('disambiguates two pairs that would otherwise slugify to the same id', () => {
    const ledger = ledgerOf([
      tx({ id: 'a', occurredOn: '2026-01-05', amount: -1000, category: 'A B', subCategory: 'C' }),
      tx({ id: 'b', occurredOn: '2026-01-06', amount: -2000, category: 'A', subCategory: 'B C' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    expect(block).toContain('[envelopes.a_b_c]');
    expect(block).toContain('[envelopes.a_b_c_2]');
  });

  it('says so when there is nothing new to configure', () => {
    const config = numbersConfig();
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -3000, category: 'Alimentation', subCategory: 'Supermarche' }),
    ]);
    const block = generateEnvelopeBlock(ledger, config, 2026);
    expect(block).toContain('No new spending to configure for 2026');
  });

  it('produces text that is itself a valid sluice.toml, end to end', () => {
    const ledger = ledgerOf([
      tx({ occurredOn: '2026-01-05', amount: -300000, category: 'Alimentation', subCategory: 'Supermarche' }),
      tx({ occurredOn: '2026-06-05', amount: -50000, category: 'Loisirs et vacances', subCategory: 'Vacances' }),
    ]);
    const block = generateEnvelopeBlock(ledger, null, 2026);
    const config = parseConfig(configToml({ envelopes: block }), 'sluice.toml');

    expect(config.envelopes.map((e) => e.id).sort()).toEqual([
      'alimentation_supermarche',
      'loisirs_et_vacances_vacances',
    ]);
    const groceries = config.envelopes.find((e) => e.id === 'alimentation_supermarche');
    expect(groceries?.estimate).toBe(300000);
  });
});
