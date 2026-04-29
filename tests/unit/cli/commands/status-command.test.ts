/**
 * Unit + property tests for runStatusCommand happy path, JSON output, and service-wiring.
 * Stories 3.5 — Slice 2 (RED) and Slice 3 (GREEN).
 *
 * Property test sanity checks (Story 3.3 retro action B):
 * - Property #1: If formatStatusJson omitted buffers or used a wrong key, JSON.parse would be
 *   missing keys → test fails.
 * - Property #2: If JSON formatter emitted wrong cents or human formatter dropped the amount,
 *   parseInt comparison would fail.
 * - Property #3 (clock): If runStatusCommand always called clock(), test would fail when asOf
 *   is provided. If it never called clock(), test would fail when asOf is undefined.
 * - Property #4a: If forecastBetween received wrong from/to, recorded args wouldn't match.
 * - Property #4b: If getStateAsOf received wrong asOf, recorded args wouldn't match.
 * - Property #4c: If calculateForWindow received args in wrong order, recorded args wouldn't match.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { runStatusCommand } from '../../../../src/cli/commands/status-command.js';
import { BufferStateService } from '../../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../../src/core/recurring/recurring-forecast-service.js';
import { SplitRulesService } from '../../../../src/core/splits/split-rules-service.js';
import { SafeTransferCalculator } from '../../../../src/core/transfer/safe-transfer-calculator.js';
import { Money } from '../../../../src/core/shared/money.js';
import { Result } from '../../../../src/core/shared/result.js';
import type { BufferLedgerQuery } from '../../../../src/core/ports/buffer-ledger-query.js';
import type { BufferState } from '../../../../src/core/buffers/buffer-state.js';
import type { ForecastOccurrence } from '../../../../src/core/recurring/forecast-occurrence.js';
import type { SafeTransferCalculation } from '../../../../src/core/transfer/safe-transfer-calculation.js';

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeMoneyEUR(cents: number): Money {
  const r = Money.fromCents(cents, 'EUR');
  if (r.isFailure) throw new Error(r.error);
  return r.value;
}

function makeZeroLedger(): BufferLedgerQuery {
  return {
    sumEntriesByAccount(_account: string, currency: string): Result<Money> {
      return Money.fromCents(0, currency);
    },
  };
}

function makeCaptureStream(): { stream: NodeJS.WritableStream; getText: () => string } {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string) { chunks.push(chunk); return true; },
  } as unknown as NodeJS.WritableStream;
  return { stream, getText: () => chunks.join('') };
}

function makeRealServices(opts: {
  bufferTargetCents?: number;
  bufferTargetDate?: string;
  netflixAmountCents?: number;
  netflixValidFrom?: string;
} = {}): {
  buffersService: BufferStateService;
  forecastService: RecurringForecastService;
  transferCalculator: SafeTransferCalculator;
} {
  const {
    bufferTargetCents = 120000,
    bufferTargetDate = '2026-12-01',
    netflixAmountCents = 1299,
    netflixValidFrom = '2026-01-15',
  } = opts;

  const targetMoney = makeMoneyEUR(bufferTargetCents);
  const netflixMoney = makeMoneyEUR(netflixAmountCents);
  const ledger = makeZeroLedger();

  const splitsService = new SplitRulesService([
    {
      validFrom: '2024-01-01',
      rules: [
        { partner: 'Alex', ratio: 0.6 },
        { partner: 'Sam', ratio: 0.4 },
      ],
    },
  ]);

  const buffersService = new BufferStateService(
    [{ name: 'Vacation', account: 'vacation-account', target: targetMoney, targetDate: bufferTargetDate }],
    'EUR',
    ledger,
  );

  const forecastService = new RecurringForecastService([
    {
      name: 'Netflix',
      category: 'Subscriptions',
      cadence: 'monthly',
      amount: netflixMoney,
      validFrom: netflixValidFrom,
      amendments: [],
    },
  ]);

  const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, 'EUR');

  return { buffersService, forecastService, transferCalculator };
}

// ─── Structural report tests ───────────────────────────────────────────────────

describe('runStatusCommand — JSON output shape', () => {
  it('returns exit code 0 and writes valid JSON with all required top-level keys', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      {
        ...services,
        clock: () => '2026-04-29',
        stdout: stdoutCapture.stream,
        stderr: stderrCapture.stream,
      },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdoutCapture.getText()) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['asOf', 'window', 'buffers', 'transfer', 'forecast']));
    expect(Object.keys(parsed)).toHaveLength(5);
  });

  it('sets asOf from the --as-of option', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => 'wrong-date', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const parsed = JSON.parse(stdoutCapture.getText()) as { asOf: string };
    expect(parsed.asOf).toBe('2026-04-29');
  });

  it('computes default window from asOf: May when asOf is 2026-04-29', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const parsed = JSON.parse(stdoutCapture.getText()) as { window: { from: string; to: string } };
    expect(parsed.window.from).toBe('2026-05-01');
    expect(parsed.window.to).toBe('2026-05-31');
  });

  it('respects --from / --to overrides', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-07-01', to: '2026-09-30', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const parsed = JSON.parse(stdoutCapture.getText()) as { window: { from: string; to: string } };
    expect(parsed.window.from).toBe('2026-07-01');
    expect(parsed.window.to).toBe('2026-09-30');
  });

  it('returns exit code 2 for invalid --as-of format', async () => {
    const services = makeRealServices();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runStatusCommand(
      { asOf: 'not-a-date', json: true },
      { ...services, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: stderrCapture.stream },
    );

    expect(exitCode).toBe(2);
    expect(stderrCapture.getText()).toContain('must be ISO 8601');
    expect(stderrCapture.getText()).toContain('got');
  });

  it('returns exit code 2 when from > to', async () => {
    const services = makeRealServices();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-09-30', to: '2026-07-01', json: false },
      { ...services, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: stderrCapture.stream },
    );

    expect(exitCode).toBe(2);
    expect(stderrCapture.getText()).toContain('from');
    expect(stderrCapture.getText()).toContain('to');
  });

  it('serializes buffers with Money.toString() and null for undefined cap', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const parsed = JSON.parse(stdoutCapture.getText()) as {
      buffers: Array<{ name: string; balance: string; target: string; cap: null | string; status: string; targetDate: string }>;
    };
    expect(parsed.buffers).toHaveLength(1);
    const buf = parsed.buffers[0];
    expect(buf.name).toBe('Vacation');
    expect(buf.balance).toMatch(/^EUR \d+\.\d{2}$/);
    expect(buf.target).toMatch(/^EUR \d+\.\d{2}$/);
    expect(buf.cap).toBeNull();
    expect(buf.status).toBe('below');
    expect(buf.targetDate).toBe('2026-12-01');
  });

  it('serializes transfer.perPartner as a plain object (not empty from Map)', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const parsed = JSON.parse(stdoutCapture.getText()) as {
      transfer: { perPartner: Record<string, string> };
    };
    expect(Object.keys(parsed.transfer.perPartner)).toEqual(expect.arrayContaining(['Alex', 'Sam']));
    expect(parsed.transfer.perPartner['Alex']).toMatch(/^EUR/);
    expect(parsed.transfer.perPartner['Sam']).toMatch(/^EUR/);
  });

  it('uses date field (not expectedDate) for forecast entries in JSON', async () => {
    const services = makeRealServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const parsed = JSON.parse(stdoutCapture.getText()) as {
      forecast: Array<Record<string, unknown>>;
    };
    expect(parsed.forecast.length).toBeGreaterThan(0);
    const first = parsed.forecast[0];
    expect('date' in first).toBe(true);
    expect('expectedDate' in first).toBe(false);
  });
});

// ─── nextCalendarMonth edge cases ─────────────────────────────────────────────

describe('nextCalendarMonth edge cases', () => {
  it('year rollover: 2026-12-15 → { from: 2027-01-01, to: 2027-01-31 }', async () => {
    const { nextCalendarMonth } = await import('../../../../src/cli/commands/status-command.js');
    expect(nextCalendarMonth('2026-12-15')).toEqual({ from: '2027-01-01', to: '2027-01-31' });
  });

  it('non-leap Feb: 2026-02-28 → { from: 2026-03-01, to: 2026-03-31 }', async () => {
    const { nextCalendarMonth } = await import('../../../../src/cli/commands/status-command.js');
    expect(nextCalendarMonth('2026-02-28')).toEqual({ from: '2026-03-01', to: '2026-03-31' });
  });

  it('Feb 28 target (non-leap): 2026-01-31 → { from: 2026-02-01, to: 2026-02-28 }', async () => {
    const { nextCalendarMonth } = await import('../../../../src/cli/commands/status-command.js');
    expect(nextCalendarMonth('2026-01-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('leap-year Feb: 2024-01-15 → { from: 2024-02-01, to: 2024-02-29 }', async () => {
    const { nextCalendarMonth } = await import('../../../../src/cli/commands/status-command.js');
    expect(nextCalendarMonth('2024-01-15')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('leap-day anchor: 2024-02-29 → { from: 2024-03-01, to: 2024-03-31 }', async () => {
    const { nextCalendarMonth } = await import('../../../../src/cli/commands/status-command.js');
    expect(nextCalendarMonth('2024-02-29')).toEqual({ from: '2024-03-01', to: '2024-03-31' });
  });
});

// ─── Property #3: clock recording-fake ────────────────────────────────────────

describe('Property #3: clock recording-fake', () => {
  it('clock is NOT called when asOf is provided', async () => {
    const services = makeRealServices();
    let clockCalls = 0;
    const clock = () => { clockCalls++; return '2026-04-29'; };

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock, stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
    );

    expect(clockCalls).toBe(0);
  });

  it('clock IS called exactly once when asOf is undefined', async () => {
    const services = makeRealServices();
    let clockCalls = 0;
    const clock = () => { clockCalls++; return '2026-04-29'; };

    await runStatusCommand(
      { json: true },
      { ...services, clock, stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
    );

    expect(clockCalls).toBe(1);
  });
});

// ─── Property #4a: RecurringForecastService wiring ────────────────────────────

describe('Property #4a: forecastService wiring recording-fake', () => {
  it('forecastBetween receives computed window from/to', async () => {
    const services = makeRealServices();
    let capturedFrom: string | undefined;
    let capturedTo: string | undefined;

    const recordingForecastService = {
      forecastBetween(from: string, to: string): Result<readonly ForecastOccurrence[]> {
        capturedFrom = from;
        capturedTo = to;
        return Result.ok([]);
      },
    } as unknown as RecurringForecastService;

    const splitsService = new SplitRulesService([{
      validFrom: '2024-01-01',
      rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }],
    }]);
    const transferCalc = new SafeTransferCalculator(splitsService, services.buffersService, recordingForecastService, 'EUR');

    await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-07-01', to: '2026-09-30', json: true },
      {
        buffersService: services.buffersService,
        forecastService: recordingForecastService,
        transferCalculator: transferCalc,
        clock: () => '2026-04-29',
        stdout: makeCaptureStream().stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(capturedFrom).toBe('2026-07-01');
    expect(capturedTo).toBe('2026-09-30');
  });
});

// ─── Property #4b: BufferStateService wiring ──────────────────────────────────

describe('Property #4b: buffersService wiring recording-fake', () => {
  it('getStateAsOf receives asOf (not from)', async () => {
    let capturedAsOf: string | undefined;

    const recordingBuffersService = {
      getStateAsOf(asOf: string): Result<readonly BufferState[]> {
        capturedAsOf = asOf;
        return Result.ok([]);
      },
    } as unknown as BufferStateService;

    const splitsService = new SplitRulesService([{
      validFrom: '2024-01-01',
      rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }],
    }]);
    const forecastService = new RecurringForecastService([]);
    const transferCalc = new SafeTransferCalculator(splitsService, recordingBuffersService, forecastService, 'EUR');

    await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-07-01', to: '2026-09-30', json: true },
      {
        buffersService: recordingBuffersService,
        forecastService,
        transferCalculator: transferCalc,
        clock: () => '2026-04-29',
        stdout: makeCaptureStream().stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(capturedAsOf).toBe('2026-04-29');
  });
});

// ─── Property #4c: SafeTransferCalculator wiring ─────────────────────────────

describe('Property #4c: transferCalculator wiring recording-fake', () => {
  it('calculateForWindow receives (asOf, from, to) in the right order', async () => {
    let capturedAsOf: string | undefined;
    let capturedFrom: string | undefined;
    let capturedTo: string | undefined;

    const recordingCalc = {
      calculateForWindow(asOf: string, from: string, to: string): Result<SafeTransferCalculation> {
        capturedAsOf = asOf;
        capturedFrom = from;
        capturedTo = to;
        const totalRequired = makeMoneyEUR(0);
        return Result.ok({ totalRequired, perPartner: new Map(), lineItems: [] });
      },
    } as unknown as SafeTransferCalculator;

    const services = makeRealServices();

    await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-07-01', to: '2026-09-30', json: true },
      {
        buffersService: services.buffersService,
        forecastService: services.forecastService,
        transferCalculator: recordingCalc,
        clock: () => '2026-04-29',
        stdout: makeCaptureStream().stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(capturedAsOf).toBe('2026-04-29');
    expect(capturedFrom).toBe('2026-07-01');
    expect(capturedTo).toBe('2026-09-30');
  });
});

// ─── Property #5: default-window purity ───────────────────────────────────────

describe('Property #5: nextCalendarMonth purity', () => {
  it('same input always produces same output (deterministic)', async () => {
    const { nextCalendarMonth } = await import('../../../../src/cli/commands/status-command.js');
    const inputs = ['2026-01-15', '2026-12-31', '2026-06-30', '2024-02-01'];
    for (const input of inputs) {
      const result1 = nextCalendarMonth(input);
      const result2 = nextCalendarMonth(input);
      expect(result1).toEqual(result2);
    }
  });

  it('source files in src/cli/commands/status-*.ts contain no parameterless new Date() or Date.now or performance.now', async () => {
    // fails if a future edit silently introduces a system-clock read into the
    // CLI command layer (the only legitimate touchpoint is node-clock.ts, which
    // is exempt — it's the single boundary surface).
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    const url = await import('node:url');
    const here = pathMod.dirname(url.fileURLToPath(import.meta.url));
    const dir = pathMod.resolve(here, '../../../../src/cli/commands');
    const files = fs.readdirSync(dir).filter(f => f.startsWith('status-') && f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const forbidden = /\bDate\.now\b|\bperformance\.now\b|\bnew\s+Date\s*\(\s*\)/;
    for (const file of files) {
      const content = fs.readFileSync(pathMod.join(dir, file), 'utf8');
      expect(content, `forbidden clock pattern in src/cli/commands/${file}`).not.toMatch(forbidden);
    }
  });
});

// ─── Property #6: exit-0 for buffer-state success regardless of calc failure ──

describe('Property #6: exit code stays 0 when buffers succeed even if calc fails', () => {
  it('stale targetDate calc-fail + non-empty buffers → exit 0', async () => {
    const services = makeRealServices({ bufferTargetDate: '2026-04-01' });
    const stderrCapture = makeCaptureStream();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { ...services, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: stderrCapture.stream },
    );

    expect(exitCode).toBe(0);
  });

  it('from>to is intercepted at the CLI level and exits 2 (not exit 0; calc never reached)', async () => {
    // This case clarifies the boundary between CLI-level input validation (exit 2)
    // and calc-level Result.fail (exit 0). The plan's Property #6 "all four cases
    // exit 0" assumed all four reached the calculator; from>to never does.
    const splitsService = new SplitRulesService([{
      validFrom: '2024-01-01',
      rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }],
    }]);
    const buffersService = new BufferStateService([], 'EUR', makeZeroLedger());
    const forecastService = new RecurringForecastService([]);
    const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, 'EUR');

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-09-30', to: '2026-07-01', json: false },
      { buffersService, forecastService, transferCalculator, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
    );

    expect(exitCode).toBe(2);
  });

  it('stale targetDate calc-fail + empty buffers → exit 0 (no buckets but buffer-state succeeded)', async () => {
    // Plan-spec gap closer: when buffers config has zero buckets AND the calculator
    // returns a stale-targetDate-style failure (here engineered via a calc that
    // rejects the empty roster), exit code stays 0 because BufferStateService
    // succeeded. Exit 1 is reserved for getStateAsOf failure only.
    const splitsService = new SplitRulesService([{
      validFrom: '2024-01-01',
      rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }],
    }]);
    const buffersService = new BufferStateService([], 'EUR', makeZeroLedger());
    const forecastService = new RecurringForecastService([]);
    // Inject a transferCalculator stub that returns Result.fail to simulate stale-targetDate
    // even with zero buckets in config. The CLI must still exit 0 because buffers rendered.
    const failingCalc = {
      calculateForWindow(): Result<never> {
        return Result.fail('buffer "Synthetic" is below target and its targetDate (2026-04-01) has passed — set a new targetDate');
      },
    } as unknown as SafeTransferCalculator;

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { buffersService, forecastService, transferCalculator: failingCalc, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
    );

    expect(exitCode).toBe(0);
    // splitsService is referenced to satisfy the closure tests' real-services pattern
    expect(splitsService).toBeDefined();
  });

  it('calc returns Result.fail with an ISO-validation-style message → exit 0 (via buildSuggestedAction fallback)', async () => {
    // Exercises the buildSuggestedAction fallback branch (no `buffer "name"` substring
    // in the calc error). Plan-spec gap closer for the "ISO calc input-validation"
    // case in Property #6.
    const splitsService = new SplitRulesService([{
      validFrom: '2024-01-01',
      rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }],
    }]);
    const buffersService = new BufferStateService([], 'EUR', makeZeroLedger());
    const forecastService = new RecurringForecastService([]);
    const isoFailingCalc = {
      calculateForWindow(): Result<never> {
        return Result.fail('asOf, from, and to must be ISO 8601 dates (YYYY-MM-DD): got asOf="bad", from="2026-05-01", to="2026-05-31"');
      },
    } as unknown as SafeTransferCalculator;

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { buffersService, forecastService, transferCalculator: isoFailingCalc, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
    );

    expect(exitCode).toBe(0);
    expect(splitsService).toBeDefined();
  });

  it('buffer-state service failure → exit 1', async () => {
    const failingBuffersService = {
      getStateAsOf(): Result<readonly BufferState[]> {
        return Result.fail('DB unreachable');
      },
    } as unknown as BufferStateService;

    const services = makeRealServices();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      {
        buffersService: failingBuffersService,
        forecastService: services.forecastService,
        transferCalculator: services.transferCalculator,
        clock: () => '2026-04-29',
        stdout: makeCaptureStream().stream,
        stderr: makeCaptureStream().stream,
      },
    );

    expect(exitCode).toBe(1);
  });
});

// ─── Property #7: from > to exits 2 ─────────────────────────────────────────

describe('Property #7: --from > --to exits with code 2', () => {
  it('generates two ISO dates and when from > to returns 2', async () => {
    const services = makeRealServices();
    const stderrCapture = makeCaptureStream();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', from: '2026-08-01', to: '2026-07-01', json: false },
      { ...services, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: stderrCapture.stream },
    );

    expect(exitCode).toBe(2);
    const errText = stderrCapture.getText();
    expect(errText.length).toBeGreaterThan(0);
  });

  it('fast-check: whenever from > to, always exits 2', async () => {
    const isoDateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
      .map(d => d.toISOString().slice(0, 10));

    await fc.assert(
      fc.asyncProperty(
        isoDateArb,
        isoDateArb,
        async (d1, d2) => {
          const [biggerDate, smallerDate] = d1 > d2 ? [d1, d2] : [d2, d1];
          if (biggerDate === smallerDate) return; // same date: skip
          const services = makeRealServices();

          const exitCode = await runStatusCommand(
            { asOf: '2026-04-29', from: biggerDate, to: smallerDate, json: false },
            { ...services, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
          );

          expect(exitCode).toBe(2);
        },
      ),
      { numRuns: 50 },
    );
  });
});
