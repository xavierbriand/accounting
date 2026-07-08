/**
 * Unit tests for src/cli/commands/explain-formatter-json.ts (story-4.3b, Slice 4).
 * R8 mock diversity: fixtures below vary presence (both/this-only/last-only),
 * include a negative totalDelta, and cover multi-partner maps — the first
 * structured-output surface for settlement variance (#208 item 4).
 */
import { describe, it, expect } from 'vitest';
import { formatExplainJson } from '../../../../src/cli/commands/explain-formatter-json.js';
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

const baseWindows = {
  asOf: '2026-06-28',
  thisWindow: { from: '2026-07-01', to: '2026-07-31' },
  lastWindow: { from: '2026-06-01', to: '2026-06-30' },
};

// R8-diverse: one "both" line with a negative totalDelta, one "this-only", one
// "last-only", multi-partner (Alex, Sam) per-partner deltas.
const diverseLines: readonly VarianceLine[] = [
  {
    key: keyOf('forecast', 'Rent', 'Rent'),
    presence: 'both',
    totalDelta: eur(-5000),
    perPartnerDelta: new Map([['Alex', eur(-3000)], ['Sam', eur(-2000)]]),
  },
  {
    key: keyOf('forecast', 'Insurance', 'Insurance'),
    presence: 'this-only',
    totalDelta: eur(20000),
    perPartnerDelta: new Map([['Alex', eur(12000)], ['Sam', eur(8000)]]),
  },
  {
    key: keyOf('buffer-topup', 'Vacation', 'Vacation top-up'),
    presence: 'last-only',
    totalDelta: eur(-120000),
    perPartnerDelta: new Map([['Alex', eur(-72000)], ['Sam', eur(-48000)]]),
  },
];

describe('formatExplainJson — variance shape', () => {
  it('serializes all three presence classes with Money.toString() deltas', () => {
    // fails if the formatter drops a presence class instead of round-tripping the full line set
    const report: ExplainReport = {
      ...baseWindows,
      variance: {
        ok: true,
        value: { lines: diverseLines, totalDelta: eur(-105000), perPartnerDelta: new Map([['Alex', eur(-63000)], ['Sam', eur(-42000)]]) },
      },
      followThrough: { ok: false, notConfigured: true },
    };
    const doc = JSON.parse(formatExplainJson(report)) as {
      variance: { lines: Array<{ kind: string; category: string; description: string; presence: string; totalDelta: string; perPartnerDelta: Record<string, string> }> };
    };
    const presences = doc.variance.lines.map(l => l.presence).sort();
    expect(presences).toEqual(['both', 'last-only', 'this-only']);
  });

  it('serializes a negative totalDelta as a signed Money string, not a dropped sign', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: diverseLines, totalDelta: eur(-105000), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const doc = JSON.parse(formatExplainJson(report)) as { variance: { totalDelta: string } };
    expect(doc.variance.totalDelta).toBe('EUR -1050.00');
  });

  it('serializes perPartnerDelta Maps as plain objects (not {})', () => {
    // fails if a Map is passed straight to JSON.stringify and silently serializes as {}
    const report: ExplainReport = {
      ...baseWindows,
      variance: {
        ok: true,
        value: { lines: diverseLines, totalDelta: eur(-105000), perPartnerDelta: new Map([['Alex', eur(-63000)], ['Sam', eur(-42000)]]) },
      },
      followThrough: { ok: false, notConfigured: true },
    };
    const doc = JSON.parse(formatExplainJson(report)) as { variance: { perPartnerDelta: Record<string, string> } };
    expect(doc.variance.perPartnerDelta).toEqual({ Alex: 'EUR -630.00', Sam: 'EUR -420.00' });
  });

  it('serializes a calc-failure variance as { error, suggestedAction }, not a lines array', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: false, error: 'buffer "Vacation" is below target', suggestedAction: 'Update Vacation\'s targetDate.' },
      followThrough: { ok: false, notConfigured: true },
    };
    const doc = JSON.parse(formatExplainJson(report)) as { variance: { error?: string; lines?: unknown } };
    expect(doc.variance.error).toContain('Vacation');
    expect(doc.variance.lines).toBeUndefined();
  });
});

describe('formatExplainJson — followThrough shape', () => {
  it('serializes perPartner as an object keyed by partner with suggested/actual/delta strings', () => {
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
    const doc = JSON.parse(formatExplainJson(report)) as {
      followThrough: { perPartner: Record<string, { suggested: string; actual: string; delta: string }>; totalDelta: string };
    };
    expect(doc.followThrough.perPartner['Alex']).toEqual({ suggested: 'EUR 500.00', actual: 'EUR 480.00', delta: 'EUR 20.00' });
    expect(doc.followThrough.totalDelta).toBe('EUR 60.00');
  });

  it('serializes { notConfigured: true } distinctly from an empty ok follow-through', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const doc = JSON.parse(formatExplainJson(report)) as { followThrough: { notConfigured?: boolean; perPartner?: unknown } };
    expect(doc.followThrough.notConfigured).toBe(true);
    expect(doc.followThrough.perPartner).toBeUndefined();
  });
});

describe('formatExplainJson — document shape', () => {
  it('emits a single JSON object with a trailing newline and no extra prose', () => {
    // fails if the formatter interleaves any human-readable text with the JSON document
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainJson(report);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.trim().startsWith('{')).toBe(true);
  });

  it('includes asOf, thisWindow, and lastWindow verbatim from the report', () => {
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const doc = JSON.parse(formatExplainJson(report)) as { asOf: string; thisWindow: unknown; lastWindow: unknown };
    expect(doc.asOf).toBe('2026-06-28');
    expect(doc.thisWindow).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });
});
