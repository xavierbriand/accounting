/**
 * Unit tests for src/cli/commands/explain-command.ts (story-4.3b, Slice 2).
 *
 * `assembleExplainReport` is tested directly for the tolerant-section branching
 * (variance/follow-through independently degrade to error/notConfigured) — pure
 * data assembly, no formatter involved. The one `runExplainCommand`-level test
 * here (invalid --as-of) only exercises the validation path, which returns
 * before either formatter is ever called. The remaining `runExplainCommand`
 * end-to-end tests (JSON serialization, exit codes that depend on the assembled
 * report reaching stdout) live in explain-command-json-output.test.ts, committed
 * alongside the JSON formatter (Slice 4) since they need it to produce
 * observable output.
 */
import { describe, it, expect } from 'vitest';
import { runExplainCommand, assembleExplainReport } from '../../../../src/cli/commands/explain-command.js';
import { SplitRulesService } from '../../../../src/core/splits/split-rules-service.js';
import { BufferStateService } from '../../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../../src/core/recurring/recurring-forecast-service.js';
import { SafeTransferCalculator } from '../../../../src/core/transfer/safe-transfer-calculator.js';
import { Money } from '../../../../src/core/shared/money.js';
import { Result } from '../../../../src/core/shared/result.js';
import type { BufferLedgerQuery } from '../../../../src/core/ports/buffer-ledger-query.js';
import type { ContributionQuery, ContributionsInWindow } from '../../../../src/core/ports/contribution-query.js';
import type { SafeTransferCalculation } from '../../../../src/core/transfer/safe-transfer-calculation.js';
import type { ExplainReport, ExplainVarianceOk } from '../../../../src/cli/commands/explain-report.js';
import type { FollowThrough } from '../../../../src/core/settlement/follow-through.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

function eur(cents: number): Money {
  const r = Money.fromCents(cents, 'EUR');
  if (r.isFailure) throw new Error(r.error);
  return r.value;
}

function makeCalc(totalCents: number, perPartner: Record<string, number>): SafeTransferCalculation {
  const perPartnerSplit = new Map(Object.entries(perPartner).map(([p, c]) => [p, eur(c)]));
  return {
    totalRequired: eur(totalCents),
    perPartner: new Map(Object.entries(perPartner).map(([p, c]) => [p, eur(c)])),
    lineItems: [
      { kind: 'forecast', date: '2026-07-01', category: 'Rent', description: 'Rent', gross: eur(totalCents), perPartnerSplit },
    ],
  };
}

function makeCaptureStream(): { stream: NodeJS.WritableStream; getText: () => string } {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string) { chunks.push(chunk); return true; },
  } as unknown as NodeJS.WritableStream;
  return { stream, getText: () => chunks.join('') };
}

function expectVarianceOk(report: ExplainReport): ExplainVarianceOk {
  if (!report.variance.ok) throw new Error(`expected ok variance, got error: ${report.variance.error}`);
  return report.variance.value;
}

function expectVarianceError(report: ExplainReport): { error: string; suggestedAction: string } {
  if (report.variance.ok) throw new Error('expected a variance error, got ok');
  return report.variance;
}

function expectFollowThroughOk(report: ExplainReport): FollowThrough {
  if (!report.followThrough.ok) throw new Error(`expected ok follow-through, got: ${JSON.stringify(report.followThrough)}`);
  return report.followThrough.value;
}

function expectFollowThroughError(report: ExplainReport): { error: string; suggestedAction: string } {
  if (report.followThrough.ok || !('error' in report.followThrough)) {
    throw new Error(`expected a follow-through error, got: ${JSON.stringify(report.followThrough)}`);
  }
  return report.followThrough;
}

// balancePoints keyed by account: best <= asOfDate match, mirrors
// settlement-variance.steps.ts's fake ledger.
function makeBalanceLedger(points: Map<string, Array<{ asOfDate: string; cents: number }>>): BufferLedgerQuery {
  return {
    sumEntriesByAccount(account: string, currency: string, asOfDate: string): Result<Money> {
      const rows = points.get(account) ?? [];
      const best = rows
        .filter(p => p.asOfDate <= asOfDate)
        .sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : -1))[0];
      return Money.fromCents(best?.cents ?? 0, currency);
    },
  };
}

function makeContributionQuery(contributions: ContributionsInWindow): ContributionQuery {
  return {
    contributionsInWindow(): Result<ContributionsInWindow> {
      return Result.ok(contributions);
    },
  };
}

const emptyContributions: ContributionsInWindow = { attributed: [], totalActual: eur(0) };

function makeRealServices(opts: {
  bufferTargetCents?: number;
  bufferTargetDate?: string;
  balancePoints?: Map<string, Array<{ asOfDate: string; cents: number }>>;
} = {}): { transferCalculator: SafeTransferCalculator } {
  const { bufferTargetCents = 120000, bufferTargetDate = '2026-12-01', balancePoints = new Map() } = opts;

  const splitsService = new SplitRulesService([
    { validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }] },
  ]);
  const buffersService = new BufferStateService(
    [{ name: 'Vacation', account: 'vacation-account', target: eur(bufferTargetCents), targetDate: bufferTargetDate }],
    'EUR',
    makeBalanceLedger(balancePoints),
  );
  const forecastService = new RecurringForecastService([]);
  const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, 'EUR');
  return { transferCalculator };
}

// ─── assembleExplainReport — tolerant sections ─────────────────────────────────

describe('assembleExplainReport — tolerant sections', () => {
  it('assembles ok variance + ok follow-through when both months and contributions succeed', () => {
    // fails if the happy-path wiring drops a section or miswires which month feeds the diff
    const thisCalc = makeCalc(100000, { Alex: 60000, Sam: 40000 });
    const lastCalc = makeCalc(80000, { Alex: 48000, Sam: 32000 });
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: eur(48000) }, { partner: 'Sam', amount: eur(32000) }],
      totalActual: eur(80000),
    };
    const report = assembleExplainReport(
      '2026-06-28',
      { from: '2026-07-01', to: '2026-07-31' },
      { from: '2026-06-01', to: '2026-06-30' },
      Result.ok(thisCalc),
      Result.ok(lastCalc),
      contributions,
      true,
    );
    const variance = expectVarianceOk(report);
    expect(variance.totalDelta.amount).toBe(20000);
    const followThrough = expectFollowThroughOk(report);
    expect(followThrough.totalSuggested.amount).toBe(100000);
  });

  it('reports notConfigured follow-through (ignoring domain follow-through numbers) when settlement is unconfigured', () => {
    // fails if a missing settlement: section leaks partial follow-through numbers instead of the explicit marker
    const thisCalc = makeCalc(100000, { Alex: 60000, Sam: 40000 });
    const lastCalc = makeCalc(80000, { Alex: 48000, Sam: 32000 });
    const report = assembleExplainReport(
      '2026-06-28',
      { from: '2026-07-01', to: '2026-07-31' },
      { from: '2026-06-01', to: '2026-06-30' },
      Result.ok(thisCalc),
      Result.ok(lastCalc),
      undefined,
      false,
    );
    expectVarianceOk(report);
    expect(report.followThrough).toEqual({ ok: false, notConfigured: true });
  });

  it('shows the calc error on the variance section but still renders follow-through when only last month fails', () => {
    // fails if a last-month-only calc failure suppresses follow-through (which needs only this month)
    const thisCalc = makeCalc(100000, { Alex: 60000, Sam: 40000 });
    const contributions: ContributionsInWindow = {
      attributed: [{ partner: 'Alex', amount: eur(58000) }, { partner: 'Sam', amount: eur(38000) }],
      totalActual: eur(96000),
    };
    const report = assembleExplainReport(
      '2026-06-28',
      { from: '2026-07-01', to: '2026-07-31' },
      { from: '2026-06-01', to: '2026-06-30' },
      Result.ok(thisCalc),
      Result.fail('buffer "Vacation" is below target and its targetDate (2026-01-01) has passed'),
      contributions,
      true,
    );
    const varianceError = expectVarianceError(report);
    expect(varianceError.error).toContain('Vacation');
    const followThrough = expectFollowThroughOk(report);
    expect(followThrough.totalActual.amount).toBe(96000);
  });

  it('shows the same calc error on both sections when this month fails (follow-through needs this month)', () => {
    // fails if follow-through silently falls back to last month's suggestion instead of reporting the failure
    const lastCalc = makeCalc(80000, { Alex: 48000, Sam: 32000 });
    const report = assembleExplainReport(
      '2026-06-28',
      { from: '2026-07-01', to: '2026-07-31' },
      { from: '2026-06-01', to: '2026-06-30' },
      Result.fail('buffer "Vacation" is below target and its targetDate (2026-01-01) has passed'),
      Result.ok(lastCalc),
      undefined,
      true,
    );
    const varianceError = expectVarianceError(report);
    const followThroughError = expectFollowThroughError(report);
    expect(varianceError.error).toBe(followThroughError.error);
  });

  it('defaults to empty contributions for the variance diff when settlement is unconfigured (no divide-by-zero, no crash)', () => {
    // fails if an undefined contributions value crashes the diff instead of defaulting to zero
    const thisCalc = makeCalc(50000, { Alex: 30000, Sam: 20000 });
    const lastCalc = makeCalc(50000, { Alex: 30000, Sam: 20000 });
    const report = assembleExplainReport(
      '2026-06-28',
      { from: '2026-07-01', to: '2026-07-31' },
      { from: '2026-06-01', to: '2026-06-30' },
      Result.ok(thisCalc),
      Result.ok(lastCalc),
      undefined,
      false,
    );
    const variance = expectVarianceOk(report);
    expect(variance.totalDelta.amount).toBe(0);
  });
});

// ─── runExplainCommand — validation & wiring ───────────────────────────────────

describe('runExplainCommand — validation', () => {
  it('returns exit code 2 and writes nothing to stdout for an invalid --as-of format', async () => {
    // fails if runExplainCommand's ISO_DATE gate lets a malformed --as-of through to the calculators (exit 0/1 instead of 2) or leaks the validation error onto stdout
    const { transferCalculator } = makeRealServices();
    const stdoutCapture = makeCaptureStream();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runExplainCommand(
      { asOf: 'not-a-date', json: true },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: false,
        clock: () => '2026-06-28',
        stdout: stdoutCapture.stream,
        stderr: stderrCapture.stream,
      },
    );

    expect(exitCode).toBe(2);
    expect(stderrCapture.getText()).toContain('must be ISO 8601');
    expect(stdoutCapture.getText()).toBe('');
  });

  it('adds a final-line INVALID_ARGUMENT envelope on stderr under --json (story-4.4b newly-reachable path)', async () => {
    const { transferCalculator } = makeRealServices();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runExplainCommand(
      { asOf: 'not-a-date', json: true },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: false,
        clock: () => '2026-06-28',
        stdout: makeCaptureStream().stream,
        stderr: stderrCapture.stream,
      },
    );

    expect(exitCode).toBe(2);
    const lines = stderrCapture.getText().trim().split('\n');
    const envelope = JSON.parse(lines[lines.length - 1]) as { command: string; ok: boolean; error: { code: string; message: string } };
    expect(envelope.command).toBe('explain');
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('INVALID_ARGUMENT');
    expect(envelope.error.message).toContain('must be ISO 8601');
  });

  it('validation failure under non-json mode stays prose-only (no envelope line)', async () => {
    const { transferCalculator } = makeRealServices();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runExplainCommand(
      { asOf: 'not-a-date', json: false },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: false,
        clock: () => '2026-06-28',
        stdout: makeCaptureStream().stream,
        stderr: stderrCapture.stream,
      },
    );

    expect(exitCode).toBe(2);
    expect(() => JSON.parse(stderrCapture.getText().trim())).toThrow();
  });
});
