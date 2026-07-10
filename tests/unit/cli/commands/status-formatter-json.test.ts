/**
 * Property tests for formatStatusJson (Story 3.5, Slice 4 RED; enveloped in story-4.4b Slice 1).
 *
 * Property test sanity checks (Story 3.3 retro action B):
 * - Property #1: if a key is removed from the output object, the arrayContaining check fails.
 *   The generator guarantees minLength:1 for buffers so Map→object path is exercised.
 *   If formatStatusJson produced {} for perPartner (raw Map serialization bug), the
 *   Object.keys check would see an empty object vs expected non-empty partners.
 * - Property #2: if either formatter used wrong cents or skipped the amount entirely,
 *   the parseInt comparison would produce different numbers and the assertion would fail.
 *
 * story-4.4b: formatStatusJson now returns the global envelope
 * ({command: "status", ok: true, data: {...}}) — every assertion below unwraps `data`
 * before inspecting the report shape.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatStatusJson } from '../../../../src/cli/commands/status-formatter-json.js';
import { formatStatusHuman } from '../../../../src/cli/commands/status-formatter-human.js';
import { Money } from '../../../../src/core/shared/money.js';
import type { StatusReport } from '../../../../src/cli/commands/status-report.js';
import type { BufferState } from '../../../../src/core/buffers/buffer-state.js';
import type { ForecastOccurrence } from '../../../../src/core/recurring/forecast-occurrence.js';
import type { SafeTransferCalculation } from '../../../../src/core/transfer/safe-transfer-calculation.js';

function makeMoneyEUR(cents: number): Money {
  const r = Money.fromCents(cents, 'EUR');
  if (r.isFailure) throw new Error(r.error);
  return r.value;
}

function makeSuccessfulReport(opts: {
  bufferCents?: number;
  netflixCents?: number;
  totalCents?: number;
  bufferName?: string;
} = {}): StatusReport {
  const {
    bufferCents = 60000,
    netflixCents = 1299,
    totalCents = 50000,
    bufferName = 'Vacation',
  } = opts;

  const bufferBalance = makeMoneyEUR(bufferCents);
  const bufferTarget = makeMoneyEUR(120000);

  const buffers: BufferState[] = [{
    name: bufferName,
    balance: bufferBalance,
    target: bufferTarget,
    cap: undefined,
    status: 'below',
    targetDate: '2026-12-01',
  }];

  const totalRequired = makeMoneyEUR(totalCents);
  const alexShare = makeMoneyEUR(Math.ceil(totalCents * 0.6));
  const samShare = makeMoneyEUR(totalCents - Math.ceil(totalCents * 0.6));

  const perPartner = new Map([
    ['Alex', alexShare],
    ['Sam', samShare],
  ]);

  const lineItemAmount = makeMoneyEUR(netflixCents);
  const lineItemSplit = new Map([
    ['Alex', makeMoneyEUR(Math.ceil(netflixCents * 0.6))],
    ['Sam', makeMoneyEUR(netflixCents - Math.ceil(netflixCents * 0.6))],
  ]);

  const calc: SafeTransferCalculation = {
    totalRequired,
    perPartner,
    lineItems: [{
      kind: 'forecast',
      date: '2026-05-15',
      category: 'Subscriptions',
      description: 'Netflix',
      gross: lineItemAmount,
      perPartnerSplit: lineItemSplit,
    }],
  };

  const occurrences: ForecastOccurrence[] = [{
    name: 'Netflix',
    category: 'Subscriptions',
    expectedDate: '2026-05-15',
    amount: lineItemAmount,
  }];

  return {
    asOf: '2026-04-29',
    window: { from: '2026-05-01', to: '2026-05-31' },
    buffers,
    transfer: { ok: true, value: calc },
    forecast: { ok: true, value: occurrences },
  };
}

interface StatusJsonDoc {
  asOf: string;
  window: { from: string; to: string };
  buffers: Array<{ name: string; balance: string; target: string; cap: null | string; status: string; targetDate: string }>;
  transfer: {
    totalRequired?: string;
    perPartner?: Record<string, string>;
    lineItems?: Array<{ perPartnerSplit: Record<string, string> }>;
  };
  forecast: Array<Record<string, unknown>>;
}

function parseEnvelope(json: string): { command: string; ok: boolean; data: StatusJsonDoc } {
  return JSON.parse(json) as { command: string; ok: boolean; data: StatusJsonDoc };
}

// ─── Envelope shape ────────────────────────────────────────────────────────────

describe('formatStatusJson — global envelope (story-4.4b)', () => {
  it('wraps the report in {command: "status", ok: true, data} as a single compact line', () => {
    // fails if formatStatusJson (status-formatter-json.ts) stops calling
    // formatJsonSuccess('status', doc) — reintroducing a bare document or the old
    // `, null, 2` pretty-printing
    const report = makeSuccessfulReport();
    const json = formatStatusJson(report);

    expect(json.endsWith('\n')).toBe(true);
    expect(json.trim().split('\n')).toHaveLength(1);

    const envelope = parseEnvelope(json);
    expect(envelope.command).toBe('status');
    expect(envelope.ok).toBe(true);
    expect(Object.keys(envelope.data)).toEqual(
      expect.arrayContaining(['asOf', 'window', 'buffers', 'transfer', 'forecast']),
    );
  });
});

// ─── Property #1: JSON output shape stability ─────────────────────────────────

describe('Property #1: JSON output shape stability', () => {
  it('JSON.parse output has all required top-level keys under data', () => {
    const report = makeSuccessfulReport();
    const json = formatStatusJson(report);
    const { data } = parseEnvelope(json);

    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(['asOf', 'window', 'buffers', 'transfer', 'forecast']),
    );
  });

  it('buffers array is present and has correct fields', () => {
    const report = makeSuccessfulReport();
    const json = formatStatusJson(report);
    const { data } = parseEnvelope(json);

    expect(data.buffers).toHaveLength(1);
    expect(data.buffers[0].name).toBe('Vacation');
    expect(data.buffers[0].cap).toBeNull();
    expect(data.buffers[0].balance).toMatch(/^EUR/);
  });

  it('cap field serializes as Money.toString() when defined (R8 mock-diversity, non-default cap branch)', () => {
    // fails if formatStatusJson omits the cap key when defined, or returns null when
    // a Money was supplied. The branch `b.cap !== undefined ? b.cap.toString() : null`
    // is otherwise only exercised on the null side.
    const report = makeSuccessfulReport();
    const withCap: StatusReport = {
      ...report,
      buffers: [{
        ...report.buffers[0],
        cap: makeMoneyEUR(1000_00),
        status: 'on-target',
      }],
    };
    const json = formatStatusJson(withCap);
    const { data } = parseEnvelope(json);
    expect(data.buffers[0].cap).toBe('EUR 1000.00');
    expect(data.buffers[0].status).toBe('on-target');
  });

  it('transfer.perPartner is a plain object with non-empty values (not {} from Map)', () => {
    const report = makeSuccessfulReport();
    const json = formatStatusJson(report);
    const { data } = parseEnvelope(json);

    expect(Object.keys(data.transfer.perPartner!)).toContain('Alex');
    expect(Object.keys(data.transfer.perPartner!)).toContain('Sam');
    expect(data.transfer.perPartner!['Alex']).toMatch(/^EUR \d/);
    expect(data.transfer.perPartner!['Sam']).toMatch(/^EUR \d/);
  });

  it('lineItem.perPartnerSplit is a plain object (not {} from Map)', () => {
    const report = makeSuccessfulReport();
    const json = formatStatusJson(report);
    const { data } = parseEnvelope(json);

    expect(data.transfer.lineItems).toHaveLength(1);
    expect(Object.keys(data.transfer.lineItems![0].perPartnerSplit)).toContain('Alex');
    expect(Object.keys(data.transfer.lineItems![0].perPartnerSplit)).toContain('Sam');
  });

  it('forecast entries use "date" field, not "expectedDate"', () => {
    const report = makeSuccessfulReport();
    const json = formatStatusJson(report);
    const { data } = parseEnvelope(json);

    expect(data.forecast).toHaveLength(1);
    expect('date' in data.forecast[0]).toBe(true);
    expect('expectedDate' in data.forecast[0]).toBe(false);
  });

  it('fast-check: always produces all top-level keys with non-empty buffers entry', () => {
    const centArb = fc.integer({ min: 1, max: 1_000_000 });
    const bufferNameArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0);

    fc.assert(
      fc.property(
        fc.array(fc.record({ name: bufferNameArb, cents: centArb }), { minLength: 1, maxLength: 5 }),
        centArb,
        (bufferConfigs, totalCents) => {
          const buffers: BufferState[] = bufferConfigs.map(({ name, cents }) => ({
            name,
            balance: makeMoneyEUR(cents),
            target: makeMoneyEUR(cents * 2),
            cap: undefined,
            status: 'below' as const,
            targetDate: '2026-12-01',
          }));

          const totalRequired = makeMoneyEUR(totalCents);
          const alexShare = makeMoneyEUR(Math.ceil(totalCents * 0.6));
          const samShare = makeMoneyEUR(totalCents - Math.ceil(totalCents * 0.6));

          const report: StatusReport = {
            asOf: '2026-04-29',
            window: { from: '2026-05-01', to: '2026-05-31' },
            buffers,
            transfer: {
              ok: true,
              value: {
                totalRequired,
                perPartner: new Map([['Alex', alexShare], ['Sam', samShare]]),
                lineItems: [],
              },
            },
            forecast: { ok: true, value: [] },
          };

          const json = formatStatusJson(report);
          const { data } = parseEnvelope(json);

          expect(Object.keys(data)).toEqual(
            expect.arrayContaining(['asOf', 'window', 'buffers', 'transfer', 'forecast']),
          );

          // Non-empty buffers entry exercises the serialization path
          const buffersArr = data.buffers;
          expect(buffersArr.length).toBeGreaterThan(0);
          buffersArr.forEach(b => expect(typeof b.name).toBe('string'));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property #2: JSON ↔ human total agreement ────────────────────────────────

describe('Property #2: JSON ↔ human total agreement', () => {
  it('numeric cents from JSON totalRequired equals numeric cents from human "Total transfer for" line', () => {
    const centArb = fc.integer({ min: 100, max: 10_000_000 });

    fc.assert(
      fc.property(centArb, (totalCents) => {
        const report = makeSuccessfulReport({ totalCents });

        const jsonStr = formatStatusJson(report);
        const { data } = parseEnvelope(jsonStr);

        const humanStr = formatStatusHuman(report);

        // Per plan: parse cents via integer-string strip, NOT parseFloat × 100 (which has
        // floating-point round-trip risk for values like 1234.575 → 123457.49999... → 123457).
        const jsonMoneyStr = data.transfer.totalRequired!;
        const jsonCents = parseInt(jsonMoneyStr.replace(/\D/g, ''), 10);

        const totalLine = humanStr.split('\n').find(line => line.includes('Total transfer for'));
        expect(totalLine).toBeDefined();

        const moneyMatch = /EUR\s+\d[\d.]*/.exec(totalLine as string);
        expect(moneyMatch).not.toBeNull();
        const humanCents = parseInt((moneyMatch as RegExpExecArray)[0].replace(/\D/g, ''), 10);

        expect(jsonCents).toBe(humanCents);
        expect(jsonCents).toBe(totalCents);
      }),
      { numRuns: 100 },
    );
  });
});
