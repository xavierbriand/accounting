import { describe, expect, it } from 'vitest';
import type { Day } from '../core/dates.ts';
import { parseCsv } from './csv.ts';
import { parseOfx } from './ofx.ts';
import { joinPositionally } from './join.ts';
import { mergeLedger, toTransactions, type LedgerData, type LoadedSource, type Transaction } from './ledger.ts';
import { sourceOf } from './sources.ts';
import { reconcileSettlements, UNIDENTIFIED_CARD } from './reconcile.ts';
import { csvFixture, ofxFixture, type FixtureRow, type OfxOptions } from './__fixtures__/build.ts';

function statementOf(rows: readonly FixtureRow[], filename: string, options: OfxOptions = {}) {
  const source = sourceOf(filename);
  const statement = parseOfx(ofxFixture(rows, options), filename);
  const joined = joinPositionally(statement, parseCsv(csvFixture(rows), filename), source.id);
  const transactions = toTransactions(joined, source);
  const loaded: LoadedSource = {
    source,
    from: statement.from,
    to: statement.to,
    balance: statement.balance,
    balanceAsOf: statement.balanceAsOf,
    count: transactions.length,
    files: [filename],
  };
  return { loaded, transactions };
}

function ledgerOf(
  parts: readonly { loaded: LoadedSource; transactions: Transaction[] }[],
): LedgerData {
  return {
    transactions: mergeLedger(
      parts.map((p) => ({ transactions: p.transactions, asOf: p.loaded.balanceAsOf })),
    ),
    sources: parts.map((p) => p.loaded),
  };
}

/** A card purchase: it happens on one date and is charged on another. */
const buy = (postedOn: string, settlesOn: string, amount: string): FixtureRow => ({
  postedOn,
  valueOn: settlesOn,
  amount,
  category: 'Alimentation',
  subCategory: 'Supermarche',
});

/** The lump the account is charged for a card's month. */
const charge = (postedOn: string, amount: string, card: string, valueOn?: string): FixtureRow => ({
  postedOn,
  ...(valueOn === undefined ? {} : { valueOn }),
  amount,
  label: `DEBIT DIFFERE N° ...${card}`,
  operationType: 'Carte bancaire',
  category: 'Transaction exclue',
  subCategory: 'Transaction differee',
});

const WINDOW: OfxOptions = { from: '20250101', to: '20260815' };

describe('reconcileSettlements', () => {
  it('reconciles a card’s purchases against the account’s charge, to the cent', () => {
    const card = statementOf([buy('05/07/2026', '04/08/2026', '-30,00'), buy('06/07/2026', '04/08/2026', '-12,34')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf([charge('04/08/2026', '-42,34', '1111')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.mismatched).toBe(0);
    expect(report.reconciled).toBe(1);
    expect(report.checks[0]?.difference).toBe(0);
  });

  it('catches a charge that does not match the purchases behind it', () => {
    const card = statementOf([buy('05/07/2026', '04/08/2026', '-30,00'), buy('06/06/2026', '04/07/2026', '-10,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    // The August charge is a cent off. Nothing crashes; only this check notices.
    const account = statementOf([charge('04/07/2026', '-10,00', '1111'), charge('04/08/2026', '-30,01', '1111')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.mismatched).toBe(1);
    expect(report.checks.find((c) => c.status === 'mismatch')?.difference).toBe(-1);
  });

  it('reports spending not yet charged as in-flight, not as an error', () => {
    const card = statementOf([buy('11/08/2026', '04/09/2026', '-7,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '-7.00' });
    const account = statementOf([{ postedOn: '01/08/2026', amount: '-20,00' }],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.inFlight).toBe(1);
    expect(report.mismatched).toBe(0);
    expect(report.inFlightTotal).toBe(-700);
  });

  it('shows what the account is worth once the cards settle', () => {
    // The number the bank never puts in one place: a balance that looks
    // comfortable while the cards behind it are already spent.
    const card = statementOf([buy('11/08/2026', '04/09/2026', '-500,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '-500.00' });
    const account = statementOf([{ postedOn: '01/08/2026', amount: '-20,00' }],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+300.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.accountBalance).toBe(30000);
    expect(report.settledPosition).toBe(30000 - 50000);
    expect(report.settledPosition).toBeLessThan(0);
  });

  it('never lets a charge pass unchecked just because no card rows match it', () => {
    // Iterating only the card side would emit no check at all here, and a
    // ledger missing an entire card export would report as fully reconciled.
    const card = statementOf([buy('15/02/2025', '04/03/2025', '-50,00')],
      'carte_3333_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf([charge('04/01/2025', '-180,00', '3333'), charge('04/03/2025', '-50,00', '3333')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    const orphan = report.checks.find((c) => c.settlesOn === '2025-01-04');
    expect(orphan).toBeDefined();
    expect(orphan?.rowCount).toBe(0);
    // Its purchases predate the export entirely, so the window explains it.
    expect(orphan?.status).toBe('window-edge');
  });

  it('refuses to call anything in-flight when there is no account export', () => {
    // Forget the current account and every settlement in history looks like it
    // has simply not been charged yet — a clean report over a ledger missing
    // the side that would contradict it.
    const card = statementOf([buy('15/03/2025', '04/04/2025', '-500,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });

    const report = reconcileSettlements(ledgerOf([card]));
    expect(report.inFlight).toBe(0);
    expect(report.mismatched).toBe(1);
  });

  it('refuses in-flight for a genuinely future settlement too, with no account export', () => {
    // The test above uses a settlement date safely in the past, which stays a
    // mismatch under "hasAccount" inverted to include card sources — the date
    // comparison alone happens to still say no. This one settles after the
    // card's own data is current, which a real account WOULD have called
    // in-flight; with no account at all, it has to stay a mismatch regardless.
    const card = statementOf([buy('11/08/2026', '04/09/2026', '-7,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '-7.00' });

    const report = reconcileSettlements(ledgerOf([card]));
    expect(report.inFlight).toBe(0);
    expect(report.mismatched).toBe(1);
  });

  it('judges pending against when the data is current, not the range requested', () => {
    // Asking the bank for a whole calendar year in August returns a December
    // end date over data that stops today. Trusting that end date would place
    // every pending settlement inside a covered window and zero the in-flight
    // total — the one figure the page exists to show.
    const card = statementOf([buy('11/08/2026', '04/09/2026', '-500,00')],
      'carte_1111_01012024_31122024.ofx', { from: '20260101', to: '20261231', balance: '-500.00' });
    const account = statementOf([{ postedOn: '01/08/2026', amount: '-20,00' }],
      '00000000001_01012024_31122024.ofx', { from: '20260101', to: '20261231', balance: '+300.00' });

    // The requested range runs to 31 December; the data is current to 15 August.
    const asOf = '2026-08-15' as Day;
    const ledger = ledgerOf([
      { ...account, loaded: { ...account.loaded, balanceAsOf: asOf } },
      { ...card, loaded: { ...card.loaded, balanceAsOf: asOf } },
    ]);

    const report = reconcileSettlements(ledger);
    expect(report.inFlight).toBe(1);
    expect(report.inFlightTotal).toBe(-50000);
    expect(report.settledPosition).toBe(30000 - 50000);
  });

  it('calls an uncharged settlement a mismatch once the account data passes it', () => {
    // The account export stops in June; the card runs to December. A batch that
    // settled in July was certainly charged — the account file just does not
    // reach it. That is missing data, not money in flight.
    const card = statementOf([buy('20/06/2026', '04/07/2026', '-33,00')],
      'carte_1111_01012024_31122024.ofx', { from: '20260101', to: '20261231', balance: '+0.00' });
    const account = statementOf([{ postedOn: '01/06/2026', amount: '-20,00' }],
      '00000000001_01012024_31122024.ofx', { from: '20260101', to: '20260630', balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.inFlight).toBe(0);
    expect(report.mismatched).toBe(1);
  });

  it('does not excuse a batch whose rows exceed the charge', () => {
    // Clipping can only remove rows, so it can only make the itemised total
    // smaller. Rows exceeding the charge means duplicates, or another card's
    // rows in this batch — the very thing worth catching.
    const card = statementOf([buy('15/01/2025', '04/02/2025', '-200,00')],
      'carte_3333_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf([charge('04/02/2025', '-100,00', '3333')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.windowEdge).toBe(0);
    expect(report.mismatched).toBe(1);
  });

  it('matches a charge to its batch by value date, not posting date', () => {
    // A settlement posted on the 4th but valued on the 5th must still meet the
    // card rows it pays for. Keying the two sides on different dates reports the
    // same money twice — an orphan charge and a phantom pending batch.
    const card = statementOf([buy('05/07/2026', '05/08/2026', '-30,00'), buy('06/07/2026', '05/08/2026', '-12,34')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf([charge('04/08/2026', '-42,34', '1111', '05/08/2026')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.reconciled).toBe(1);
    expect(report.mismatched).toBe(0);
  });

  it('does not let a settlement row on a card export cancel a real charge', () => {
    // Counted on both sides, the two errors annihilate and the check built to
    // catch double-counting certifies the double-count as correct.
    const card = statementOf(
      [
        buy('01/07/2026', '04/08/2026', '-42,34'),
        { ...charge('04/08/2026', '-42,34', '1111'), valueOn: '04/08/2026' },
      ],
      'carte_1111_01012024_31122024.ofx',
      { ...WINDOW, balance: '+0.00' },
    );
    const account = statementOf([charge('04/08/2026', '-42,34', '1111')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    // The card export's own settlement row is not a charge, so the batch is
    // over-itemised against the real charge and that shows up.
    expect(report.reconciled).toBe(0);
    expect(report.mismatched).toBe(1);
  });

  it('does not mistake a trailing date in the label for a card number', () => {
    const card = statementOf([buy('05/07/2026', '04/08/2026', '-180,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf(
      [{ ...charge('04/08/2026', '-180,00', '1111'), label: 'DEBIT DIFFERE CARTE 1111 ECHEANCE 04/08/2026' }],
      '00000000001_01012024_31122024.ofx',
      { ...WINDOW, balance: '+100.00' },
    );

    // Taking "2026" as the card would file the charge under a card that does
    // not exist. Saying "I cannot read this label" is the honest answer, and it
    // still surfaces as a mismatch rather than disappearing.
    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.checks.map((c) => c.cardNumber)).not.toContain('2026');
    expect(report.checks.map((c) => c.cardNumber)).toContain(UNIDENTIFIED_CARD);
    expect(report.mismatched).toBeGreaterThan(0);
  });

  it('does not treat non-whitespace before the digits as part of the ellipsis gap', () => {
    // The pattern allows whitespace, and only whitespace, between "..." and
    // the four digits — a label where something else sits in that gap must
    // not be read as naming a card at all.
    const account = statementOf(
      [{ ...charge('04/08/2026', '-180,00', '1111'), label: 'DEBIT DIFFERE N° ...XX1111' }],
      '00000000001_01012024_31122024.ofx',
      { ...WINDOW, balance: '+100.00' },
    );

    const report = reconcileSettlements(ledgerOf([account]));
    expect(report.checks[0]?.cardNumber).toBe(UNIDENTIFIED_CARD);
  });

  it('refuses a run of five digits rather than guessing the first four', () => {
    // The lookahead exists so a run longer than four digits is refused as
    // ambiguous, not silently truncated to its first four — the same
    // "guessing is what produced the wrong answer" reasoning CARD_IN_LABEL
    // is built on.
    const account = statementOf(
      [{ ...charge('04/08/2026', '-180,00', '1111'), label: 'DEBIT DIFFERE N° ...11111' }],
      '00000000001_01012024_31122024.ofx',
      { ...WINDOW, balance: '+100.00' },
    );

    const report = reconcileSettlements(ledgerOf([account]));
    expect(report.checks[0]?.cardNumber).toBe(UNIDENTIFIED_CARD);
  });

  it('surfaces a settlement whose label does not name a card', () => {
    // The sub-category already proved it is a settlement. Dropping it for want
    // of a parseable label would recreate the worst failure here: an account
    // charge no check covers, inside a report claiming zero mismatches.
    const account = statementOf(
      [{ ...charge('04/08/2026', '-180,00', '1111'), label: 'DEBIT DIFFERE' }],
      '00000000001_01012024_31122024.ofx',
      { ...WINDOW, balance: '+100.00' },
    );

    const report = reconcileSettlements(ledgerOf([account]));
    expect(report.checks).toHaveLength(1);
    expect(report.mismatched).toBe(1);
    expect(report.checks[0]?.cardNumber).toBe(UNIDENTIFIED_CARD);
    expect(report.checks[0]?.charged).toBe(-18000);
  });

  it('calls a charge a mismatch when no export for that card was supplied at all', () => {
    // The failure this protects against: exporting the account but forgetting a
    // card, and being told everything reconciles.
    const account = statementOf([charge('04/08/2026', '-180,00', '9999')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account]));
    expect(report.mismatched).toBe(1);
    expect(report.checks[0]?.itemised).toBe(0);
  });

  it('stops excusing batches once the window can no longer explain them', () => {
    // Pins the two-month reach from above. A batch settling two months after the
    // export begins is bounded by dates inside it, so a shortfall there is real.
    // Without this, the constant could be widened to three, six, twelve months
    // and every early mismatch in the export would be waved through unnoticed.
    const card = statementOf([buy('15/02/2025', '04/03/2025', '-100,00')],
      'carte_3333_01012024_31122024.ofx', { from: '20250101', to: '20260815', balance: '+0.00' });
    const account = statementOf([charge('04/03/2025', '-180,00', '3333')],
      '00000000001_01012024_31122024.ofx', { from: '20250101', to: '20260815', balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.windowEdge).toBe(0);
    expect(report.mismatched).toBe(1);
  });

  it('reports rather than excuses when an export starts mid-month', () => {
    // The comparison is at month granularity, so an export starting on the 15th
    // can clip a batch this test calls complete. That direction is deliberate —
    // a loud mismatch beats quietly forgiving a real one — and it is pinned here
    // so the trade-off cannot be reversed without a test noticing.
    const card = statementOf([buy('20/01/2025', '04/03/2025', '-100,00')],
      'carte_3333_01012024_31122024.ofx', { from: '20250115', to: '20260815', balance: '+0.00' });
    const account = statementOf([charge('04/03/2025', '-180,00', '3333')],
      '00000000001_01012024_31122024.ofx', { from: '20250115', to: '20260815', balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.mismatched).toBe(1);
    expect(report.windowEdge).toBe(0);
  });

  it('does not excuse a mismatch on a card that began inside the export window', () => {
    // A replacement card's first batch is bounded by dates inside the window, so
    // it is complete and a shortfall in it is a real error. Deciding this by
    // "is it the earliest batch" would hide exactly that.
    const card = statementOf([buy('06/12/2025', '05/01/2026', '-30,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf([charge('05/01/2026', '-45,00', '1111')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.mismatched).toBe(1);
    expect(report.windowEdge).toBe(0);
  });

  it('accepts a first batch clipped by the start of the export window', () => {
    // The earliest charge covers purchases made before the export began, so it
    // is legitimately larger than the rows available. Later batches are not.
    const card = statementOf([buy('15/01/2025', '04/02/2025', '-100,00'), buy('15/02/2025', '04/03/2025', '-50,00')],
      'carte_3333_01012024_31122024.ofx', { ...WINDOW, balance: '+0.00' });
    const account = statementOf([charge('04/02/2025', '-180,00', '3333'), charge('04/03/2025', '-50,00', '3333')],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.windowEdge).toBe(1);
    expect(report.mismatched).toBe(0);
    expect(report.reconciled).toBe(1);
  });

  it('checks the card’s own reported balance against its unsettled rows', () => {
    // Two independent routes to the same number. When the statement disagrees
    // with the arithmetic, one of them is wrong and it matters which.
    const card = statementOf([buy('11/08/2026', '04/09/2026', '-7,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '-99.00' });
    const account = statementOf([{ postedOn: '01/08/2026', amount: '-20,00' }],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    const report = reconcileSettlements(ledgerOf([account, card]));
    expect(report.balanceDisagreements).toHaveLength(1);
    expect(report.balanceDisagreements[0]).toContain('1111');
  });

  it('is silent when the two routes agree', () => {
    const card = statementOf([buy('11/08/2026', '04/09/2026', '-7,00')],
      'carte_1111_01012024_31122024.ofx', { ...WINDOW, balance: '-7.00' });
    const account = statementOf([{ postedOn: '01/08/2026', amount: '-20,00' }],
      '00000000001_01012024_31122024.ofx', { ...WINDOW, balance: '+100.00' });

    expect(reconcileSettlements(ledgerOf([account, card])).balanceDisagreements).toHaveLength(0);
  });
});
