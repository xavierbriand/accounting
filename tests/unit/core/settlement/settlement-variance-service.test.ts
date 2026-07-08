import { describe, it, expect } from 'vitest';
import { explainSettlementVariance } from '@core/settlement/settlement-variance-service.js';
import { Money } from '@core/shared/money.js';
import type { LineItem } from '@core/transfer/line-item.js';
import type { SafeTransferCalculation } from '@core/transfer/safe-transfer-calculation.js';
import type { ContributionsInWindow } from '@core/ports/contribution-query.js';

function eur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function usd(cents: number): Money {
  return Money.fromCents(cents, 'USD').value;
}

function item(overrides: Partial<LineItem> = {}): LineItem {
  return {
    kind: 'forecast',
    date: '2026-07-01',
    category: 'Rent',
    description: 'Rent',
    gross: eur(100000),
    perPartnerSplit: new Map([
      ['Alex', eur(50000)],
      ['Sam', eur(50000)],
    ]),
    ...overrides,
  };
}

function calc(lineItems: LineItem[], perPartner?: Map<string, Money>): SafeTransferCalculation {
  let totalRequired = eur(0);
  for (const i of lineItems) totalRequired = totalRequired.add(i.gross).value;
  const derivedPerPartner = perPartner ?? (() => {
    const m = new Map<string, Money>();
    for (const i of lineItems) {
      for (const [partner, share] of i.perPartnerSplit) {
        m.set(partner, (m.get(partner) ?? eur(0)).add(share).value);
      }
    }
    return m;
  })();
  return { totalRequired, perPartner: derivedPerPartner, lineItems };
}

const noContributions: ContributionsInWindow = {
  attributed: [],
  unattributed: eur(0),
  totalActual: eur(0),
};

describe('explainSettlementVariance — presence classification', () => {
  it('classifies a line present in both months as "both" with delta = this - last', () => {
    // fails if presence classification or the this-minus-last arithmetic for matched lines is wrong
    const thisMonth = calc([item({ description: 'Rent', gross: eur(120000), perPartnerSplit: new Map([['Alex', eur(60000)], ['Sam', eur(60000)]]) })]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    expect(result.value.lines).toHaveLength(1);
    expect(result.value.lines[0].presence).toBe('both');
    expect(result.value.lines[0].totalDelta.amount).toBe(20000);
  });

  it('classifies a line only in this month as "this-only" with delta = +this amount', () => {
    // fails if a newly-appeared line item is misclassified or its delta sign is wrong
    const thisMonth = calc([item({ description: 'Insurance', category: 'Insurance', gross: eur(20000) })]);
    const lastMonth = calc([]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    expect(result.value.lines).toHaveLength(1);
    expect(result.value.lines[0].presence).toBe('this-only');
    expect(result.value.lines[0].totalDelta.amount).toBe(20000);
  });

  it('classifies a line only in last month as "last-only" with delta = -(last amount)', () => {
    // fails if a disappeared line item is misclassified or its delta sign is wrong (must be negative)
    const thisMonth = calc([]);
    const lastMonth = calc([item({ description: 'One-off top-up', kind: 'buffer-topup', category: 'Vacation', gross: eur(120000) })]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    expect(result.value.lines).toHaveLength(1);
    expect(result.value.lines[0].presence).toBe('last-only');
    expect(result.value.lines[0].totalDelta.amount).toBe(-120000);
  });

  it('a renamed rule reads as one line disappearing and a new one appearing (exact-match keys only)', () => {
    // fails if the diff fuzzy-matches similarly-named line items instead of treating them as distinct keys
    const thisMonth = calc([item({ description: 'Rent (new)', gross: eur(100000) })]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    expect(result.value.lines).toHaveLength(2);
    const presences = result.value.lines.map(l => l.presence).sort();
    expect(presences).toEqual(['last-only', 'this-only']);
  });
});

describe('explainSettlementVariance — report totals', () => {
  it('report totalDelta equals thisMonth.totalRequired minus lastMonth.totalRequired', () => {
    // fails if report-level totalDelta drifts from the calculator's own totals (invariant 1)
    const thisMonth = calc([
      item({ description: 'Rent', gross: eur(100000) }),
      item({ description: 'Insurance', category: 'Insurance', gross: eur(20000) }),
    ]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(90000) })]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalDelta.amount).toBe(thisMonth.totalRequired.amount - lastMonth.totalRequired.amount);
  });

  it('sorts lines by the LineItemKey total order (kind, category, description)', () => {
    // fails if line output order is not deterministic / not the documented total order
    const thisMonth = calc([
      item({ description: 'Rent', category: 'Rent', gross: eur(100000) }),
      item({ description: 'Vacation top-up', category: 'Vacation', kind: 'buffer-topup', gross: eur(50000) }),
      item({ description: 'Insurance', category: 'Insurance', gross: eur(20000) }),
    ]);
    const lastMonth = calc([]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    const categories = result.value.lines.map(l => l.key.category);
    expect(categories).toEqual(['Vacation', 'Insurance', 'Rent']);
  });

  it('returns Result.fail when the same key appears twice within one month\'s window', () => {
    // fails if duplicate keys within a single month are silently merged instead of rejected (invariant 4's premise)
    const thisMonth = calc([
      item({ description: 'Rent', gross: eur(100000) }),
      item({ description: 'Rent', gross: eur(50000) }),
    ]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(90000) })]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isFailure).toBe(true);
  });

  it('returns Result.fail when this month and last month use different currencies', () => {
    // fails if cross-currency SafeTransferCalculations are silently diffed instead of rejected
    const thisMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const lastMonth: SafeTransferCalculation = {
      totalRequired: usd(90000),
      perPartner: new Map([['Alex', usd(45000)], ['Sam', usd(45000)]]),
      lineItems: [item({ description: 'Rent', gross: usd(90000) })],
    };
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isFailure).toBe(true);
  });
});
