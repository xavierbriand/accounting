import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { explainSettlementVariance } from '@core/settlement/settlement-variance-service.js';
import { Money } from '@core/shared/money.js';
import type { LineItem } from '@core/transfer/line-item.js';
import type { SafeTransferCalculation } from '@core/transfer/safe-transfer-calculation.js';
import type { ContributionsInWindow } from '@core/ports/contribution-query.js';
import type { VarianceLine } from '@core/settlement/variance-line.js';

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

describe('explainSettlementVariance — per-partner deltas across a split boundary', () => {
  it('diffs each month\'s own resolved allocation per partner, not one ratio applied to the net delta', () => {
    // Defect class: computing perPartnerDelta by applying THIS month's (or last month's) split ratio
    // to the net totalDelta, instead of diffing each month's own window-resolved allocation.
    // Gross is UNCHANGED (1000.00 both months) but the split moved 60/40 -> 50/50, so each
    // partner's line-delta must show movement even though totalDelta is zero.
    const thisMonth = calc([
      item({ description: 'Rent', gross: eur(100000), perPartnerSplit: new Map([['Alex', eur(50000)], ['Sam', eur(50000)]]) }),
    ]);
    const lastMonth = calc([
      item({ description: 'Rent', gross: eur(100000), perPartnerSplit: new Map([['Alex', eur(60000)], ['Sam', eur(40000)]]) }),
    ]);
    const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
    expect(result.isSuccess).toBe(true);
    const line = result.value.lines[0];
    expect(line.totalDelta.amount).toBe(0);
    expect(line.perPartnerDelta.get('Alex')!.amount).toBe(-10000);
    expect(line.perPartnerDelta.get('Sam')!.amount).toBe(10000);
    // sum(perPartnerDelta) must equal totalDelta for the line (invariant 3)
    expect(line.perPartnerDelta.get('Alex')!.amount + line.perPartnerDelta.get('Sam')!.amount).toBe(line.totalDelta.amount);
    // and report-level perPartnerDelta matches thisMonth.perPartner - lastMonth.perPartner (invariant 2)
    expect(result.value.perPartnerDelta.get('Alex')!.amount).toBe(thisMonth.perPartner.get('Alex')!.amount - lastMonth.perPartner.get('Alex')!.amount);
    expect(result.value.perPartnerDelta.get('Sam')!.amount).toBe(thisMonth.perPartner.get('Sam')!.amount - lastMonth.perPartner.get('Sam')!.amount);
  });
});

describe('explainSettlementVariance — follow-through assembly', () => {
  it('sets suggested from THIS month\'s calculation, not last month\'s own suggestion', () => {
    // fails if the baseline is last month's suggestion instead of this month's (P1-6 binding decision)
    const thisMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(80000) })]);
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: eur(48000) }, { partner: 'Sam', amount: eur(46000) }],
      totalActual: eur(94000),
    };
    const result = explainSettlementVariance(thisMonth, lastMonth, contributions);
    expect(result.isSuccess).toBe(true);
    expect(result.value.followThrough.totalSuggested.amount).toBe(thisMonth.totalRequired.amount);
    expect(result.value.followThrough.perPartner.get('Alex')!.suggested.amount).toBe(thisMonth.perPartner.get('Alex')!.amount);
  });

  it('shows each partner\'s actual vs suggested with exact deltas', () => {
    // fails if per-partner delta arithmetic (suggested - actual) is wrong or a partner row is missing
    const thisMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: eur(48000) }, { partner: 'Sam', amount: eur(46000) }],
      totalActual: eur(94000),
    };
    const result = explainSettlementVariance(thisMonth, lastMonth, contributions);
    expect(result.isSuccess).toBe(true);
    const ft = result.value.followThrough;
    expect(ft.perPartner.get('Alex')!.suggested.amount).toBe(50000);
    expect(ft.perPartner.get('Alex')!.actual.amount).toBe(48000);
    expect(ft.perPartner.get('Alex')!.delta.amount).toBe(2000);
    expect(ft.perPartner.get('Sam')!.suggested.amount).toBe(50000);
    expect(ft.perPartner.get('Sam')!.actual.amount).toBe(46000);
    expect(ft.perPartner.get('Sam')!.delta.amount).toBe(4000);
    expect(ft.totalSuggested.amount).toBe(100000);
    expect(ft.totalActual.amount).toBe(94000);
    expect(ft.totalDelta.amount).toBe(6000);
  });

  it('a roster partner who contributed nothing that month shows actual zero (not omitted)', () => {
    // fails if a partner absent from contributions.attributed is dropped from perPartner instead of defaulting to zero
    const thisMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: eur(94000) }],
      totalActual: eur(94000),
    };
    const result = explainSettlementVariance(thisMonth, lastMonth, contributions);
    expect(result.isSuccess).toBe(true);
    const ft = result.value.followThrough;
    expect(ft.perPartner.get('Sam')!.actual.amount).toBe(0);
    expect(ft.perPartner.get('Sam')!.suggested.amount).toBe(50000);
    expect(ft.perPartner.get('Sam')!.delta.amount).toBe(50000);
  });


  it('returns Result.fail when contributions currency differs from this month\'s currency', () => {
    // fails if cross-currency contributions are silently mixed into follow-through totals (invariant 9)
    const thisMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const lastMonth = calc([item({ description: 'Rent', gross: eur(100000) })]);
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: usd(50000) }],
      totalActual: usd(50000),
    };
    const result = explainSettlementVariance(thisMonth, lastMonth, contributions);
    expect(result.isFailure).toBe(true);
  });
});

// ─── Property tests ───────────────────────────────────────────────────────────
// Invariants 1-5 and 10 of the signed-off model note (docs/domain/model-notes/story-4.3.md).
// Each generated "line" is index-keyed (Cat{i}/Item{i}, alternating kind), guaranteeing
// unique keys within and across both months' windows — the property tests the diff
// arithmetic, not key-collision handling (covered by the dedicated duplicate-key unit test).

function buildGeneratedItem(
  kind: 'forecast' | 'buffer-topup',
  category: string,
  description: string,
  grossCents: number,
  aliceRatio: number,
): LineItem {
  const gross = eur(grossCents);
  const shares = gross.allocate([aliceRatio, 1 - aliceRatio]);
  if (shares.isFailure) throw new Error(shares.error);
  return {
    kind,
    date: '2026-07-01',
    category,
    description,
    gross,
    perPartnerSplit: new Map([
      ['Alex', shares.value[0]],
      ['Sam', shares.value[1]],
    ]),
  };
}

const presenceArb = fc.constantFrom<'both' | 'this-only' | 'last-only'>('both', 'this-only', 'last-only');
const centsArb = fc.integer({ min: 0, max: 500000 });
const ratioArb = fc.integer({ min: 0, max: 100 }).map(n => n / 100);
const generatedLineArb = fc.tuple(presenceArb, centsArb, centsArb, ratioArb, ratioArb);
const generatedLinesArb = fc.array(generatedLineArb, { minLength: 0, maxLength: 6 });

function buildMonths(
  generated: ReadonlyArray<readonly [
    'both' | 'this-only' | 'last-only',
    number,
    number,
    number,
    number,
  ]>,
): { thisMonth: SafeTransferCalculation; lastMonth: SafeTransferCalculation } {
  const thisItems: LineItem[] = [];
  const lastItems: LineItem[] = [];
  generated.forEach(([presence, thisCents, lastCents, thisRatio, lastRatio], i) => {
    const kind: 'forecast' | 'buffer-topup' = i % 2 === 0 ? 'forecast' : 'buffer-topup';
    const category = `Cat${i}`;
    const description = `Item${i}`;
    if (presence !== 'last-only') {
      thisItems.push(buildGeneratedItem(kind, category, description, thisCents, thisRatio));
    }
    if (presence !== 'this-only') {
      lastItems.push(buildGeneratedItem(kind, category, description, lastCents, lastRatio));
    }
  });
  return { thisMonth: calc(thisItems), lastMonth: calc(lastItems) };
}

function serializeLines(lines: readonly VarianceLine[]): Array<{ key: string; presence: string; totalDelta: number }> {
  return lines.map(l => ({ key: l.key.toString(), presence: l.presence, totalDelta: l.totalDelta.amount }));
}

// #208 item 2 (story-4.3b): serializes the FULL SettlementVariance report — lines,
// report-level perPartnerDelta, and followThrough (incl. its own perPartner map) —
// not just the lines array, so Invariant 10 covers every field a caller can observe.
function serializeFullReport(variance: {
  lines: readonly VarianceLine[];
  totalDelta: Money;
  perPartnerDelta: ReadonlyMap<string, Money>;
  followThrough: {
    perPartner: ReadonlyMap<string, { suggested: Money; actual: Money; delta: Money }>;
    totalSuggested: Money;
    totalActual: Money;
    totalDelta: Money;
  };
}): string {
  return JSON.stringify({
    lines: serializeLines(variance.lines),
    totalDelta: variance.totalDelta.amount,
    perPartnerDelta: [...variance.perPartnerDelta.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([p, m]) => [p, m.amount]),
    followThrough: {
      perPartner: [...variance.followThrough.perPartner.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([p, pf]) => [p, pf.suggested.amount, pf.actual.amount, pf.delta.amount]),
      totalSuggested: variance.followThrough.totalSuggested.amount,
      totalActual: variance.followThrough.totalActual.amount,
      totalDelta: variance.followThrough.totalDelta.amount,
    },
  });
}

describe('explainSettlementVariance — property tests', () => {
  it('Invariant 1: sum(lines.totalDelta) === thisMonth.totalRequired - lastMonth.totalRequired', () => {
    fc.assert(
      fc.property(generatedLinesArb, (generated) => {
        const { thisMonth, lastMonth } = buildMonths(generated);
        const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
        if (result.isFailure) return true;
        const sumLineDeltas = result.value.lines.reduce((acc, l) => acc + l.totalDelta.amount, 0);
        return sumLineDeltas === thisMonth.totalRequired.amount - lastMonth.totalRequired.amount;
      }),
      { numRuns: 100 },
    );
  });

  it('Invariant 2: sum(lines.perPartnerDelta[p]) === thisMonth.perPartner[p] - lastMonth.perPartner[p]', () => {
    fc.assert(
      fc.property(generatedLinesArb, (generated) => {
        const { thisMonth, lastMonth } = buildMonths(generated);
        const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
        if (result.isFailure) return true;
        return ['Alex', 'Sam'].every(partner => {
          const sumLineDeltas = result.value.lines.reduce(
            (acc, l) => acc + (l.perPartnerDelta.get(partner)?.amount ?? 0),
            0,
          );
          const expected = (thisMonth.perPartner.get(partner)?.amount ?? 0) - (lastMonth.perPartner.get(partner)?.amount ?? 0);
          return sumLineDeltas === expected;
        });
      }),
      { numRuns: 100 },
    );
  });

  it('Invariant 3: for each line, sum over partners of perPartnerDelta === totalDelta', () => {
    fc.assert(
      fc.property(generatedLinesArb, (generated) => {
        const { thisMonth, lastMonth } = buildMonths(generated);
        const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
        if (result.isFailure) return true;
        return result.value.lines.every(l => {
          const sum = [...l.perPartnerDelta.values()].reduce((acc, m) => acc + m.amount, 0);
          return sum === l.totalDelta.amount;
        });
      }),
      { numRuns: 100 },
    );
  });

  it('Invariant 4: line keys partition the union of both months\' line items (no key appears twice, none dropped)', () => {
    fc.assert(
      fc.property(generatedLinesArb, (generated) => {
        const { thisMonth, lastMonth } = buildMonths(generated);
        const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
        if (result.isFailure) return true;
        const keyStrs = result.value.lines.map(l => l.key.toString());
        const uniqueKeyStrs = new Set(keyStrs);
        return keyStrs.length === uniqueKeyStrs.size && keyStrs.length === generated.length;
      }),
      { numRuns: 100 },
    );
  });

  it('Invariant 5: presence is truthful — both/this-only/last-only imply the documented delta sign', () => {
    fc.assert(
      fc.property(generatedLinesArb, (generated) => {
        const { thisMonth, lastMonth } = buildMonths(generated);
        const result = explainSettlementVariance(thisMonth, lastMonth, noContributions);
        if (result.isFailure) return true;
        return generated.every(([presence, thisCents, lastCents], i) => {
          const line = result.value.lines.find(l => l.key.toString() === `${i % 2 === 0 ? 'forecast' : 'buffer-topup'}|Cat${i}|Item${i}`);
          if (!line) return false;
          if (line.presence !== presence) return false;
          if (presence === 'both') return line.totalDelta.amount === thisCents - lastCents;
          if (presence === 'this-only') return line.totalDelta.amount === thisCents;
          return line.totalDelta.amount === -lastCents;
        });
      }),
      { numRuns: 100 },
    );
  });

  it('Invariant 10: determinism — identical inputs produce a deep-equal FULL report (lines + perPartnerDelta + followThrough), stably ordered', () => {
    // #208 item 2: widened from lines-only to the full SettlementVariance — a followThrough
    // built off a non-trivial (non-empty) contributions fixture, so this also exercises
    // followThrough.perPartner's determinism, not just the lines array.
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: eur(12345) }, { partner: 'Sam', amount: eur(6789) }],
      totalActual: eur(19134),
    };
    fc.assert(
      fc.property(generatedLinesArb, (generated) => {
        const { thisMonth, lastMonth } = buildMonths(generated);
        const first = explainSettlementVariance(thisMonth, lastMonth, contributions);
        const second = explainSettlementVariance(thisMonth, lastMonth, contributions);
        if (first.isFailure || second.isFailure) return first.isFailure === second.isFailure;
        return serializeFullReport(first.value) === serializeFullReport(second.value);
      }),
      { numRuns: 100 },
    );
  });
});
