import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { ContributionQuery, ContributionsInWindow, PartnerContribution } from '@core/ports/contribution-query.js';
import type { SettlementAccountMapping } from '@core/config/app-config.js';

interface SideRow {
  account: string;
  side: string;
  currency: string;
  total_cents: number;
}

export class SqliteContributionQuery implements ContributionQuery {
  constructor(
    private readonly db: Database.Database,
    private readonly accounts: readonly SettlementAccountMapping[],
  ) {}

  contributionsInWindow(currency: string, from: string, to: string): Result<ContributionsInWindow> {
    const zeroResult = Money.fromCents(0, currency);
    if (zeroResult.isFailure) return Result.fail(zeroResult.error);
    const zero = zeroResult.value;
    // currency is proven valid by zeroResult above, so every later Money.fromCents(_, currency)
    // call in this method is guaranteed to succeed — .value is safe without re-checking isFailure.
    const moneyOf = (cents: number): Money => Money.fromCents(cents, currency).value;

    if (this.accounts.length === 0) {
      return Result.ok({ attributed: [], totalActual: zero });
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
    let totalActualCents = 0;
    for (const mapping of this.accounts) {
      const net = netByAccount.get(mapping.account) ?? 0;
      totalActualCents += net;
      partnerCents.set(mapping.partner, (partnerCents.get(mapping.partner) ?? 0) + net);
    }

    const attributed: PartnerContribution[] = [...partnerCents.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([partner, cents]) => ({ partner, amount: moneyOf(cents) }));

    return Result.ok({
      attributed,
      totalActual: moneyOf(totalActualCents),
    });
  }
}
