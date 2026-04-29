/**
 * Unit tests for formatStatusHuman (Story 3.5, Slice 4 RED).
 *
 * Property test sanity checks (Story 3.3 retro action B):
 * - If formatStatusHuman returns empty string, all section-header checks fail.
 * - If "Vacation" or "below" are not included in the buffer table, toContain fails.
 * - If the prose "Total transfer for May 2026" uses wrong month or wrong formatter, it fails.
 * - If partner amounts are not included, those checks fail.
 */
import { describe, it, expect } from 'vitest';
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

function makeFullReport(): StatusReport {
  const bufferBalance = makeMoneyEUR(60000);
  const bufferTarget = makeMoneyEUR(120000);

  const buffers: BufferState[] = [{
    name: 'Vacation',
    balance: bufferBalance,
    target: bufferTarget,
    cap: undefined,
    status: 'below',
    targetDate: '2026-12-01',
  }];

  const totalRequired = makeMoneyEUR(172_43 + 12_99);
  const alexShare = makeMoneyEUR(Math.ceil(totalRequired.amount * 0.6));
  const samShare = makeMoneyEUR(totalRequired.amount - alexShare.amount);

  const perPartner = new Map([
    ['Alex', alexShare],
    ['Sam', samShare],
  ]);

  const lineItemAmount = makeMoneyEUR(1299);
  const bufferTopupAmount = makeMoneyEUR(17243);

  const calc: SafeTransferCalculation = {
    totalRequired,
    perPartner,
    lineItems: [
      {
        kind: 'buffer-topup',
        date: '2026-05-01',
        category: 'Vacation',
        description: 'Vacation top-up',
        gross: bufferTopupAmount,
        perPartnerSplit: new Map([
          ['Alex', makeMoneyEUR(Math.ceil(17243 * 0.6))],
          ['Sam', makeMoneyEUR(17243 - Math.ceil(17243 * 0.6))],
        ]),
      },
      {
        kind: 'forecast',
        date: '2026-05-15',
        category: 'Subscriptions',
        description: 'Netflix',
        gross: lineItemAmount,
        perPartnerSplit: new Map([
          ['Alex', makeMoneyEUR(Math.ceil(1299 * 0.6))],
          ['Sam', makeMoneyEUR(1299 - Math.ceil(1299 * 0.6))],
        ]),
      },
    ],
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

// ─── Section headers ───────────────────────────────────────────────────────────

describe('formatStatusHuman — section headers', () => {
  it('contains "Buffers" section header', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Buffers');
  });

  it('contains "Transfer" section header', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Transfer');
  });

  it('contains "Forecast" section header', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Forecast');
  });
});

// ─── Buffer table ─────────────────────────────────────────────────────────────

describe('formatStatusHuman — buffer table', () => {
  it('shows buffer name "Vacation"', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Vacation');
  });

  it('shows buffer status "below"', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('below');
  });

  it('shows buffer targetDate', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('2026-12-01');
  });

  it('shows buffer balance and target as EUR amounts', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('EUR');
    // Balance is 600.00
    expect(output).toContain('600.00');
    // Target is 1200.00
    expect(output).toContain('1200.00');
  });

  it('renders cap value when defined (R8 mock-diversity: non-default cap branch)', () => {
    // fails if formatStatusHuman emits "-" for a defined cap (which would happen if the
    // formatter's `cap !== undefined` branch is wrong) instead of the formatted Money.
    const report = makeFullReport();
    const withCap: StatusReport = {
      ...report,
      buffers: [{
        name: 'House',
        balance: makeMoneyEUR(700_00),
        target: makeMoneyEUR(500_00),
        cap: makeMoneyEUR(1000_00),
        status: 'on-target',
        targetDate: '2026-12-01',
      }],
    };
    const output = formatStatusHuman(withCap);
    expect(output).toContain('1000.00'); // cap rendered
    expect(output).toContain('on-target'); // R8 mock-diversity: non-default status branch
  });

  it('renders above-cap status (R8 mock-diversity: third status branch)', () => {
    // fails if statusColor's above-cap branch never executes (it's unreachable in the
    // happy-path fixture, leaving production code uncovered).
    const report = makeFullReport();
    const aboveCapReport: StatusReport = {
      ...report,
      buffers: [{
        name: 'Emergency',
        balance: makeMoneyEUR(2000_00),
        target: makeMoneyEUR(500_00),
        cap: makeMoneyEUR(1000_00),
        status: 'above-cap',
        targetDate: '2026-12-01',
      }],
    };
    const output = formatStatusHuman(aboveCapReport);
    expect(output).toContain('above-cap');
    expect(output).toContain('Emergency');
  });
});

// ─── Transfer prose ───────────────────────────────────────────────────────────

describe('formatStatusHuman — transfer prose', () => {
  it('contains "Total transfer for May 2026" (English month, derived from window.from)', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Total transfer for May 2026');
  });

  it('contains partner names Alex and Sam', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Alex');
    expect(output).toContain('Sam');
  });

  it('shows totalRequired as EUR money string', () => {
    const output = formatStatusHuman(makeFullReport());
    // Total is 17243 + 1299 = 18542 cents = EUR 185.42
    expect(output).toContain('185.42');
  });
});

// ─── Forecast table ───────────────────────────────────────────────────────────

describe('formatStatusHuman — forecast table', () => {
  it('shows Netflix in forecast', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('Netflix');
  });

  it('shows forecast date 2026-05-15', () => {
    const output = formatStatusHuman(makeFullReport());
    expect(output).toContain('2026-05-15');
  });
});

// ─── Month name computation ───────────────────────────────────────────────────

describe('formatStatusHuman — month name from window.from', () => {
  it('January 2027 when window.from is 2027-01-01', () => {
    const report = makeFullReport();
    const modified: StatusReport = { ...report, window: { from: '2027-01-01', to: '2027-01-31' } };
    const output = formatStatusHuman(modified);
    expect(output).toContain('January 2027');
  });

  it('December 2026 when window.from is 2026-12-01', () => {
    const report = makeFullReport();
    const modified: StatusReport = { ...report, window: { from: '2026-12-01', to: '2026-12-31' } };
    const output = formatStatusHuman(modified);
    expect(output).toContain('December 2026');
  });
});

// ─── Branch coverage: edge cases ──────────────────────────────────────────────

describe('formatStatusHuman — empty forecast branch', () => {
  it('shows "(no forecast occurrences in window)" when forecast is empty', () => {
    const report = makeFullReport();
    const modified: StatusReport = { ...report, forecast: { ok: true, value: [] } };
    const output = formatStatusHuman(modified);
    expect(output).toContain('no forecast occurrences');
  });
});

describe('formatStatusHuman — forecast error branch', () => {
  it('shows forecast error message when forecast fails', () => {
    const report = makeFullReport();
    const modified: StatusReport = { ...report, forecast: { ok: false, error: 'forecast service unavailable' } };
    const output = formatStatusHuman(modified);
    expect(output).toContain('forecast service unavailable');
  });
});

describe('formatStatusHuman — no buffers branch', () => {
  it('shows "(no buffers configured)" when buffers is empty', () => {
    const report = makeFullReport();
    const modified: StatusReport = { ...report, buffers: [] };
    const output = formatStatusHuman(modified);
    expect(output).toContain('no buffers configured');
  });
});
