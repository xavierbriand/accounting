import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { PassThrough } from 'stream';
import { runIngestCommand } from '../../../../src/cli/commands/ingest-command.js';
import type { IngestCommandDeps } from '../../../../src/cli/commands/ingest-command.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig, AccountConfig } from '@core/config/app-config.js';
import type { BuildOutcome } from '@core/ingest/types.js';

// fails if: --non-interactive falsely flags high-confidence as needing review,
//           or the command hangs waiting for a prompt in CI mode (timeout guards this),
//           or --json output contains idempotencyHash,
//           or exit codes are wrong for any flag combination

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

function makeStreams(): { stdout: Writable & { captured: string }; stderr: Writable & { captured: string } } {
  function makeCapture(): Writable & { captured: string } {
    const buf: string[] = [];
    const stream = new PassThrough() as Writable & { captured: string };
    stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
    Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
    return stream;
  }
  return { stdout: makeCapture(), stderr: makeCapture() };
}

describe('--non-interactive mode', () => {
  it({ timeout: 500 }, 'exits 0 with only high-confidence items — no prompts fired', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeHighOutcome('EDF', 'Utilities')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const prompter = { selectCategory: vi.fn(), confirmBatch: vi.fn() };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: outcomes.map(o => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })), errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(exitCodes).toContain(0);
    expect(prompter.selectCategory).not.toHaveBeenCalled();
    expect(prompter.confirmBatch).not.toHaveBeenCalled();
  }, { timeout: 500 });

  it({ timeout: 500 }, 'exits 2 with low-confidence items — stderr names the count, no hang', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeLowOutcome('UBER TRIP', 'Transport')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const prompter = { selectCategory: vi.fn(), confirmBatch: vi.fn() };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: outcomes.map(o => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })), errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect((stderr as unknown as { captured: string }).captured).toContain('1 item');
    expect(prompter.selectCategory).not.toHaveBeenCalled();
  }, { timeout: 500 });
});

describe('--json mode', () => {
  it('emits JSON to stdout with debit/credit/category fields and no idempotencyHash — all high-confidence exits 0', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: outcomes[0].transaction.description, direction: 'outflow' as const, amount: EUR }], errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn() },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    const captured = (stdout as unknown as { captured: string }).captured;
    const parsed = JSON.parse(captured.trim()) as {
      items: Array<{ debit: string; credit: string; category: string; classification: string; idempotencyHash?: string }>;
    };

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toHaveProperty('debit');
    expect(parsed.items[0]).toHaveProperty('credit');
    expect(parsed.items[0]).toHaveProperty('category', 'Groceries');
    expect(parsed.items[0]).toHaveProperty('classification', 'expense');
    expect(parsed.items[0]).not.toHaveProperty('idempotencyHash');
    expect(exitCodes).toContain(0);
  });

  it('exits 2 with needsReview list when low-confidence items present', async () => {
    const outcomes = [makeLowOutcome('UBER TRIP', 'Transport')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: outcomes[0].transaction.description, direction: 'outflow' as const, amount: EUR }], errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: [...items], duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn() },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    const captured = (stdout as unknown as { captured: string }).captured;
    const parsed = JSON.parse(captured.trim()) as { needsReview: string[]; items: unknown[] };

    expect(exitCodes).toContain(2);
    expect(parsed.needsReview).toHaveLength(1);
    expect(parsed.needsReview[0]).toBe('tx-UBER TRIP');
    expect(parsed.items).toHaveLength(0);
  });

  it('ambiguous filename match exits 2', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: { buildAll: vi.fn() },
      pickSourceAccount: () => Result.fail('ambiguous filename — multiple account prefixes match'),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn() },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
    };

    await runIngestCommand({ file: '/tmp/ambig.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect((stderr as unknown as { captured: string }).captured).toContain('ambiguous filename');
  });
});
