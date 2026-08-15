import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, CsvFormatError, parseCsv } from './csv.ts';
import { csvFixture } from './__fixtures__/build.ts';

describe('parseCsv', () => {
  it('reads a debit as a negative amount and a credit as a positive one', () => {
    const rows = parseCsv(
      csvFixture([
        { postedOn: '14/08/2026', amount: '-21,51' },
        { postedOn: '03/08/2026', amount: '+4000,00' },
      ]),
    );
    expect(rows.map((r) => r.amount)).toEqual([-2151, 400000]);
  });

  it('keeps the value date separate from the posting date', () => {
    // On a deferred card these differ by up to a month, and that gap is the
    // whole in-flight problem.
    const [row] = parseCsv(csvFixture([{ postedOn: '11/08/2026', valueOn: '04/09/2026', amount: '-7,00' }]));
    expect(row?.postedOn).toBe('2026-08-11');
    expect(row?.valueOn).toBe('2026-09-04');
  });

  it('decodes ISO-8859-1 accents rather than mangling them', () => {
    const [row] = parseCsv(csvFixture([{ postedOn: '01/02/2026', amount: '-5,90', label: 'CRÊPERIE' }]));
    expect(row?.label).toBe('CRÊPERIE');
  });

  it('rejects a file whose columns are not the ones expected', () => {
    const bad = Buffer.from('Date;Amount\r\n01/01/2026;-1,00\r\n', 'latin1');
    expect(() => parseCsv(bad, 'export.csv')).toThrow(CsvFormatError);
    expect(() => parseCsv(bad, 'export.csv')).toThrow(/format may have changed/);
  });

  it('rejects a renamed column even when the count still matches', () => {
    const renamed: string[] = [...CSV_COLUMNS];
    renamed[6] = 'Category';
    const bad = Buffer.from(renamed.join(';') + '\r\n', 'latin1');
    expect(() => parseCsv(bad, 'export.csv')).toThrow(/column 7 is "Category"/);
  });

  it('rejects a row split by an unescaped separator instead of shifting fields', () => {
    const good = csvFixture([{ postedOn: '01/01/2026', amount: '-1,00' }]);
    const broken = Buffer.from(Buffer.from(good).toString('latin1').replace('MERCHANT', 'A;B'), 'latin1');
    expect(() => parseCsv(broken, 'export.csv')).toThrow(/fields, expected 13/);
  });

  it('rejects a row carrying both a debit and a credit', () => {
    const text = Buffer.from(csvFixture([{ postedOn: '01/01/2026', amount: '-1,00' }])).toString('latin1');
    const both = Buffer.from(text.replace('-1,00;;', '-1,00;+2,00;'), 'latin1');
    expect(() => parseCsv(both, 'export.csv')).toThrow(/both Debit and Credit/);
  });

  it('reports the line number so the row can be found', () => {
    const text = Buffer.from(
      csvFixture([
        { postedOn: '01/01/2026', amount: '-1,00' },
        { postedOn: '02/01/2026', amount: '-2,00' },
      ]),
    ).toString('latin1');
    const broken = Buffer.from(text.replace('-2,00', 'oops'), 'latin1');
    expect(() => parseCsv(broken, 'export.csv')).toThrow(/export\.csv:3/);
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv(Buffer.from('', 'latin1'), 'export.csv')).toThrow(/is empty/);
  });
});
