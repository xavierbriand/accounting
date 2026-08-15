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
  const accountEnd = ledger.sources
    .filter((s) => s.source.kind === 'account')
    .map((s) => s.to)
    .reduce((a, b) => (a > b ? a : b), '' as Day);

  const cardExportStart = new Map<string, Day>();
  for (const s of ledger.sources) {
    if (s.source.kind !== 'card') continue;
    cardExportStart.set(s.source.cardNumber, s.from);
  }

  // What the account was charged, per card and settlement date.
  const charges = new Map<string, Cents>();
  for (const t of ledger.transactions) {
    if (t.kind !== 'settlement') continue;
    // The sub-category already proved this is a settlement; a label that does
    // not name a card makes it unattributable, not absent.
    const key = `${cardNumberOf(t)}|${t.occurredOn}`;
    charges.set(key, (charges.get(key) ?? 0) + t.amount);
  }

  // What the cards themselves say, grouped by the date they settle.
  const batches = new Map<string, Transaction[]>();
  for (const t of ledger.transactions) {
    if (t.source.kind !== 'card') continue;
    const key = `${t.source.cardNumber}|${t.settlesOn}`;
    let batch = batches.get(key);
    if (batch === undefined) batches.set(key, (batch = []));
    batch.push(t);
  }

  // Both sides, not just the card side. A charge the account paid for which no
  // card rows exist is the most dangerous case available here: iterating only
  // the batches would emit no check at all for it, and a ledger missing an
  // entire card export would then be reported as perfectly reconciled.
  const keys = new Set([...batches.keys(), ...charges.keys()]);

  const checks: SettlementCheck[] = [];
  for (const key of keys) {
    const [cardNumber = '', settlesOnRaw = ''] = key.split('|');
    const settlesOn = settlesOnRaw as Day;
    const rows = batches.get(key) ?? [];
    const itemised = sum(rows.map((r) => r.amount));
    const charged = charges.get(key) ?? null;
    const difference = charged === null ? 0 : charged - itemised;
    const exportStart = cardExportStart.get(cardNumber);

    let status: SettlementStatus;
    if (charged === null) {
      // Nothing charged yet. Either it is genuinely still pending, or the
      // account's export stops short of a settlement that has already happened.
      status = settlesOn > accountEnd ? 'in-flight' : 'mismatch';
    } else if (difference === 0) {
      status = 'reconciled';
    } else if (exportStart !== undefined && clippedByWindow(settlesOn, exportStart)) {
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
