/**
 * Unit tests for stale-targetDate inline-warn UX (Story 3.5, Slice 6).
 *
 * Tests cover the JSON failure shape (error + suggestedAction, no totalRequired/perPartner/lineItems)
 * and the human formatter's inline-warn rendering (buffers shown, "Suggested action" message,
 * no "Total transfer for" prose).
 *
 * NOTE: These tests are written in Slice 6 but the underlying behaviour was already implemented
 * in Slice 3 (assembleStatusReport + buildSuggestedAction). See Deviations in the return report.
 * The tests are still valuable as coverage evidence and regression guards.
 *
 * Property test sanity check (Story 3.3 retro action B):
 * - If the JSON shape emitted `totalRequired` when calc fails, the `not.toHaveProperty` would
 *   fail → non-vacuous.
 * - If the suggestedAction omitted the bucket name or "targetDate", the toContain would fail.
 */
import { describe, it, expect } from 'vitest';
import { runStatusCommand } from '../../../../src/cli/commands/status-command.js';
import { BufferStateService } from '../../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../../src/core/recurring/recurring-forecast-service.js';
import { SplitRulesService } from '../../../../src/core/splits/split-rules-service.js';
import { SafeTransferCalculator } from '../../../../src/core/transfer/safe-transfer-calculator.js';
import { Money } from '../../../../src/core/shared/money.js';
import type { BufferLedgerQuery } from '../../../../src/core/ports/buffer-ledger-query.js';
import { Result } from '../../../../src/core/shared/result.js';

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

function makeStaleServices(): {
  buffersService: BufferStateService;
  forecastService: RecurringForecastService;
  transferCalculator: SafeTransferCalculator;
} {
  const splitsService = new SplitRulesService([{
    validFrom: '2024-01-01',
    rules: [{ partner: 'Alex', ratio: 0.6 }, { partner: 'Sam', ratio: 0.4 }],
  }]);

  const carTarget = makeMoneyEUR(50000);
  const buffersService = new BufferStateService(
    [{ name: 'Car', account: 'car-account', target: carTarget, targetDate: '2026-04-01' }],
    'EUR',
    makeZeroLedger(),
  );

  const forecastService = new RecurringForecastService([]);
  const transferCalculator = new SafeTransferCalculator(splitsService, buffersService, forecastService, 'EUR');

  return { buffersService, forecastService, transferCalculator };
}

// ─── JSON output for calc-failure ─────────────────────────────────────────────

describe('stale-targetDate: JSON output shape (story-4.4b: enveloped)', () => {
  it('JSON transfer has error and suggestedAction fields (not totalRequired)', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    expect(exitCode).toBe(0);
    const envelope = JSON.parse(stdoutCapture.getText()) as {
      command: string;
      ok: boolean;
      data: { transfer: Record<string, unknown> };
    };

    expect(envelope.command).toBe('status');
    expect(envelope.ok).toBe(true);
    expect(envelope.data.transfer).toHaveProperty('error');
    expect(envelope.data.transfer).toHaveProperty('suggestedAction');
    expect(envelope.data.transfer).not.toHaveProperty('totalRequired');
    expect(envelope.data.transfer).not.toHaveProperty('perPartner');
    expect(envelope.data.transfer).not.toHaveProperty('lineItems');
  });

  it('suggestedAction names the offending bucket ("Car")', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const envelope = JSON.parse(stdoutCapture.getText()) as {
      data: { transfer: { suggestedAction: string } };
    };

    expect(envelope.data.transfer.suggestedAction).toContain('Car');
  });

  it('suggestedAction references the YAML field "targetDate"', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const envelope = JSON.parse(stdoutCapture.getText()) as {
      data: { transfer: { suggestedAction: string } };
    };

    expect(envelope.data.transfer.suggestedAction).toContain('targetDate');
  });

  it('JSON buffers are still present and show "Car" with status "below"', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: true },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const envelope = JSON.parse(stdoutCapture.getText()) as {
      data: { buffers: Array<{ name: string; status: string }> };
    };

    expect(envelope.data.buffers).toHaveLength(1);
    expect(envelope.data.buffers[0].name).toBe('Car');
    expect(envelope.data.buffers[0].status).toBe('below');
  });
});

// ─── Human output for calc-failure ────────────────────────────────────────────

describe('stale-targetDate: human output', () => {
  it('exit code is 0', async () => {
    const services = makeStaleServices();

    const exitCode = await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { ...services, clock: () => '2026-04-29', stdout: makeCaptureStream().stream, stderr: makeCaptureStream().stream },
    );

    expect(exitCode).toBe(0);
  });

  it('buffer table shows "Car" and "below"', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const output = stdoutCapture.getText();
    expect(output).toContain('Car');
    expect(output).toContain('below');
  });

  it('shows "Suggested action" text', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    expect(stdoutCapture.getText()).toContain('Suggested action');
  });

  it('does NOT show "Total transfer for" when calc fails', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    expect(stdoutCapture.getText()).not.toContain('Total transfer for');
  });

  it('suggestedAction text references "Car" and "targetDate"', async () => {
    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      { ...services, clock: () => '2026-04-29', stdout: stdoutCapture.stream, stderr: makeCaptureStream().stream },
    );

    const output = stdoutCapture.getText();
    expect(output).toContain('Car');
    expect(output).toContain('targetDate');
  });
});

// ─── buildSuggestedAction fallback branch ──────────────────────────────────────

describe('buildSuggestedAction fallback — error without buffer name', () => {
  it('shows generic fallback when calc error has no "buffer \\"...\\""', async () => {
    // Inject a calc that fails with a generic error (no buffer name pattern)
    const recordingCalc = {
      calculateForWindow(): Result<never> {
        return Result.fail('ISO validation failed — generic error without buffer name');
      },
    } as unknown as SafeTransferCalculator;

    const services = makeStaleServices();
    const stdoutCapture = makeCaptureStream();

    await runStatusCommand(
      { asOf: '2026-04-29', json: false },
      {
        buffersService: services.buffersService,
        forecastService: services.forecastService,
        transferCalculator: recordingCalc,
        clock: () => '2026-04-29',
        stdout: stdoutCapture.stream,
        stderr: makeCaptureStream().stream,
      },
    );

    const output = stdoutCapture.getText();
    expect(output).toContain('Suggested action');
    // Fallback prose when bucket name can't be extracted from error
    expect(output).toContain('accounting.yaml');
  });
});
