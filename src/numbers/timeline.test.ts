import { describe, expect, it } from 'vitest';
import { monthlySpendTimeline } from './timeline.ts';
import { ledgerOf, tx } from './__fixtures__/build.ts';

describe('monthlySpendTimeline', () => {
  it('returns nothing for a ledger with no movement transactions', () => {
    const ledger = ledgerOf([tx({ kind: 'transfer-in', occurredOn: '2026-01-05', amount: 300000 })]);
    expect(monthlySpendTimeline(ledger)).toEqual([]);
  });

  it('nets refunds against spending, floored at zero, per month', () => {
    const ledger = ledgerOf([
      tx({ id: 'a', occurredOn: '2026-01-05', amount: -10000 }),
      tx({ id: 'b', occurredOn: '2026-01-20', amount: -5000 }),
      // A month where a refund outweighs the spend: must read as 0, not negative.
      tx({ id: 'c', occurredOn: '2026-02-05', amount: -2000 }),
      tx({ id: 'd', occurredOn: '2026-02-06', amount: 3000 }),
    ]);
    expect(monthlySpendTimeline(ledger)).toEqual([
      { month: '2026-01', total: 15000 },
      { month: '2026-02', total: 0 },
    ]);
  });

  it('fills a month with no movements at all as a zero, not a gap', () => {
    const ledger = ledgerOf([
      tx({ id: 'a', occurredOn: '2026-01-05', amount: -10000 }),
      // February: nothing.
      tx({ id: 'c', occurredOn: '2026-03-05', amount: -5000 }),
    ]);
    expect(monthlySpendTimeline(ledger)).toEqual([
      { month: '2026-01', total: 10000 },
      { month: '2026-02', total: 0 },
      { month: '2026-03', total: 5000 },
    ]);
  });

  it('ignores non-movement transactions entirely', () => {
    const ledger = ledgerOf([
      tx({ id: 'm', occurredOn: '2026-01-05', amount: -10000 }),
      tx({ kind: 'transfer-in', id: 't', occurredOn: '2026-01-06', amount: 500000 }),
      tx({ kind: 'settlement', id: 's', occurredOn: '2026-01-07', amount: -3000 }),
    ]);
    expect(monthlySpendTimeline(ledger)).toEqual([{ month: '2026-01', total: 10000 }]);
  });

  it('sorts ascending regardless of input order', () => {
    const ledger = ledgerOf([
      tx({ id: 'b', occurredOn: '2026-03-05', amount: -1000 }),
      tx({ id: 'a', occurredOn: '2026-01-05', amount: -1000 }),
    ]);
    expect(monthlySpendTimeline(ledger).map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});
