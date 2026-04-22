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

describe('NodeCsvParser — direction from column (AC2 proof)', () => {
  it('maps Debit column to outflow and Credit column to inflow regardless of sign', () => {
    // fails if: direction is derived from the ± sign inside the cell instead of
    // from which column is populated
    const content = readFixture('bpce-valid.csv');
    const parser = new NodeCsvParser();
    const result = parser.parse(content, defaultOpts);

    expect(result.isSuccess).toBe(true);
    const { items } = result.value;

    // Row with Debit populated → outflow (even though cell has '-' prefix)
    const debitRow = items[0];
    expect(debitRow.direction).toBe('outflow');
    expect(debitRow.amount.amount).toBeGreaterThan(0);

    // Row with Credit populated → inflow (even though cell has '+' prefix)
    const creditRow = items[3];
    expect(creditRow.direction).toBe('inflow');
    expect(creditRow.amount.amount).toBeGreaterThan(0);
  });
});

describe('NodeCsvParser — per-row error isolation (AC3)', () => {
  it('skips malformed rows individually and returns valid siblings; PII never in error.reason', () => {
    // fails if: one bad row aborts the batch, or a raw description leaks into error.reason
    const content = readFixture('bpce-mixed.csv');
    const parser = new NodeCsvParser();
    const result = parser.parse(content, defaultOpts);

    expect(result.isSuccess).toBe(true);
    const { items, errors } = result.value;

    // 6 data rows: row 3 has invalid date (32/13/2026), row 5 has non-numeric amount (abc),
    // row 6 has both Debit AND Credit populated (ambiguous)
    expect(items).toHaveLength(3);
    expect(errors).toHaveLength(3);

    // Line numbers: header=1, data rows 2..7
    const errorLines = errors.map(e => e.line);
    expect(errorLines).toContain(4); // row 3 = line 4 (bad date)
    expect(errorLines).toContain(6); // row 5 = line 6 (bad amount)
    expect(errorLines).toContain(7); // row 6 = line 7 (ambiguous direction)

    // Field tags
    const dateError = errors.find(e => e.line === 4);
    expect(dateError?.field).toBe('date');

    const amountError = errors.find(e => e.line === 6);
    expect(amountError?.field).toBe('amount');

    const directionError = errors.find(e => e.line === 7);
    expect(directionError?.field).toBe('direction');

    // PII safety: none of the Libelle simplifie values appear in error reasons
    const piiValues = ['LIBRAIRIE FICTIVE', 'MAGASIN FICTIF', 'VIREMENT FICTIF', 'REF012', 'REF014', 'REF015'];
    errors.forEach(err => {
      piiValues.forEach(pii => {
        expect(err.reason).not.toContain(pii);
      });
    });
  });
});

describe('NodeCsvParser — encoding tolerance', () => {
  it('parses BOM-prefixed, CRLF line-ended CSV with trailing blank line correctly', () => {
    // fails if: BOM causes header mismatch, CRLF fragments leak into descriptions,
    // or the trailing blank line produces a phantom error
    const content = readFixture('bpce-encoding.csv');
    const parser = new NodeCsvParser();
    const result = parser.parse(content, { ...defaultOpts, timezone: 'Europe/Paris' });

    expect(result.isSuccess).toBe(true);
    const { items, errors } = result.value;

    // 2 data rows + trailing blank = 2 valid items, 0 errors
    expect(items).toHaveLength(2);
    expect(errors).toHaveLength(0);

    // French accents in descriptions should be preserved
    expect(items[0].description).toBe('CAFÉ DES ARTISTES');
    expect(items[1].description).toBe('BIBLIOTHÈQUE FICTIVE');

    // Winter date (January) → +01:00 (CET)
    expect(items[0].occurredAt).toBe('2026-01-15T00:00:00+01:00');
  });
});
