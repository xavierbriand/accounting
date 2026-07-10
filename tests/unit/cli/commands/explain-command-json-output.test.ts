/**
 * End-to-end unit tests for `runExplainCommand` + the JSON formatter (story-4.3b,
 * Slice 4). These exercise orchestration behaviour (exit codes, clock wiring, the
 * silent-zero-trap guard, tolerant calc-failure rendering) THROUGH the real JSON
 * formatter, since that's the only way to observe the assembled report's content
 * from the command's public entry point — hence committed alongside
 * explain-formatter-json.ts rather than explain-command.test.ts (Slice 2), whose
 * own tests exercise `assembleExplainReport` directly and never reach a formatter.
 */
import { describe, it, expect } from 'vitest';
import { runExplainCommand } from '../../../../src/cli/commands/explain-command.js';
import { SplitRulesService } from '../../../../src/core/splits/split-rules-service.js';
import { BufferStateService } from '../../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../../src/core/recurring/recurring-forecast-service.js';
import { SafeTransferCalculator } from '../../../../src/core/transfer/safe-transfer-calculator.js';
import { Money } from '../../../../src/core/shared/money.js';
import { Result } from '../../../../src/core/shared/result.js';
import type { BufferLedgerQuery } from '../../../../src/core/ports/buffer-ledger-query.js';
import type { ContributionQuery, ContributionsInWindow } from '../../../../src/core/ports/contribution-query.js';

function eur(cents: number): Money {
  const r = Money.fromCents(cents, 'EUR');
  if (r.isFailure) throw new Error(r.error);
  return r.value;
}

function makeCaptureStream(): { stream: NodeJS.WritableStream; getText: () => string } {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string) { chunks.push(chunk); return true; },
  } as unknown as NodeJS.WritableStream;
  return { stream, getText: () => chunks.join('') };
}

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

describe('runExplainCommand — JSON output shape', () => {
  it('returns exit 0 and a JSON document with all required top-level keys', async () => {
    // fails if runExplainCommand's happy path flips the exit code or assembleExplainReport/formatExplainJson drops a top-level section
    const { transferCalculator } = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    const exitCode = await runExplainCommand(
      { asOf: '2026-06-28', json: true },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: true,
        clock: () => 'wrong-date',
        stdout: stdoutCapture.stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(exitCode).toBe(0);
    const envelope = JSON.parse(stdoutCapture.getText()) as { command: string; ok: boolean; data: Record<string, unknown> };
    expect(envelope.command).toBe('explain');
    expect(envelope.ok).toBe(true);
    expect(Object.keys(envelope.data)).toEqual(expect.arrayContaining(['asOf', 'thisWindow', 'lastWindow', 'variance', 'followThrough']));
  });

  it('uses --as-of over the clock, and derives thisWindow/lastWindow one calendar month apart', async () => {
    // fails if runExplainCommand consults clock() despite --as-of, or composes the windows from anything but nextCalendarMonth/previousSettleWindow
    const { transferCalculator } = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runExplainCommand(
      { asOf: '2026-06-28', json: true },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: true,
        clock: () => 'wrong-date',
        stdout: stdoutCapture.stream,
        stderr: makeCaptureStream().stream,
      },
    );

    const envelope = JSON.parse(stdoutCapture.getText()) as { data: { asOf: string; thisWindow: { from: string; to: string }; lastWindow: { from: string; to: string } } };
    expect(envelope.data.asOf).toBe('2026-06-28');
    expect(envelope.data.thisWindow).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(envelope.data.lastWindow).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('falls back to the clock when --as-of is omitted', async () => {
    // fails if runExplainCommand's asOf default (opts.asOf ?? clock()) stops consulting the injected clock, breaking bare `explain` runs
    const { transferCalculator } = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runExplainCommand(
      { json: true },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: true,
        clock: () => '2026-06-28',
        stdout: stdoutCapture.stream,
        stderr: makeCaptureStream().stream,
      },
    );

    const envelope = JSON.parse(stdoutCapture.getText()) as { data: { asOf: string } };
    expect(envelope.data.asOf).toBe('2026-06-28');
  });

  it('returns exit 1, nothing structural to stdout, when the contribution query fails', async () => {
    // fails if runExplainCommand tolerates a contributionQuery failure like a calc failure (exit 0 + degraded section) instead of the unrecoverable DB-level exit 1
    const { transferCalculator } = makeRealServices();
    const stdoutCapture = makeCaptureStream();
    const stderrCapture = makeCaptureStream();
    const failingQuery: ContributionQuery = {
      contributionsInWindow(): Result<ContributionsInWindow> {
        return Result.fail('main-account: currency mismatch — expected EUR, found USD');
      },
    };

    const exitCode = await runExplainCommand(
      { asOf: '2026-06-28', json: true },
      {
        transferCalculator,
        contributionQuery: failingQuery,
        settlementConfigured: true,
        clock: () => '2026-06-28',
        stdout: stdoutCapture.stream,
        stderr: stderrCapture.stream,
      },
    );

    expect(exitCode).toBe(1);
    expect(stderrCapture.getText()).toContain('currency mismatch');
    expect(stdoutCapture.getText()).toBe('');
  });

  it('adds a final-line QUERY_FAILURE envelope on stderr when the contribution query fails (story-4.4b newly-reachable path)', async () => {
    // fails if: explain-command.ts:154-159's writeJsonErrorIf(..., 'QUERY_FAILURE', ...)
    // (line 157) is missing or the contributionsResult.error message is dropped
    const { transferCalculator } = makeRealServices();
    const stdoutCapture = makeCaptureStream();
    const stderrCapture = makeCaptureStream();
    const failingQuery: ContributionQuery = {
      contributionsInWindow(): Result<ContributionsInWindow> {
        return Result.fail('main-account: currency mismatch — expected EUR, found USD');
      },
    };

    await runExplainCommand(
      { asOf: '2026-06-28', json: true },
      {
        transferCalculator,
        contributionQuery: failingQuery,
        settlementConfigured: true,
        clock: () => '2026-06-28',
        stdout: stdoutCapture.stream,
        stderr: stderrCapture.stream,
      },
    );

    const lines = stderrCapture.getText().trim().split('\n');
    const envelope = JSON.parse(lines[lines.length - 1]) as { command: string; ok: boolean; error: { code: string; message: string } };
    expect(envelope.command).toBe('explain');
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('QUERY_FAILURE');
    expect(envelope.error.message).toContain('currency mismatch');
  });

  it('never calls the last-month calculation with the same asOf as this month (silent-zero-trap guard)', async () => {
    // fails if runExplainCommand passes the original asOf to the last-month calculateForWindow run instead of previousSettleWindow's asOfLast — the fill-slot silent-zero trap
    const balancePoints = new Map([
      ['vacation-account', [
        { asOfDate: '2026-05-28', cents: 50000 },
        { asOfDate: '2026-06-28', cents: 150000 },
      ]],
    ]);
    const { transferCalculator } = makeRealServices({ bufferTargetCents: 100000, bufferTargetDate: '2026-01-01', balancePoints });
    const asOfArgsSeen: string[] = [];
    const recordingCalculator = {
      calculateForWindow: (asOf: string, from: string, to: string) => {
        asOfArgsSeen.push(asOf);
        return transferCalculator.calculateForWindow(asOf, from, to);
      },
    } as SafeTransferCalculator;
    const stdoutCapture = makeCaptureStream();

    await runExplainCommand(
      { asOf: '2026-06-28', json: true },
      {
        transferCalculator: recordingCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: true,
        clock: () => '2026-06-28',
        stdout: stdoutCapture.stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(asOfArgsSeen).toEqual(['2026-06-28', '2026-05-28']);
  });

  it('renders a tolerated calc failure with a Suggested action naming the stale buffer, exit 0', async () => {
    // fails if buildVarianceSection stops degrading a calc failure to {error, suggestedAction} (buildSuggestedAction naming the bucket) or the failure suppresses follow-through/flips the exit code
    // Fixture: as of last month the buffer was below target and past its targetDate (fails);
    // by this month it has been topped up past target, so status flips away from 'below' and
    // the topup path is skipped entirely (succeeds) — this is the only way one
    // calculateForWindow call can fail while the other succeeds (staleness is monotonic).
    const balancePoints = new Map([
      ['vacation-account', [
        { asOfDate: '2026-05-28', cents: 50000 },
        { asOfDate: '2026-06-28', cents: 150000 },
      ]],
    ]);
    const { transferCalculator } = makeRealServices({ bufferTargetCents: 100000, bufferTargetDate: '2026-01-01', balancePoints });
    const stdoutCapture = makeCaptureStream();

    const exitCode = await runExplainCommand(
      { asOf: '2026-06-28', json: true },
      {
        transferCalculator,
        contributionQuery: makeContributionQuery(emptyContributions),
        settlementConfigured: true,
        clock: () => '2026-06-28',
        stdout: stdoutCapture.stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(exitCode).toBe(0);
    const envelope = JSON.parse(stdoutCapture.getText()) as { data: { variance: { error?: string; suggestedAction?: string }; followThrough: { totalActual?: string } } };
    expect(envelope.data.variance.suggestedAction).toContain('Vacation');
    expect(typeof envelope.data.followThrough.totalActual).toBe('string');
  });
});
