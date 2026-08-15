import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';
import { parseOfx } from './ofx.ts';
import { joinPositionally } from './join.ts';
import { DuplicateTransactionError, mergeLedger, toTransactions } from './ledger.ts';
import { sourceOf } from './sources.ts';
import { csvFixture, ofxFixture, type FixtureRow } from './__fixtures__/build.ts';

function build(rows: readonly FixtureRow[], filename: string) {
  const source = sourceOf(filename);
  const joined = joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(rows)), source.id);
  return toTransactions(joined, source);
}

const CARD_SETTLEMENT: FixtureRow = {
  postedOn: '04/08/2026',
  amount: '-1234,56',
  label: 'DEBIT DIFFERE N° ...1111',
  operationType: 'Carte bancaire',
  category: 'Transaction exclue',
  subCategory: 'Transaction differee',
};

const CONTRIBUTION: FixtureRow = {
  postedOn: '03/08/2026',
  amount: '+4000,00',
  label: 'VIR. VERS COMPTE CHEQUE',
  operationType: 'Virement recu',
  category: 'Transaction exclue',
  subCategory: 'Virement interne',
};

const TRANSFER_OUT: FixtureRow = {
  postedOn: '10/08/2026',
  amount: '-475,00',
  label: 'VIR. VERS COMPTE CHEQUE',
  operationType: 'Virement',
  category: 'Transaction exclue',
  subCategory: 'Virement interne',
};

const GROCERIES: FixtureRow = {
  postedOn: '05/08/2026',
  amount: '-84,20',
  category: 'Alimentation',
  subCategory: 'Supermarche',
};

describe('classification', () => {
  it('separates the three things the bank files under one "excluded" category', () => {
    // Filtering on the parent category is the obvious move and it deletes the
    // household's entire funding side along with the card settlements.
    const ledger = build([CARD_SETTLEMENT, CONTRIBUTION, TRANSFER_OUT, GROCERIES], 'acct_01012024_31122024.ofx');
    expect(ledger.map((t) => t.kind)).toEqual(['settlement', 'transfer-in', 'transfer-out', 'movement']);
  });

  it('reads a refund as a positive movement, not as funding', () => {
    const refund: FixtureRow = { postedOn: '09/05/2026', amount: '+19,90', category: 'Alimentation' };
    const [t] = build([refund], 'acct_01012024_31122024.ofx');
    expect(t?.kind).toBe('movement');
    expect(t?.amount).toBeGreaterThan(0);
  });

  it('dates a card purchase when it happened and records when it settles', () => {
    const purchase: FixtureRow = { postedOn: '11/08/2026', valueOn: '04/09/2026', amount: '-7,00' };
    const [t] = build([purchase], 'carte_1111_01012024_31122024.ofx');
    expect(t?.occurredOn).toBe('2026-08-11');
    expect(t?.settlesOn).toBe('2026-09-04');
  });
});

describe('mergeLedger', () => {
  const rows: FixtureRow[] = [GROCERIES, CONTRIBUTION];

  it('is idempotent: importing the same export twice changes nothing', () => {
    const batch = build(rows, 'acct_01012024_31122024.ofx');
    const once = mergeLedger([batch]);
    const twice = mergeLedger([batch, batch]);
    expect(twice).toHaveLength(once.length);
    expect(twice.map((t) => t.amount)).toEqual(once.map((t) => t.amount));
  });

  it('is idempotent across overlapping exports of different date ranges', () => {
    // The export filename carries the range, but the source id must not, or a
    // re-export over a wider window would duplicate every row.
    const january = build(rows, 'acct_01012024_31012024.ofx');
    const wider = build(rows, 'acct_01012024_31122024.ofx');
    expect(mergeLedger([january, wider])).toHaveLength(rows.length);
  });

  it('keeps two cards apart even though the bank reuses row ids between them', () => {
    // Both cards are filed under one account id and both restart their row ids
    // per statement, so this pair really does collide in the raw exports.
    const shared: FixtureRow[] = [{ postedOn: '10/08/2026', amount: '-14,00', fitId: '202609040' }];
    const other: FixtureRow[] = [{ postedOn: '11/08/2026', amount: '-7,00', fitId: '202609040' }];
    const merged = mergeLedger([
      build(shared, 'carte_2222_01012024_31122024.ofx'),
      build(other, 'carte_1111_01012024_31122024.ofx'),
    ]);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((t) => t.id)).size).toBe(2);
  });

  it('refuses to merge two different transactions that claim the same identity', () => {
    const a: FixtureRow[] = [{ postedOn: '10/08/2026', amount: '-14,00', fitId: 'SAME' }];
    const b: FixtureRow[] = [{ postedOn: '11/08/2026', amount: '-7,00', fitId: 'SAME' }];
    expect(() =>
      mergeLedger([build(a, 'acct_01012024_31122024.ofx'), build(b, 'acct_01012024_31122024.ofx')]),
    ).toThrow(DuplicateTransactionError);
  });

  it('returns the ledger in date order', () => {
    const merged = mergeLedger([build([TRANSFER_OUT, GROCERIES, CONTRIBUTION], 'acct_01012024_31122024.ofx')]);
    expect(merged.map((t) => t.occurredOn)).toEqual(['2026-08-03', '2026-08-05', '2026-08-10']);
  });
});
