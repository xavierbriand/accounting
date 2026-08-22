import { describe, expect, it } from 'vitest';
import type { Day } from '../core/dates.ts';
import { parseCsv } from './csv.ts';
import { parseOfx } from './ofx.ts';
import { joinPositionally } from './join.ts';
import { DuplicateTransactionError, mergeLedger, toTransactions } from './ledger.ts';
import { sourceOf } from './sources.ts';
import { csvFixture, ofxFixture, type FixtureRow } from './__fixtures__/build.ts';

/** One export's worth of rows. `asOf` is when that export was taken. */
function build(rows: readonly FixtureRow[], filename: string, asOf = '2025-01-31') {
  const source = sourceOf(filename);
  const joined = joinPositionally(parseOfx(ofxFixture(rows)), parseCsv(csvFixture(rows)), source.id);
  return { transactions: toTransactions(joined, source), asOf: asOf as Day };
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
    const ledger = build([CARD_SETTLEMENT, CONTRIBUTION, TRANSFER_OUT, GROCERIES], '00000000001_01012024_31122024.ofx').transactions;
    expect(ledger.map((t) => t.kind)).toEqual(['settlement', 'transfer-in', 'transfer-out', 'movement']);
  });

  it('reads a refund as a positive movement, not as funding', () => {
    const refund: FixtureRow = { postedOn: '09/05/2026', amount: '+19,90', category: 'Alimentation' };
    const [t] = build([refund], '00000000001_01012024_31122024.ofx').transactions;
    expect(t?.kind).toBe('movement');
    expect(t?.amount).toBeGreaterThan(0);
  });

  it('dates a card purchase when it happened and records when it settles', () => {
    const purchase: FixtureRow = { postedOn: '11/08/2026', valueOn: '04/09/2026', amount: '-7,00' };
    const [t] = build([purchase], 'carte_1111_01012024_31122024.ofx').transactions;
    expect(t?.occurredOn).toBe('2026-08-11');
    expect(t?.settlesOn).toBe('2026-09-04');
  });

  it('reads a zero-amount internal transfer as inbound, not outbound', () => {
    // The boundary itself: `>= 0` puts exactly zero on the "in" side. A
    // household transfer that nets to nothing (an immediate correction, a
    // same-day reversal) still has to land on one side deterministically
    // rather than the other.
    const zero: FixtureRow = {
      postedOn: '05/08/2026',
      amount: '+0,00',
      label: 'VIR. VERS COMPTE CHEQUE',
      category: 'Transaction exclue',
      subCategory: 'Virement interne',
    };
    const [t] = build([zero], '00000000001_01012024_31122024.ofx').transactions;
    expect(t?.kind).toBe('transfer-in');
  });
});

describe('mergeLedger', () => {
  const rows: FixtureRow[] = [GROCERIES, CONTRIBUTION];

  it('is idempotent: importing the same export twice changes nothing', () => {
    const batch = build(rows, '00000000001_01012024_31122024.ofx');
    const once = mergeLedger([batch]);
    const twice = mergeLedger([batch, batch]);
    expect(twice).toHaveLength(once.length);
    expect(twice.map((t) => t.amount)).toEqual(once.map((t) => t.amount));
  });

  it('is idempotent across overlapping exports of different date ranges', () => {
    // The export filename carries the range, but the source id must not, or a
    // re-export over a wider window would duplicate every row.
    const january = build(rows, '00000000001_01012024_31012024.ofx');
    const wider = build(rows, '00000000001_01012024_31122024.ofx');
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

  it('refuses two rows sharing an id inside one statement, even if identical', () => {
    // The dangerous shape: same day, same amount, a purchase genuinely made
    // twice. Treating it as a re-import deletes one of them, and the total it
    // leaves behind is wrong but entirely plausible.
    const twice: FixtureRow[] = [
      { postedOn: '10/08/2026', amount: '-4,50', fitId: 'SAME' },
      { postedOn: '10/08/2026', amount: '-4,50', fitId: 'SAME' },
    ];
    expect(() => mergeLedger([build(twice, '00000000001_01012024_31122024.ofx')])).toThrow(
      /appears twice in one statement/,
    );
  });

  it('refuses to merge two different transactions that claim the same identity', () => {
    const a: FixtureRow[] = [{ postedOn: '10/08/2026', amount: '-14,00', fitId: 'SAME' }];
    const b: FixtureRow[] = [{ postedOn: '11/08/2026', amount: '-7,00', fitId: 'SAME' }];
    expect(() =>
      mergeLedger([build(a, '00000000001_01012024_31122024.ofx'), build(b, '00000000001_01012024_31122024.ofx')]),
    ).toThrow(DuplicateTransactionError);
  });

  it('refuses a same-id pair sharing the date but not the amount', () => {
    // "Same transaction" needs the date AND the amount to agree, not either
    // alone. Both rows below share their date, so this isolates the amount
    // half of the check from the case above, where both fields differ at
    // once and either alone would already explain the refusal.
    const a: FixtureRow[] = [{ postedOn: '10/08/2026', amount: '-14,00', fitId: 'SAME' }];
    const b: FixtureRow[] = [{ postedOn: '10/08/2026', amount: '-7,00', fitId: 'SAME' }];
    expect(() =>
      mergeLedger([build(a, '00000000001_01012024_31122024.ofx'), build(b, '00000000001_01012024_31122024.ofx')]),
    ).toThrow(DuplicateTransactionError);
  });

  it('refuses a same-id pair sharing the amount but not the date', () => {
    // The mirror of the test above: isolates the date half of the check.
    const a: FixtureRow[] = [{ postedOn: '10/08/2026', amount: '-14,00', fitId: 'SAME' }];
    const b: FixtureRow[] = [{ postedOn: '11/08/2026', amount: '-14,00', fitId: 'SAME' }];
    expect(() =>
      mergeLedger([build(a, '00000000001_01012024_31122024.ofx'), build(b, '00000000001_01012024_31122024.ofx')]),
    ).toThrow(DuplicateTransactionError);
  });

  it('keeps the newer export’s categories when a row is re-filed at the bank', () => {
    // The workflow this protects: correct a transaction's category in the
    // bank's own interface, export again, and keep both files in the folder.
    // Losing the correction here would be silent and permanent.
    const uncategorised: FixtureRow[] = [
      { postedOn: '05/01/2025', amount: '-40,00', fitId: 'A1', category: 'A categoriser - sortie d’argent' },
    ];
    const refiled: FixtureRow[] = [
      {
        postedOn: '05/01/2025',
        amount: '-40,00',
        fitId: 'A1',
        category: 'Transaction exclue',
        subCategory: 'Virement interne',
      },
    ];

    const merged = mergeLedger([
      build(refiled, '00000000001_01012025_28022025.ofx', '2025-02-28'),
      build(uncategorised, '00000000001_01012025_31012025.ofx', '2025-01-31'),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.category).toBe('Transaction exclue');
    // And the correction must carry through to classification, or the row keeps
    // being counted as household spending.
    expect(merged[0]?.kind).toBe('transfer-out');
  });

  it('decides which export is newer by its as-of date, not by filename order', () => {
    // The bank stamps files `_DDMMYYYY_DDMMYYYY`, so sorting them as text
    // compares the day before the month: "01012026" sorts before "01122025".
    // Reading order is therefore not chronological order.
    const older: FixtureRow[] = [{ postedOn: '20/12/2025', amount: '-30,00', fitId: 'F1', category: 'Old' }];
    const newer: FixtureRow[] = [{ postedOn: '20/12/2025', amount: '-30,00', fitId: 'F1', category: 'New' }];

    const filenameOrderWouldPickOlder = mergeLedger([
      build(newer, '00000000001_01012026_31012026.ofx', '2026-01-31'),
      build(older, '00000000001_01122025_31122025.ofx', '2025-12-31'),
    ]);
    expect(filenameOrderWouldPickOlder[0]?.category).toBe('New');

    // Same two exports, supplied in the other order: same answer.
    const reversed = mergeLedger([
      build(older, '00000000001_01122025_31122025.ofx', '2025-12-31'),
      build(newer, '00000000001_01012026_31012026.ofx', '2026-01-31'),
    ]);
    expect(reversed[0]?.category).toBe('New');
  });

  it('returns the ledger in date order', () => {
    const merged = mergeLedger([build([TRANSFER_OUT, GROCERIES, CONTRIBUTION], '00000000001_01012024_31122024.ofx')]);
    expect(merged.map((t) => t.occurredOn)).toEqual(['2026-08-03', '2026-08-05', '2026-08-10']);
  });

  it('breaks a same-day tie by id, not by declaration order', () => {
    // Two rows sharing a date, with the later-sorting id declared first — a
    // no-op sort (Array.sort is stable) would leave it first. The stated
    // contract puts the earlier id first regardless.
    const rows: FixtureRow[] = [
      { postedOn: '10/08/2026', amount: '-1,00', fitId: 'ZZZ' },
      { postedOn: '10/08/2026', amount: '-2,00', fitId: 'AAA' },
    ];
    const merged = mergeLedger([build(rows, '00000000001_01012024_31122024.ofx')]);
    expect(merged.map((t) => t.id)).toEqual(['00000000001:AAA', '00000000001:ZZZ']);
  });
});
