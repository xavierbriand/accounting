/**
 * Unit tests for src/cli/commands/explain-formatter-human.ts (story-4.3b, Slice 3).
 * No arithmetic in the formatter — every assertion here checks *rendering* of
 * already-computed ExplainReport values, never recomputed totals.
 */
import { describe, it, expect } from 'vitest';
import { formatExplainHuman } from '../../../../src/cli/commands/explain-formatter-human.js';
import { Money } from '../../../../src/core/shared/money.js';
import { LineItemKey } from '../../../../src/core/settlement/line-item-key.js';
import type { LineItem } from '@core/transfer/line-item.js';
import type { VarianceLine } from '../../../../src/core/settlement/variance-line.js';
import type { ExplainReport } from '../../../../src/cli/commands/explain-report.js';

function eur(cents: number): Money {
  const r = Money.fromCents(cents, 'EUR');
  if (r.isFailure) throw new Error(r.error);
  return r.value;
}

function keyOf(kind: LineItem['kind'], category: string, description: string): LineItemKey {
  return LineItemKey.of({ kind, category, description, date: '2026-07-01', gross: eur(0), perPartnerSplit: new Map() });
}

function makeLine(overrides: {
  category: string;
  description: string;
  kind?: LineItem['kind'];
  presence?: VarianceLine['presence'];
  totalDelta?: Money;
  perPartnerDelta?: ReadonlyMap<string, Money>;
}): VarianceLine {
  return {
    key: keyOf(overrides.kind ?? 'forecast', overrides.category, overrides.description),
    presence: overrides.presence ?? 'both',
    totalDelta: overrides.totalDelta ?? eur(0),
    perPartnerDelta: overrides.perPartnerDelta ?? new Map(),
  };
}

const baseWindows = {
  asOf: '2026-06-28',
  thisWindow: { from: '2026-07-01', to: '2026-07-31' },
  lastWindow: { from: '2026-06-01', to: '2026-06-30' },
};

describe('formatExplainHuman — variance section', () => {
  it('renders a blameless headline stating the transfer is more, with the correct sign-aware amount', () => {
    // fails if the headline phrasing doesn't reflect a positive totalDelta as "more"
    const report: ExplainReport = {
      ...baseWindows,
      variance: {
        ok: true,
        value: { lines: [], totalDelta: eur(4000), perPartnerDelta: new Map([['Alex', eur(4000)]]) },
      },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('EUR 40.00 more');
  });

  it('renders "less" for a negative totalDelta and "unchanged" for a zero one', () => {
    // fails if the sign-aware prose doesn't distinguish negative from zero deltas
    const lessReport: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(-4000), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const unchangedReport: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    expect(formatExplainHuman(lessReport)).toContain('EUR 40.00 less');
    expect(formatExplainHuman(unchangedReport)).toContain('unchanged');
  });

  it('renders presence as "new" for this-only and "gone" for last-only causes', () => {
    // fails if appeared/disappeared causes render a numeric delta instead of the new/gone marker
    const report: ExplainReport = {
      ...baseWindows,
      variance: {
        ok: true,
        value: {
          lines: [
            makeLine({ category: 'Insurance', description: 'Insurance', presence: 'this-only', totalDelta: eur(20000) }),
            makeLine({ category: 'Vacation', description: 'Vacation top-up', presence: 'last-only', totalDelta: eur(-120000) }),
          ],
          totalDelta: eur(-100000),
          perPartnerDelta: new Map(),
        },
      },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('new');
    expect(out).toContain('gone');
  });

  it('lists one table column per partner and every partner name appears', () => {
    // fails if the partner-column set is hardcoded instead of derived from perPartnerDelta
    const report: ExplainReport = {
      ...baseWindows,
      variance: {
        ok: true,
        value: {
          lines: [makeLine({ category: 'Rent', description: 'Rent', perPartnerDelta: new Map([['Alex', eur(1000)], ['Sam', eur(-1000)]]) })],
          totalDelta: eur(0),
          perPartnerDelta: new Map([['Alex', eur(1000)], ['Sam', eur(-1000)]]),
        },
      },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('Alex');
    expect(out).toContain('Sam');
  });

  it('shows the calc error and its suggested action instead of a table when variance failed', () => {
    // fails if a tolerated calc failure is swallowed instead of surfaced with guidance
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: false, error: 'buffer "Vacation" is below target and its targetDate has passed', suggestedAction: 'Update Vacation\'s targetDate in accounting.yaml.' },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('Suggested action');
    expect(out).toContain('Vacation');
  });
});

describe('formatExplainHuman — follow-through section', () => {
  it('renders each partner\'s actual vs suggested with sign-aware delta prose', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: {
        ok: true,
        value: {
          perPartner: new Map([
            ['Alex', { suggested: eur(50000), actual: eur(48000), delta: eur(2000) }],
            ['Sam', { suggested: eur(50000), actual: eur(46000), delta: eur(4000) }],
          ]),
          totalSuggested: eur(100000),
          totalActual: eur(94000),
          totalDelta: eur(6000),
        },
      },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('Alex');
    expect(out).toContain('EUR 480.00');
    expect(out).toContain('EUR 20.00 more');
  });

  it('names accounting.yaml and settlement: in the Suggested action when not configured', () => {
    // fails if the not-configured guidance doesn't point at the specific config section
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('accounting.yaml');
    expect(out).toContain('settlement:');
  });

  it('renders the follow-through error and its suggested action when it failed independently of variance', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, error: 'buffer "Vacation" is below target and its targetDate has passed', suggestedAction: 'Update Vacation\'s targetDate in accounting.yaml.' },
    };
    const out = formatExplainHuman(report);
    expect(out).toContain('Suggested action');
  });
});

describe('formatExplainHuman — footnote', () => {
  it('includes the "movement computed with today\'s configuration" footnote line', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    expect(formatExplainHuman(report)).toContain('movement computed with today\'s configuration');
  });
});
