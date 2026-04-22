import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeCsvParser } from '../../../../src/infra/csv/node-csv-parser.js';
import type { ParseOptions } from '../../../../src/core/ports/csv-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../../fixtures/csv');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

const defaultOpts: ParseOptions = {
  format: 'bpce',
  currency: 'EUR',
  timezone: 'Europe/Paris',
  sourceAccount: 'main-test',
};

describe('NodeCsvParser — BPCE happy path', () => {
  it('parses a 5-row BPCE CSV with correct items, no errors, correct direction and amounts', () => {
    // fails if: sourceAccount is dropped or mutated, delimiter defaults to comma,
    // decimal normalisation skipped, DD/MM parsed as MM/DD, or DST-aware offset resolution regresses
    const content = readFixture('bpce-valid.csv');
    const parser = new NodeCsvParser();
    const result = parser.parse(content, defaultOpts);

    expect(result.isSuccess).toBe(true);
    const { items, errors } = result.value;
    expect(items).toHaveLength(5);
    expect(errors).toHaveLength(0);

    // Every item stamped with sourceAccount from opts
    items.forEach(item => {
      expect(item.sourceAccount).toBe('main-test');
    });

    // Credit row (index 3) → inflow, positive magnitude from Credit column (+19,63)
    const creditRow = items[3];
    expect(creditRow.direction).toBe('inflow');
    expect(creditRow.amount.amount).toBe(1963);
    expect(creditRow.amount.currency).toBe('EUR');

    // Debit rows → outflow, positive magnitude from Debit column (sign stripped)
    const debit0 = items[0];
    expect(debit0.direction).toBe('outflow');
    expect(debit0.amount.amount).toBe(8550);
    expect(debit0.amount.currency).toBe('EUR');

    const debit1 = items[1];
    expect(debit1.direction).toBe('outflow');
    expect(debit1.amount.amount).toBe(2390);

    const debit4 = items[4];
    expect(debit4.direction).toBe('outflow');
    expect(debit4.amount.amount).toBe(1299);

    // Date normalisation: 20/04/2026 in Europe/Paris → +02:00 (CEST / summer time)
    // occurredAt comes from 'Date operation' column (column index 10)
    expect(debit0.occurredAt).toBe('2026-04-20T00:00:00+02:00');

    // Description comes from 'Libelle simplifie' column
    expect(debit0.description).toBe('SUPERMARCHE FICTIF');
    expect(creditRow.description).toBe('REMBOURSEMENT MUTUELLE');
  });
});
