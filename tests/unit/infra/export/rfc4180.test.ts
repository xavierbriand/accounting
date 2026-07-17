/**
 * Unit tests for the hand-rolled RFC-4180 CSV escaper (story-4.5b, R2 surface) —
 * no new dependency; round-trip-proven against the project's own `csv-parse`
 * (already a runtime dependency, used by NodeCsvParser).
 *
 * Gherkin coverage: none directly — underpins tests/features/export.feature's
 *   bundle-fidelity scenario (hostile description text).
 *
 * fails if: a field containing a comma, quote, or newline round-trips to a
 *   different value through stringify → parse, or a field with none of those
 *   is quoted unnecessarily (bloats every ordinary row for no reason).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parse as csvParse } from 'csv-parse/sync';
import { escapeCsvField, toCsvLine } from '../../../../src/infra/export/rfc4180.js';

describe('escapeCsvField', () => {
  it('leaves a plain field unquoted', () => {
    expect(escapeCsvField('Groceries')).toBe('Groceries');
  });

  it('quotes and doubles internal quotes for a field containing a comma', () => {
    expect(escapeCsvField('Rent, March')).toBe('"Rent, March"');
  });

  it('quotes and doubles internal quotes for a field containing a double quote', () => {
    expect(escapeCsvField('Refund for "broken" item')).toBe('"Refund for ""broken"" item"');
  });

  it('quotes a field containing a newline', () => {
    expect(escapeCsvField('Multi-line\nmemo')).toBe('"Multi-line\nmemo"');
  });

  it('leaves an empty field unquoted', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('toCsvLine', () => {
  it('joins escaped fields with commas', () => {
    expect(toCsvLine(['a', 'b, c', 'd'])).toBe('a,"b, c",d');
  });
});

describe('round-trip through the project\'s own csv-parse', () => {
  it('hostile fixtures (commas, quotes, newlines) survive a stringify → parse round trip byte-equal', () => {
    const rows = [
      ['id', 'description'],
      ['tx-1', 'Rent, March payment'],
      ['tx-2', 'Refund for "broken" item'],
      ['tx-3', 'Multi-line\nmemo entry'],
      ['tx-4', 'Combo, "quoted"\nand newline'],
      ['tx-5', ''],
      ['tx-6', '0042'], // leading zeros — must survive as a string, not a number
    ];

    const csvText = rows.map(toCsvLine).join('\r\n') + '\r\n';
    const parsed = csvParse(csvText, { columns: true }) as Array<Record<string, string>>;

    expect(parsed).toHaveLength(rows.length - 1);
    for (let i = 0; i < parsed.length; i++) {
      expect(parsed[i]['id']).toBe(rows[i + 1][0]);
      expect(parsed[i]['description']).toBe(rows[i + 1][1]);
    }
  });

  it('property: any generated row of strings survives a stringify → parse round trip byte-equal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
        (fields) => {
          const header = fields.map((_, i) => `col${i}`);
          const csvText = [toCsvLine(header), toCsvLine(fields)].join('\r\n') + '\r\n';
          const parsed = csvParse(csvText, { columns: true }) as Array<Record<string, string>>;
          expect(parsed).toHaveLength(1);
          for (let i = 0; i < fields.length; i++) {
            expect(parsed[0][`col${i}`]).toBe(fields[i]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
