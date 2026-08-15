import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';
import { parseOfx } from './ofx.ts';
import { JoinMismatchError, joinPositionally } from './join.ts';
import { csvFixture, ofxFixture, type FixtureRow } from './__fixtures__/build.ts';

const rows: FixtureRow[] = [
  { postedOn: '01/03/2026', amount: '-4,50', label: 'COFFEE' },
  // The same amount, the same day. A (date, amount) join cannot tell these two
  // apart; position can.
  { postedOn: '01/03/2026', amount: '-4,50', label: 'COFFEE AGAIN' },
  { postedOn: '02/03/2026', amount: '-31,20', label: 'GROCER' },
];

describe('joinPositionally', () => {
  it('pairs each OFX row with the CSV row in the same position', () => {
    const joined = joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(rows)), 'acct');
    expect(joined).toHaveLength(3);
    expect(joined.map((j) => j.csv.label)).toEqual(['COFFEE', 'COFFEE AGAIN', 'GROCER']);
    expect(joined.map((j) => j.ofx.fitId)).toEqual(['FIT1', 'FIT2', 'FIT3']);
  });

  it('resolves same-day identical amounts, which an amount join cannot', () => {
    const joined = joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(rows)), 'acct');
    expect(joined[0]?.ofx.fitId).toBe('FIT1');
    expect(joined[1]?.ofx.fitId).toBe('FIT2');
  });

  it('refuses to pair files of different lengths', () => {
    expect(() =>
      joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(rows.slice(0, 2))), 'acct'),
    ).toThrow(/3 transactions and the CSV has 2/);
  });

  it('throws rather than shifting categories when the orderings diverge', () => {
    // This is the failure the positional join exists to make loud. Silently
    // accepting it would attach every category to the wrong transaction.
    const reordered = [rows[2]!, rows[0]!, rows[1]!];
    expect(() => joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(reordered)), 'acct')).toThrow(
      JoinMismatchError,
    );
  });

  it('names the row and the file position when it diverges', () => {
    const differentAmount = [rows[0]!, { ...rows[1]!, amount: '-9,99' }, rows[2]!];
    expect(() =>
      joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(differentAmount)), 'acct'),
    ).toThrow(/row 2/);
  });
});
