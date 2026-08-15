import { sum, type Cents } from '../core/money.ts';
import { addMonths, monthOf, type Day } from '../core/dates.ts';
import type { LedgerData, Transaction } from './ledger.ts';

/**
 * Does the itemised card spending add up to what the account was charged?
 *
 * This is the one check worth running on every load. Deferred card spending
 * appears twice — once itemised on the card statement, once as a lump charge on
 * the current account — and every mistake available here produces a wrong total
 * rather than an error: count both and the year inflates by roughly a third,
 * count neither and it deflates, mis-assign a card and two people's spending
 * swap.
 *
 * The equality is exact to the cent, which is only possible because money is
 * held in integer cents throughout.
 */

export type SettlementStatus =
  /** Itemised rows equal the charge, to the cent. */
  | 'reconciled'
  /** Spent, not yet charged to the account. Real money the buffer must cover. */
  | 'in-flight'
  /** The batch began before the export did, so part or all of it cannot be itemised. */
  | 'window-edge'
  /** Neither of the above. Something is genuinely wrong. */
  | 'mismatch';

export interface SettlementCheck {
  readonly cardNumber: string;
  readonly settlesOn: Day;
  /** What the account was charged, if it has been charged yet. */
  readonly charged: Cents | null;
  /** What the card's own rows add up to for that settlement. */
  readonly itemised: Cents;
  readonly difference: Cents;
  readonly status: SettlementStatus;
  readonly rowCount: number;
}

export interface ReconciliationReport {
  readonly checks: readonly SettlementCheck[];
  readonly reconciled: number;
  readonly inFlight: number;
  readonly windowEdge: number;
  readonly mismatched: number;
  /** Total spent on cards but not yet charged to the account. Negative. */
  readonly inFlightTotal: Cents;
  /** Cash in the current account, as the bank reports it. */
  readonly accountBalance: Cents;
  /**
   * What the account is really worth once the cards settle.
   *
   * This is the number the bank never shows in one place, and the reason a
   * balance that looks comfortable can already be spent.
   */
  readonly settledPosition: Cents;
  /** Set when a card's own reported balance disagrees with its unsettled rows. */
  readonly balanceDisagreements: readonly string[];
}

/** `DEBIT DIFFERE N° ...1111` → `1111`. */
const CARD_IN_LABEL = /(\d{4})\s*$/;

/**
 * Stands in for a settlement whose label does not name a card.
 *
 * Never dropped, and never matched by a real card, so such a charge always
 * surfaces as a mismatch. Discarding it instead — which is what an earlier
 * version did — reproduces the worst failure this module has: an account charge
 * that no check ever covers, inside a report that then announces zero
 * mismatches.
 */
export const UNIDENTIFIED_CARD = 'unidentified';

function cardNumberOf(settlement: Transaction): string {
  return CARD_IN_LABEL.exec(settlement.label.trim())?.[1] ?? UNIDENTIFIED_CARD;
}

/**
 * A settlement batch covers roughly the month running up to one month before it
 * is charged, so its earliest purchase sits about two months before the charge.
 * If the export begins after that, part of the batch is simply not in the files
 * and the shortfall is the window's doing rather than an error.
 *
 * Compared at month granularity, which is right for an export that starts on a
 * month boundary. An export starting mid-month can clip a batch this test calls
 * complete — that direction is deliberate: it reports a loud mismatch rather
 * than quietly excusing a real one.
 */
function clippedByWindow(settlesOn: Day, cardExportStart: Day): boolean {
  return addMonths(monthOf(settlesOn), -2) < monthOf(cardExportStart);
}

export function reconcileSettlements(ledger: LedgerData): ReconciliationReport {
  // The account is what carries a charge, so the account's export is what
  // decides whether a settlement has had the chance to appear yet.
  //
  // `balanceAsOf`, not `to`. `to` is the range that was *requested* — ask the
  // bank for a full calendar year in June and it reports a December end date,
  // which would place every pending settlement inside a window the data does
  // not actually cover, flipping the whole in-flight total to zero.
  // `balanceAsOf` is when the bank says the figures are current.
  //
  // `null` rather than an empty-string seed: with no account export at all there
  // is no date to compare against, and seeding with `''` made every settlement
  // in history look like it was still to come.
  const hasAccount = ledger.sources.some((s) => s.source.kind === 'account');

  // How far the household's data reaches, taken across every export rather than
  // the account's alone. If the cards are current to December while the account
  // export stops in June, a July settlement is not "still to come" — it is a
  // charge the account file simply does not reach, and saying "in flight" would
  // book money as owed that was in fact paid months ago.
  const dataCurrentTo = ledger.sources
    .map((s) => s.balanceAsOf)
    .reduce<Day | null>((a, b) => (a === null || b > a ? b : a), null);

  const cardExportStart = new Map<string, Day>();
  for (const s of ledger.sources) {
    if (s.source.kind !== 'card') continue;
    cardExportStart.set(s.source.cardNumber, s.from);
  }

  // One settlement: a card, and the date it is charged. Both sides of the check
  // are filed under it.
  //
  // The parts are remembered alongside the key rather than parsed back out of
  // it. Splitting a composite key returns strings that then have to be cast
  // back into `Day`, which launders an unvalidated value into a branded type and
  // quietly undoes what the branding is for.
  interface Slot {
    readonly cardNumber: string;
    readonly settlesOn: Day;
  }
  const slots = new Map<string, Slot>();
  const slotKey = (cardNumber: string, settlesOn: Day): string => {
    const key = `${cardNumber}|${settlesOn}`;
    if (!slots.has(key)) slots.set(key, { cardNumber, settlesOn });
    return key;
  };

  // What the account was charged.
  //
  // Filed by *value* date, the same date the card rows use. The posting date can
  // differ, and keying the two sides on different dates would split one
  // reconciled settlement into an orphan charge and a phantom pending batch —
  // the same money reported wrong twice, in opposite directions.
  const charges = new Map<string, Cents>();
  for (const t of ledger.transactions) {
    // A settlement is something the *account* is charged. The same sub-category
    // appearing on a card export is not a second charge, and counting it on both
    // sides would let two errors cancel into a clean reconciliation.
    if (t.kind !== 'settlement' || t.source.kind !== 'account') continue;
    // The sub-category already proved this is a settlement; a label that does
    // not name a card makes it unattributable, not absent.
    const key = slotKey(cardNumberOf(t), t.settlesOn);
    charges.set(key, (charges.get(key) ?? 0) + t.amount);
  }

  // What the cards themselves say, grouped by the date they settle.
  const batches = new Map<string, Transaction[]>();
  for (const t of ledger.transactions) {
    if (t.source.kind !== 'card') continue;
    const key = slotKey(t.source.cardNumber, t.settlesOn);
    let batch = batches.get(key);
    if (batch === undefined) batches.set(key, (batch = []));
    batch.push(t);
  }

  // Every slot, not just the ones with card rows. A charge the account paid for
  // which no card rows exist is the most dangerous case available here:
  // iterating only the batches would emit no check at all for it, and a ledger
  // missing an entire card export would then be reported as perfectly
  // reconciled.
  const checks: SettlementCheck[] = [];
  for (const [key, { cardNumber, settlesOn }] of slots) {
    const rows = batches.get(key) ?? [];
    const itemised = sum(rows.map((r) => r.amount));
    const charged = charges.get(key) ?? null;
    const difference = charged === null ? 0 : charged - itemised;
    const exportStart = cardExportStart.get(cardNumber);

    let status: SettlementStatus;
    if (charged === null) {
      // Nothing charged. Only genuinely pending if the account's data does not
      // yet reach the settlement date; otherwise the charge should be here and
      // is not, which is an error however ordinary its cause.
      //
      // With no account export at all, nothing can be confirmed, so nothing is
      // forgiven.
      status =
        hasAccount && dataCurrentTo !== null && settlesOn > dataCurrentTo ? 'in-flight' : 'mismatch';
    } else if (difference === 0) {
      status = 'reconciled';
    } else if (
      exportStart !== undefined &&
      // Clipping can only ever *remove* rows, so it can only make the itemised
      // total smaller than the charge. A card whose rows come to more than the
      // account was charged — duplicated rows, or another card's landing in the
      // batch — is a real error that no window explains, and excusing it on the
      // date alone files the one thing worth catching as benign.
      difference < 0 &&
      clippedByWindow(settlesOn, exportStart)
    ) {
      status = 'window-edge';
    } else {
      // Includes the case where no export for this card was supplied at all,
      // which must never be silently forgiven.
      status = 'mismatch';
    }

    checks.push({ cardNumber, settlesOn, charged, itemised, difference, status, rowCount: rows.length });
  }

  checks.sort((a, b) =>
    a.settlesOn === b.settlesOn ? a.cardNumber.localeCompare(b.cardNumber) : a.settlesOn.localeCompare(b.settlesOn),
  );

  const inFlight = checks.filter((c) => c.status === 'in-flight');
  const inFlightTotal = sum(inFlight.map((c) => c.itemised));

  // Second opinion: each card statement reports its own unsettled balance. It
  // should equal that card's in-flight rows, computed a completely different
  // way. When two independent routes to the same number agree, the ingest is
  // very probably right.
  const balanceDisagreements: string[] = [];
  for (const loaded of ledger.sources) {
    if (loaded.source.kind !== 'card') continue;
    const card = loaded.source.cardNumber;
    const unsettled = sum(
      inFlight.filter((c) => c.cardNumber === card).map((c) => c.itemised),
    );
    if (unsettled !== loaded.balance) {
      balanceDisagreements.push(
        `card ${card}: unsettled rows total ${unsettled} cents but the statement ` +
          `reports a balance of ${loaded.balance} cents`,
      );
    }
  }

  // One entry per account, never one per file — see `consolidate` in load.ts.
  const accountBalance = sum(
    ledger.sources.filter((s) => s.source.kind === 'account').map((s) => s.balance),
  );

  return {
    checks,
    reconciled: checks.filter((c) => c.status === 'reconciled').length,
    inFlight: inFlight.length,
    windowEdge: checks.filter((c) => c.status === 'window-edge').length,
    mismatched: checks.filter((c) => c.status === 'mismatch').length,
    inFlightTotal,
    accountBalance,
    settledPosition: accountBalance + inFlightTotal,
    balanceDisagreements,
  };
}
