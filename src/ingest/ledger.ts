import type { Cents } from '../core/money.ts';
import type { Day } from '../core/dates.ts';
import type { JoinedRow } from './join.ts';
import type { Source } from './sources.ts';

/**
 * One account or card, as assembled from however many exports describe it.
 *
 * Deliberately not "one statement". Dropping two overlapping exports of the same
 * account into the folder must not change any total, and a per-file view breaks
 * that in a way transaction de-duplication cannot fix: balances are not rows, so
 * summing one per file counts the same cash twice.
 */
export interface LoadedSource {
  readonly source: Source;
  readonly currency: string;
  /** Widest window across every export of this source. */
  readonly from: Day;
  readonly to: Day;
  /**
   * The most recently reported closing balance for this source.
   *
   * A balance is a fact about an instant, so overlapping exports do not combine:
   * the newest one simply supersedes the others.
   */
  readonly balance: Cents;
  readonly balanceAsOf: Day;
  /** How many rows of the merged ledger came from this source. */
  readonly count: number;
  /** Every file this source was assembled from, for error messages. */
  readonly files: readonly string[];
}

/** Everything the ingest produces before it checks itself. */
export interface LedgerData {
  readonly transactions: readonly Transaction[];
  readonly sources: readonly LoadedSource[];
}

/**
 * One transaction, after the OFX and CSV views of it have been reconciled.
 *
 * `kind` is the structural classification, and it is the load-bearing part of
 * the ingest. Getting it wrong does not crash anything; it produces a page of
 * confident, wrong numbers.
 */
export type TransactionKind =
  /** A deferred card's monthly charge to the account. Never spending — the
   *  itemised card rows already are. Counting both doubles a third of the year. */
  | 'settlement'
  /** Money arriving from another account of the household's own. The funding side. */
  | 'transfer-in'
  /** Money leaving to another account of the household's own. */
  | 'transfer-out'
  /** Everything else: what was actually spent, and what was refunded against it. */
  | 'movement';

export interface Transaction {
  /** Unique across the whole ledger: source id plus the bank's row id. */
  readonly id: string;
  readonly source: Source;
  readonly kind: TransactionKind;
  /** When it happened. A card purchase is dated here, not when it settles. */
  readonly occurredOn: Day;
  /** When the current account is actually charged. Differs from `occurredOn`
   *  on a deferred card by up to a month, which is the in-flight window. */
  readonly settlesOn: Day;
  /** Negative leaves the household, positive arrives. */
  readonly amount: Cents;
  readonly label: string;
  readonly description: string;
  readonly notes: string;
  readonly operationType: string;
  readonly category: string;
  readonly subCategory: string;
}

/**
 * The bank's own marker for a deferred card's monthly charge.
 *
 * Note it lives under a *parent* category that also contains every internal
 * transfer — so filtering on the parent, which is the obvious thing to do and
 * what an earlier draft of the spec implied, deletes the entire funding side of
 * the household along with the settlements. The sub-category is the filter.
 */
export const SETTLEMENT_SUBCATEGORY = 'Transaction differee';
export const INTERNAL_TRANSFER_SUBCATEGORY = 'Virement interne';

/** The bank's marker for rows it could not place. These need a human decision. */
export const UNCATEGORISED_PREFIX = 'A categoriser';

export function isUncategorised(t: Transaction): boolean {
  return t.category.startsWith(UNCATEGORISED_PREFIX);
}

function classify(row: JoinedRow): TransactionKind {
  const sub = row.csv.subCategory;
  if (sub === SETTLEMENT_SUBCATEGORY) return 'settlement';
  if (sub === INTERNAL_TRANSFER_SUBCATEGORY) {
    return row.csv.amount >= 0 ? 'transfer-in' : 'transfer-out';
  }
  return 'movement';
}

export function toTransactions(rows: readonly JoinedRow[], source: Source): Transaction[] {
  return rows.map((row) => ({
    id: `${source.id}:${row.ofx.fitId}`,
    source,
    kind: classify(row),
    occurredOn: row.csv.postedOn,
    settlesOn: row.csv.valueOn,
    amount: row.csv.amount,
    label: row.csv.label,
    description: row.csv.description,
    notes: row.csv.notes,
    operationType: row.csv.operationType,
    category: row.csv.category,
    subCategory: row.csv.subCategory,
  }));
}

export class DuplicateTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateTransactionError';
  }
}

/**
 * Merge sources into one ledger, keyed on `id`.
 *
 * Re-importing an overlapping export must change no total, which is what the key
 * is for. A collision between *different* sources is the failure this guards —
 * it means the source ids are not distinguishing what they should.
 */
export function mergeLedger(batches: readonly (readonly Transaction[])[]): Transaction[] {
  const byId = new Map<string, Transaction>();

  for (const batch of batches) {
    for (const t of batch) {
      const existing = byId.get(t.id);
      if (existing === undefined) {
        byId.set(t.id, t);
        continue;
      }
      const identical =
        existing.amount === t.amount &&
        existing.occurredOn === t.occurredOn &&
        existing.source.id === t.source.id;
      if (!identical) {
        throw new DuplicateTransactionError(
          `Two different transactions share the id "${t.id}": ` +
            `${existing.occurredOn} vs ${t.occurredOn}. The bank's row ids are only ` +
            `unique within one exported statement, so this means two statements are ` +
            `being treated as the same source.`,
        );
      }
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.occurredOn === b.occurredOn ? a.id.localeCompare(b.id) : a.occurredOn.localeCompare(b.occurredOn),
  );
}
