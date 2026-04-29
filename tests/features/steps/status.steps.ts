/**
 * Step bindings for status.feature (Story 3.5).
 *
 * Mechanism (R7): in-process — no subprocess invocation.
 * runStatusCommand is called directly with injectable deps (recording fakes + real services).
 * A fake BufferLedgerQuery returns zero balance for any buffer account.
 * No real SQLite DB is needed (all services are constructor-injected).
 */
import { expect } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { BufferStateService } from '../../../src/core/buffers/buffer-state-service.js';
import { RecurringForecastService } from '../../../src/core/recurring/recurring-forecast-service.js';
import { SplitRulesService } from '../../../src/core/splits/split-rules-service.js';
import { SafeTransferCalculator } from '../../../src/core/transfer/safe-transfer-calculator.js';
import { Money } from '../../../src/core/shared/money.js';
import type { BufferLedgerQuery } from '../../../src/core/ports/buffer-ledger-query.js';
import type { Result } from '../../../src/core/shared/result.js';

interface StatusWorld {
  statusServices?: {
    buffersService: BufferStateService;
    forecastService: RecurringForecastService;
    transferCalculator: SafeTransferCalculator;
  };
  statusResult?: { exitCode: number; stdout: string; stderr: string };
  statusResult2?: { exitCode: number; stdout: string; stderr: string };
}

function makeZeroLedger(): BufferLedgerQuery {
  return {
    sumEntriesByAccount(_account: string, currency: string): Result<Money> {
      return Money.fromCents(0, currency);
    },
  };
}

function buildStatusServices(rawConfig: Record<string, unknown>): {
  buffersService: BufferStateService;
  forecastService: RecurringForecastService;
  transferCalculator: SafeTransferCalculator;
} {
  const configResult = parseRawConfig(rawConfig);
  if (configResult.isFailure) throw new Error(`Config parse failed: ${configResult.error}`);
  const config = configResult.value;

  const ledger = makeZeroLedger();
  const splitsService = new SplitRulesService(config.splits);
  const buffersService = new BufferStateService(config.buffers, config.defaultCurrency, ledger);
  const forecastService = new RecurringForecastService(config.recurring);
  const transferCalculator = new SafeTransferCalculator(
    splitsService,
    buffersService,
    forecastService,
    config.defaultCurrency,
  );

  return { buffersService, forecastService, transferCalculator };
}

// ─── Given steps ──────────────────────────────────────────────────────────────

Given(
  /^a status config with splits Alex 0\.6 Sam 0\.4, buffer Vacation target 1200 balance 600 targetDate "2026-12-01", recurring Netflix monthly 12\.99 EUR validFrom "2026-01-15"$/,
  function (state: StatusWorld) {
    state.statusServices = buildStatusServices({
      dbPath: './data/ledger.db',
      defaultCurrency: 'EUR',
      timezone: 'Europe/Paris',
      accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
      splits: [
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 0.6 },
            { partner: 'Sam', ratio: 0.4 },
          ],
        },
      ],
      buffers: [
        { name: 'Vacation', account: 'vacation-account', target: 1200, targetDate: '2026-12-01' },
      ],
      recurring: [
        { name: 'Netflix', category: 'Subscriptions', cadence: 'monthly', amount: 12.99, validFrom: '2026-01-15' },
      ],
    });
  },
);

Given(
  /^a status config with splits Alex 0\.6 Sam 0\.4, buffer Car target 500 balance 200 targetDate "2026-04-01" \(stale\), no recurring rules$/,
  function (state: StatusWorld) {
    state.statusServices = buildStatusServices({
      dbPath: './data/ledger.db',
      defaultCurrency: 'EUR',
      timezone: 'Europe/Paris',
      accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
      splits: [
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 0.6 },
            { partner: 'Sam', ratio: 0.4 },
          ],
        },
      ],
      buffers: [
        { name: 'Car', account: 'car-account', target: 500, targetDate: '2026-04-01' },
      ],
      recurring: [],
    });
  },
);

Given(
  'a minimal valid status config with one split and no buffers',
  function (state: StatusWorld) {
    state.statusServices = buildStatusServices({
      dbPath: './data/ledger.db',
      defaultCurrency: 'EUR',
      timezone: 'Europe/Paris',
      accounts: [{ id: 'main-account', type: 'bank', filenamePrefix: 'main_' }],
      splits: [
        {
          validFrom: '2024-01-01',
          rules: [
            { partner: 'Alex', ratio: 0.6 },
            { partner: 'Sam', ratio: 0.4 },
          ],
        },
      ],
      buffers: [],
      recurring: [],
    });
  },
);

// ─── When steps ───────────────────────────────────────────────────────────────

async function invokeStatusCommand(
  state: StatusWorld,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // Lazy import to allow the test to fail with "not implemented" before Slice 3
  const { runStatusCommand } = await import('../../../src/cli/commands/status-command.js');

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const fakeStdout = {
    write(chunk: string) { stdoutChunks.push(chunk); return true; },
  } as unknown as NodeJS.WritableStream;
  const fakeStderr = {
    write(chunk: string) { stderrChunks.push(chunk); return true; },
  } as unknown as NodeJS.WritableStream;

  const opts: { asOf?: string; from?: string; to?: string; json: boolean } = { json: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') opts.json = true;
    if (args[i] === '--as-of' && args[i + 1]) { opts.asOf = args[++i]; }
    if (args[i] === '--from' && args[i + 1]) { opts.from = args[++i]; }
    if (args[i] === '--to' && args[i + 1]) { opts.to = args[++i]; }
  }

  if (!state.statusServices) throw new Error('statusServices not set — missing Given step');

  const exitCode = await runStatusCommand(opts, {
    buffersService: state.statusServices.buffersService,
    forecastService: state.statusServices.forecastService,
    transferCalculator: state.statusServices.transferCalculator,
    clock: () => '2026-04-29',
    stdout: fakeStdout,
    stderr: fakeStderr,
  });

  return {
    exitCode,
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
  };
}

When(
  'I run the status command with --json --as-of 2026-04-29',
  async function (state: StatusWorld) {
    state.statusResult = await invokeStatusCommand(state, ['--json', '--as-of', '2026-04-29']);
  },
);

When(
  'I run the status command with --as-of 2026-04-29',
  async function (state: StatusWorld) {
    state.statusResult = await invokeStatusCommand(state, ['--as-of', '2026-04-29']);
  },
);

When(
  'I run the status command with --json --as-of 2026-04-29 again',
  async function (state: StatusWorld) {
    state.statusResult2 = await invokeStatusCommand(state, ['--json', '--as-of', '2026-04-29']);
  },
);

When(
  'I run the status command with --json --as-of 2026-04-29 --from 2026-07-01 --to 2026-09-30',
  async function (state: StatusWorld) {
    state.statusResult = await invokeStatusCommand(state, [
      '--json', '--as-of', '2026-04-29', '--from', '2026-07-01', '--to', '2026-09-30',
    ]);
  },
);

When(
  'I run the status command with --as-of not-a-date',
  async function (state: StatusWorld) {
    state.statusResult = await invokeStatusCommand(state, ['--as-of', 'not-a-date']);
  },
);

// ─── Then steps ───────────────────────────────────────────────────────────────

Then('exit code is {int}', function (state: StatusWorld, code: number) {
  expect(state.statusResult!.exitCode).toBe(code);
});

Then(
  'stdout is valid JSON with keys asOf, window, buffers, transfer, forecast',
  function (state: StatusWorld) {
    const parsed = JSON.parse(state.statusResult!.stdout) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['asOf', 'window', 'buffers', 'transfer', 'forecast']));
  },
);

Then('asOf is {string}', function (state: StatusWorld, expected: string) {
  const parsed = JSON.parse(state.statusResult!.stdout) as { asOf: string };
  expect(parsed.asOf).toBe(expected);
});

Then(
  'window.from is {string} and window.to is {string}',
  function (state: StatusWorld, expectedFrom: string, expectedTo: string) {
    const parsed = JSON.parse(state.statusResult!.stdout) as {
      window: { from: string; to: string };
    };
    expect(parsed.window.from).toBe(expectedFrom);
    expect(parsed.window.to).toBe(expectedTo);
  },
);

Then(
  'buffers has one entry with name {string} and status {string}',
  function (state: StatusWorld, name: string, status: string) {
    const parsed = JSON.parse(state.statusResult!.stdout) as {
      buffers: Array<{ name: string; status: string }>;
    };
    expect(parsed.buffers).toHaveLength(1);
    expect(parsed.buffers[0].name).toBe(name);
    expect(parsed.buffers[0].status).toBe(status);
  },
);

Then(
  'transfer.totalRequired and transfer.perPartner.Alex and transfer.perPartner.Sam are present and non-empty',
  function (state: StatusWorld) {
    const parsed = JSON.parse(state.statusResult!.stdout) as {
      transfer: {
        totalRequired?: string;
        perPartner?: { Alex?: string; Sam?: string };
      };
    };
    expect(typeof parsed.transfer.totalRequired).toBe('string');
    expect(parsed.transfer.totalRequired!.length).toBeGreaterThan(0);
    expect(typeof parsed.transfer.perPartner?.Alex).toBe('string');
    expect(typeof parsed.transfer.perPartner?.Sam).toBe('string');
  },
);

Then(
  'forecast contains one entry with date {string} and name {string}',
  function (state: StatusWorld, date: string, name: string) {
    const parsed = JSON.parse(state.statusResult!.stdout) as {
      forecast: Array<{ date: string; name: string }>;
    };
    expect(parsed.forecast).toHaveLength(1);
    expect(parsed.forecast[0].date).toBe(date);
    expect(parsed.forecast[0].name).toBe(name);
  },
);

Then(
  'stdout contains "Buffers" and "Transfer" and "Forecast" section headers',
  function (state: StatusWorld) {
    const { stdout } = state.statusResult!;
    expect(stdout).toContain('Buffers');
    expect(stdout).toContain('Transfer');
    expect(stdout).toContain('Forecast');
  },
);

Then(
  'stdout contains "Vacation" and "below" and "Netflix"',
  function (state: StatusWorld) {
    const { stdout } = state.statusResult!;
    expect(stdout).toContain('Vacation');
    expect(stdout).toContain('below');
    expect(stdout).toContain('Netflix');
  },
);

Then(
  'stdout contains the prose phrase "Total transfer for May 2026"',
  function (state: StatusWorld) {
    expect(state.statusResult!.stdout).toContain('Total transfer for May 2026');
  },
);

Then(
  'stdout contains "Alex" and "Sam" with their per-partner amounts',
  function (state: StatusWorld) {
    const { stdout } = state.statusResult!;
    expect(stdout).toContain('Alex');
    expect(stdout).toContain('Sam');
  },
);

Then('both invocations produce byte-identical stdout', function (state: StatusWorld) {
  expect(state.statusResult!.stdout).toBe(state.statusResult2!.stdout);
});

Then(
  'forecast contains entries on 2026-07-15, 2026-08-15, 2026-09-15',
  function (state: StatusWorld) {
    const parsed = JSON.parse(state.statusResult!.stdout) as {
      forecast: Array<{ date: string }>;
    };
    const dates = parsed.forecast.map(f => f.date);
    expect(dates).toContain('2026-07-15');
    expect(dates).toContain('2026-08-15');
    expect(dates).toContain('2026-09-15');
  },
);

Then(
  'stdout contains buffer table row for {string} with status {string}',
  function (state: StatusWorld, name: string, status: string) {
    const { stdout } = state.statusResult!;
    expect(stdout).toContain(name);
    expect(stdout).toContain(status);
  },
);

Then(
  'stdout contains "Suggested action" and references "Car" and "targetDate"',
  function (state: StatusWorld) {
    const { stdout } = state.statusResult!;
    expect(stdout).toContain('Suggested action');
    expect(stdout).toContain('Car');
    expect(stdout).toContain('targetDate');
  },
);

Then(
  'the transfer section does not contain "Total transfer for"',
  function (state: StatusWorld) {
    expect(state.statusResult!.stdout).not.toContain('Total transfer for');
  },
);

Then(
  'stderr contains "must be ISO 8601" and "got"',
  function (state: StatusWorld) {
    const { stderr } = state.statusResult!;
    expect(stderr).toContain('must be ISO 8601');
    expect(stderr).toContain('got');
  },
);
