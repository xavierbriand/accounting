import { describe, expect, it } from 'vitest';
import { OfxFormatError, parseOfx } from './ofx.ts';
import { ofxFixture } from './__fixtures__/build.ts';

describe('parseOfx', () => {
  it('reads the transactions, the account and the window', () => {
    const statement = parseOfx(
      ofxFixture([{ postedOn: '14/08/2026', amount: '-22,20', label: 'COTISATION' }], {
        accountId: '00000000001',
        from: '20250101',
        to: '20260815',
      }),
    );
    expect(statement.accountId).toBe('00000000001');
    expect(statement.from).toBe('2025-01-01');
    expect(statement.to).toBe('2026-08-15');
    expect(statement.transactions).toHaveLength(1);
    expect(statement.transactions[0]?.amount).toBe(-2220);
    expect(statement.transactions[0]?.fitId).toBe('FIT1');
  });

  it('reads the closing balance, which the CSV does not carry', () => {
    const statement = parseOfx(
      ofxFixture([{ postedOn: '01/01/2026', amount: '-1,00' }], { balance: '+300.00', to: '20260815' }),
    );
    expect(statement.balance).toBe(30000);
    expect(statement.balanceAsOf).toBe('2026-08-15');
  });

  it('reads a negative card balance as unsettled spending', () => {
    const statement = parseOfx(
      ofxFixture([{ postedOn: '01/08/2026', amount: '-500,00' }], { balance: '-500.00' }),
    );
    expect(statement.balance).toBe(-50000);
  });

  it('refuses a file with no closing balance', () => {
    // Without it there is no way to tell cash on hand from spending already
    // committed, which is the one number the bank never shows in one place.
    expect(() =>
      parseOfx(ofxFixture([{ postedOn: '01/01/2026', amount: '-1,00' }], { omitBalance: true }), 'x.ofx'),
    ).toThrow(/LEDGERBAL/);
  });

  it('refuses a file that is not OFX at all', () => {
    expect(() => parseOfx(Buffer.from('just some text', 'latin1'), 'x.ofx')).toThrow(OfxFormatError);
  });

  it('accepts a statement with no transactions and still reads its balance', () => {
    // A card retired part-way through the year has no activity in a later
    // window. Rejecting the file would abort the entire ledger over a card that
    // simply was not used.
    const statement = parseOfx(ofxFixture([], { balance: '+123.45', to: '20260815' }), 'carte_1111.ofx');
    expect(statement.transactions).toHaveLength(0);
    expect(statement.balance).toBe(12345);
    expect(statement.balanceAsOf).toBe('2026-08-15');
  });

  it('does not confuse <DTSERVER> in the header with <DTSTART>', () => {
    const statement = parseOfx(ofxFixture([{ postedOn: '01/01/2026', amount: '-1,00' }], { from: '20250101' }));
    expect(statement.from).toBe('2025-01-01');
  });
});
