import { sum, type Cents } from '../core/money.ts';
import type { Day } from '../core/dates.ts';
import type { Ledger } from './load.ts';
import type { Transaction } from './ledger.ts';

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
  /** The batch began before the export did, so part of it cannot be itemised. */
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

function cardNumberOf(settlement: Transaction): string | null {
  return CARD_IN_LABEL.exec(settlement.label.trim())?.[1] ?? null;
}

export function reconcileSettlements(ledger: Ledger): ReconciliationReport {
  const exportEnd = ledger.sources
    .map((s) => s.statement.to)
    .reduce((a, b) => (a > b ? a : b), '' as Day);

  // What the account was charged, per card and settlement date.
  const charges = new Map<string, Cents>();
  for (const t of ledger.transactions) {
    if (t.kind !== 'settlement') continue;
    const card = cardNumberOf(t);
    if (card === null) continue;
    const key = `${card}|${t.occurredOn}`;
    charges.set(key, (charges.get(key) ?? 0) + t.amount);
  }

  // What the cards themselves say, grouped by the date they settle.
  const batches = new Map<string, Transaction[]>();
  for (const t of ledger.transactions) {
    if (t.source.kind !== 'card') continue;
    const card = t.source.cardNumber;
    if (card === undefined) continue;
    const key = `${card}|${t.settlesOn}`;
    let batch = batches.get(key);
    if (batch === undefined) batches.set(key, (batch = []));
    batch.push(t);
  }

  // Only a card's *earliest* batch can be clipped by the start of the export
  // window: every later batch is bounded by two settlement dates inside it.
  const earliestPerCard = new Map<string, Day>();
  for (const key of batches.keys()) {
    const [card = '', settlesOn = ''] = key.split('|');
    const current = earliestPerCard.get(card);
    if (current === undefined || settlesOn < current) earliestPerCard.set(card, settlesOn as Day);
  }

  const checks: SettlementCheck[] = [];
  for (const [key, rows] of batches) {
    const [cardNumber = '', settlesOnRaw = ''] = key.split('|');
    const settlesOn = settlesOnRaw as Day;
    const itemised = sum(rows.map((r) => r.amount));
    const charged = charges.get(key) ?? null;
    const difference = charged === null ? 0 : charged - itemised;

    let status: SettlementStatus;
    if (charged === null) {
      status = settlesOn > exportEnd ? 'in-flight' : 'mismatch';
    } else if (difference === 0) {
      status = 'reconciled';
    } else if (earliestPerCard.get(cardNumber) === settlesOn) {
      status = 'window-edge';
    } else {
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
    const card = loaded.source.cardNumber ?? '';
    const unsettled = sum(
      inFlight.filter((c) => c.cardNumber === card).map((c) => c.itemised),
    );
    if (unsettled !== loaded.statement.balance) {
      balanceDisagreements.push(
        `card ${card}: unsettled rows total ${unsettled} cents but the statement ` +
          `reports a balance of ${loaded.statement.balance} cents`,
      );
    }
  }

  const accountBalance = sum(
    ledger.sources.filter((s) => s.source.kind === 'account').map((s) => s.statement.balance),
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
