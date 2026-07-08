import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { ContributionQuery, ContributionsInWindow, PartnerContribution } from '@core/ports/contribution-query.js';

export interface ContributionAccountMapping {
  readonly account: string;
  // null: a known settlement account with no assigned partner yet — its net credit
  // still counts toward totalActual (invariant 8), driving the totals-only fallback.
  readonly partner: string | null;
}

interface SideRow {
  account: string;
  side: string;
  currency: string;
  total_cents: number;
}

export class SqliteContributionQuery implements ContributionQuery {
  constructor(
    private readonly db: Database.Database,
    private readonly accounts: readonly ContributionAccountMapping[],
  ) {}

  contributionsInWindow(currency: string, from: string, to: string): Result<ContributionsInWindow> {
    const zero = Money.fromCents(0, currency);
    if (zero.isFailure) return Result.fail(zero.error);

    if (this.accounts.length === 0) {
      return Result.ok({ attributed: [], unattributed: zero.value, totalActual: zero.value });
    }

    const placeholders = this.accounts.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT te.account, te.side, te.currency, SUM(te.amount_cents) AS total_cents
      FROM transaction_entries te
      JOIN transactions t ON t.id = te.transaction_id
      WHERE te.account IN (${placeholders})
        AND substr(t.occurred_at, 1, 10) >= ?
        AND substr(t.occurred_at, 1, 10) <= ?
      GROUP BY te.account, te.side, te.currency
    `);
    const rows = stmt.all(...this.accounts.map(a => a.account), from, to) as SideRow[];

    for (const row of rows) {
      if (row.currency !== currency) {
        return Result.fail(`${row.account}: currency mismatch — expected ${currency}, found ${row.currency}`);
      }
    }

    const netByAccount = new Map<string, number>();
    for (const row of rows) {
      const current = netByAccount.get(row.account) ?? 0;
      const signed = row.side === 'credit' ? row.total_cents : -row.total_cents;
      netByAccount.set(row.account, current + signed);
    }

    const partnerCents = new Map<string, number>();
    let unattributedCents = 0;
    let totalActualCents = 0;
    for (const mapping of this.accounts) {
      const net = netByAccount.get(mapping.account) ?? 0;
      totalActualCents += net;
      if (mapping.partner === null) {
        unattributedCents += net;
      } else {
        partnerCents.set(mapping.partner, (partnerCents.get(mapping.partner) ?? 0) + net);
      }
    }

    const attributed: PartnerContribution[] = [];
    for (const [partner, cents] of [...partnerCents.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const amountResult = Money.fromCents(cents, currency);
      if (amountResult.isFailure) return Result.fail(amountResult.error);
      attributed.push({ partner, amount: amountResult.value });
    }

    const unattributedResult = Money.fromCents(unattributedCents, currency);
    if (unattributedResult.isFailure) return Result.fail(unattributedResult.error);
    const totalActualResult = Money.fromCents(totalActualCents, currency);
    if (totalActualResult.isFailure) return Result.fail(totalActualResult.error);

    return Result.ok({
      attributed,
      unattributed: unattributedResult.value,
      totalActual: totalActualResult.value,
    });
  }
}
