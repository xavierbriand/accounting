import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Writable } from 'stream';
import { PassThrough } from 'stream';
import { runIngestCommand } from '../../../../src/cli/commands/ingest-command.js';
import type { IngestCommandDeps, IngestCommandOptions } from '../../../../src/cli/commands/ingest-command.js';
import type { InteractivePrompter } from '../../../../src/cli/utils/interactive.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig, AccountConfig } from '@core/config/app-config.js';
import type { BuildOutcome } from '@core/ingest/types.js';

// fails if: the summary table is not written to stdout,
//           or the interactive loop is skipped for low-confidence items,
//           or a per-item change is not applied to the BuildOutcome,
//           or exit code is wrong for any case

const EUR = { amount: 1000, currency: 'EUR' };

function makeAccount(id: string, prefix: string): AccountConfig {
  return { id, type: 'bank', filenamePrefix: prefix };
}

const baseConfig: AppConfig = {
  dbPath: './test.db',
  defaultCurrency: 'EUR',
  timezone: 'Europe/Paris',
  splits: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }],
  buffers: [],
  accounts: [makeAccount('main-X', 'X_')],
};

function makeHighOutcome(description: string, category: string): BuildOutcome {
  return {
    transaction: {
      id: `tx-${description}`,
      occurredAt: '2026-04-20T00:00:00+02:00',
      description,
      entries: [
        { account: 'Expense:Groceries', side: 'debit', amount: EUR },
        { account: 'Assets:Bank:main-X', side: 'credit', amount: EUR },
      ],
    } as unknown as BuildOutcome['transaction'],
    category,
    classification: 'expense',
    confidence: 'high',
  };
}

function makeLowOutcome(description: string, category: string): BuildOutcome {
  return { ...makeHighOutcome(description, category), confidence: 'low' };
}

function makeStdout(): Writable & { captured: string } {
  const buf: string[] = [];
  const stream = new PassThrough() as Writable & { captured: string };
  stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
  Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
  return stream;
}

function makeStderr(): Writable & { captured: string } {
  return makeStdout();
}

function noop(_code: number): void {}

describe('runIngestCommand — happy path (interactive)', () => {
  it('writes summary table to stdout and calls final confirm once', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeLowOutcome('UBER TRIP', 'Transport')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'keep' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
    };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: {
        parse: () => Result.ok({
          items: [
            { sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'CARREFOUR', direction: 'outflow', amount: EUR },
            { sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR },
          ],
          errors: [],
        }),
      },
      idempotencyService: {
        filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }),
      },
      transactionBuilder: {
        buildAll: () => Result.ok({ built: outcomes, failed: [] }),
      },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
    };

    const opts: IngestCommandOptions = {
      file: '/tmp/X_2026.csv',
      nonInteractive: false,
      json: false,
    };

    await runIngestCommand(opts, deps);

    expect(stdout.captured).toContain('CARREFOUR');
    expect(stdout.captured).toContain('UBER TRIP');
    expect(prompter.confirmBatch).toHaveBeenCalledTimes(1);
    expect(prompter.selectCategory).toHaveBeenCalledTimes(1);
    expect(capturedExitCode).toContain(0);
  });

  it('applies category change from per-item prompt to the displayed outcome', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const outcomes = [makeLowOutcome('UBER TRIP', 'Transport')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'Groceries' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
    };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: {
        parse: () => Result.ok({
          items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR }],
          errors: [],
        }),
      },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(stdout.captured).toContain('Groceries');
    expect(capturedExitCode).toContain(0);
  });

  it('exits 1 when the final confirm is declined', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn(),
      confirmBatch: vi.fn().mockResolvedValue(false),
    };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'CARREFOUR', direction: 'outflow', amount: EUR }], errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(capturedExitCode).toContain(1);
    expect(stderr.captured).toMatch(/cancel|abort|declined/i);
  });

  it('exits 1 when the user aborts during per-item interactive loop', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const outcomes = [makeLowOutcome('UBER TRIP', 'Transport')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'abort' }),
      confirmBatch: vi.fn(),
    };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR }], errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(capturedExitCode).toContain(1);
    expect(stderr.captured).toMatch(/cancel|abort/i);
    expect(prompter.confirmBatch).not.toHaveBeenCalled();
  });

  it('exits 2 when pickSourceAccount fails (no account match)', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: { buildAll: vi.fn() },
      pickSourceAccount: () => Result.fail('no account configured for this filename'),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn() },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
    };

    await runIngestCommand({ file: '/tmp/orphan.csv', nonInteractive: false, json: false }, deps);

    expect(capturedExitCode).toContain(2);
    expect(stderr.captured).toContain('no account configured for this filename');
  });
});
