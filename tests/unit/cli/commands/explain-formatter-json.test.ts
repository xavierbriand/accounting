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
    const envelope = JSON.parse(formatExplainJson(report)) as {
      data: { variance: { lines: Array<{ kind: string; category: string; description: string; presence: string; totalDelta: string; perPartnerDelta: Record<string, string> }> } };
    };
    const presences = envelope.data.variance.lines.map(l => l.presence).sort();
    expect(presences).toEqual(['both', 'last-only', 'this-only']);
  });

  it('serializes a negative totalDelta as a signed Money string, not a dropped sign', () => {
    // fails if lineToJson/formatExplainJson routes totalDelta through anything but Money.toString(), losing the sign
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: diverseLines, totalDelta: eur(-105000), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const envelope = JSON.parse(formatExplainJson(report)) as { data: { variance: { totalDelta: string } } };
    expect(envelope.data.variance.totalDelta).toBe('EUR -1050.00');
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
    const envelope = JSON.parse(formatExplainJson(report)) as { data: { variance: { perPartnerDelta: Record<string, string> } } };
    expect(envelope.data.variance.perPartnerDelta).toEqual({ Alex: 'EUR -630.00', Sam: 'EUR -420.00' });
  });

  it('serializes a calc-failure variance as { error, suggestedAction }, not a lines array', () => {
    // fails if formatExplainJson's variance.ok branch check is inverted/missing and an error report leaks an empty lines array
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: false, error: 'buffer "Vacation" is below target', suggestedAction: 'Update Vacation\'s targetDate.' },
      followThrough: { ok: false, notConfigured: true },
    };
    const envelope = JSON.parse(formatExplainJson(report)) as { data: { variance: { error?: string; lines?: unknown } } };
    expect(envelope.data.variance.error).toContain('Vacation');
    expect(envelope.data.variance.lines).toBeUndefined();
  });
});

describe('formatExplainJson — followThrough shape', () => {
  it('serializes perPartner as an object keyed by partner with suggested/actual/delta strings', () => {
    // fails if formatExplainJson passes the followThrough.perPartner Map straight to JSON.stringify (serializes as {}) instead of the explicit Map->object loop
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
    const envelope = JSON.parse(formatExplainJson(report)) as {
      data: { followThrough: { perPartner: Record<string, { suggested: string; actual: string; delta: string }>; totalDelta: string } };
    };
    expect(envelope.data.followThrough.perPartner['Alex']).toEqual({ suggested: 'EUR 500.00', actual: 'EUR 480.00', delta: 'EUR 20.00' });
    expect(envelope.data.followThrough.totalDelta).toBe('EUR 60.00');
  });

  it('serializes { notConfigured: true } distinctly from an empty ok follow-through', () => {
    // fails if formatExplainJson's notConfigured branch ('notConfigured' in report.followThrough) is dropped and the marker collapses into the error or ok shape
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const envelope = JSON.parse(formatExplainJson(report)) as { data: { followThrough: { notConfigured?: boolean; perPartner?: unknown } } };
    expect(envelope.data.followThrough.notConfigured).toBe(true);
    expect(envelope.data.followThrough.perPartner).toBeUndefined();
  });
});

describe('formatExplainJson — document shape (story-4.4b: enveloped)', () => {
  it('emits a single {command: "explain", ok: true, data} JSON object with a trailing newline and no extra prose', () => {
    // fails if the formatter interleaves any human-readable text with the JSON document
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const out = formatExplainJson(report);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.trim().startsWith('{')).toBe(true);

    const envelope = JSON.parse(out) as { command: string; ok: boolean };
    expect(envelope.command).toBe('explain');
    expect(envelope.ok).toBe(true);
  });

  it('includes asOf, thisWindow, and lastWindow verbatim from the report', () => {
    // fails if formatExplainJson's doc assembly renames/drops the window keys or re-derives them instead of copying report.thisWindow/lastWindow verbatim
    const report: ExplainReport = {
      ...baseWindows,
      variance: { ok: true, value: { lines: [], totalDelta: eur(0), perPartnerDelta: new Map() } },
      followThrough: { ok: false, notConfigured: true },
    };
    const envelope = JSON.parse(formatExplainJson(report)) as { data: { asOf: string; thisWindow: unknown; lastWindow: unknown } };
    expect(envelope.data.asOf).toBe('2026-06-28');
    expect(envelope.data.thisWindow).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });
});
