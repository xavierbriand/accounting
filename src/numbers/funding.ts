import type { Cents } from '../core/money.ts';
import { addMonths, dayOfMonth, monthOf, type Month } from '../core/dates.ts';
import { peopleMatching, type Config, type Person } from '../config/load.ts';
import type { Ledger } from '../ingest/load.ts';
import type { Transaction } from '../ingest/ledger.ts';

/**
 * A contribution is credited to the month it funds, not the month it posts.
 *
 * A transfer sent in the last days of a month is that month's payment for
 * the month that follows; bucketing it by posting date would report a paid
 * month as missed. Only `transfer-in` transactions are considered —
 * `transfer-out` and `settlement` play no part in funding.
 */
export interface Contribution {
  readonly transaction: Transaction;
  readonly fundingMonth: Month;
  /** Every person whose declared labels catch this transfer's own label — 0, 1, or 2+. */
  readonly people: readonly Person[];
}

/**
 * Every inbound transfer, dated by the month it funds and credited to
 * whoever's transfer label catches it.
 *
 * `people` uses `peopleMatching()` rather than reimplementing the match: it
 * already returns every match, so 0 or 2+ people is representable without
 * new logic here, and the meaning of a `transfer_labels` entry can never
 * drift between config validation and this.
 *
 * Sorted by funding month, then by transaction id — every list under
 * `src/numbers/` commits to an order rather than leaving it to whatever a
 * `Map` happened to iterate in.
 */
export function attributeContributions(config: Config, ledger: Ledger): readonly Contribution[] {
  const contributions = ledger.transactions
    .filter((t) => t.kind === 'transfer-in')
    .map((transaction) => {
      const fundingMonth =
        dayOfMonth(transaction.occurredOn) >= config.fundingCutoffDay
          ? addMonths(monthOf(transaction.occurredOn), 1)
          : monthOf(transaction.occurredOn);
      return { transaction, fundingMonth, people: peopleMatching(config, transaction.label) };
    });

  return contributions.sort((a, b) =>
    a.fundingMonth === b.fundingMonth
      ? a.transaction.id.localeCompare(b.transaction.id)
      : a.fundingMonth.localeCompare(b.fundingMonth),
  );
}

export interface MonthlyContributions {
  readonly month: Month;
  readonly byPerson: ReadonlyMap<string, Cents>;
  /** Contributions matching nobody, or two people at once — never guessed at. */
  readonly unattributed: Cents;
  readonly total: Cents;
}

/**
 * `attributeContributions`, folded into the "named-sender vs unattributed"
 * figure section 01 of the page shows.
 *
 * A contribution matching more than one person is as unattributable as one
 * matching none: crediting it to either would move real money onto the
 * wrong person's total, so it joins the same unattributed band.
 */
export function contributionsByMonth(
  contributions: readonly Contribution[],
): readonly MonthlyContributions[] {
  const byMonth = new Map<Month, { byPerson: Map<string, Cents>; unattributed: Cents; total: Cents }>();

  for (const c of contributions) {
    let entry = byMonth.get(c.fundingMonth);
    if (entry === undefined) {
      entry = { byPerson: new Map(), unattributed: 0, total: 0 };
      byMonth.set(c.fundingMonth, entry);
    }
    entry.total += c.transaction.amount;
    if (c.people.length === 1) {
      const person = c.people[0]!;
      entry.byPerson.set(person.id, (entry.byPerson.get(person.id) ?? 0) + c.transaction.amount);
    } else {
      entry.unattributed += c.transaction.amount;
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entry]) => ({ month, ...entry }));
}
