import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { PassThrough } from 'stream';
import { runIngestCommand } from '../../../../src/cli/commands/ingest-command.js';
import type { IngestCommandDeps } from '../../../../src/cli/commands/ingest-command.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig, AccountConfig } from '@core/config/app-config.js';
import type { BuildOutcome } from '@core/ingest/types.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import { Money } from '@core/shared/money.js';

// fails if: --non-interactive falsely flags high-confidence as needing review,
//           or the command hangs waiting for a prompt in CI mode (timeout guards this),
//           or --json output contains idempotencyHash,
//           or exit codes are wrong for any flag combination

const EUR = Money.zero('EUR');

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
    idempotencyHash: `hash-${description}`,
  };
}

function makeLowOutcome(description: string, category: string): BuildOutcome {
  return { ...makeHighOutcome(description, category), confidence: 'low' };
}

const TEST_DB_PATH = '/tmp/test-ingest-flags.db';

function makeNoOpSnapshotService(): SnapshotService {
  return {
    create: vi.fn().mockResolvedValue(Result.ok()),
    restore: vi.fn().mockResolvedValue(Result.ok()),
    remove: vi.fn().mockResolvedValue(Result.ok()),
  };
}

function makeNoOpTransactionRepo(): Pick<TransactionRepository, 'saveBatch'> {
  return {
    saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 0 })),
  };
}

function makeStreams(): { stdout: Writable & { captured: string }; stderr: Writable & { captured: string } } {
  function makeCapture(): Writable & { captured: string } {
    const buf: string[] = [];
    const stream = new PassThrough() as unknown as Writable & { captured: string };
    stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
    Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
    return stream;
  }
  return { stdout: makeCapture(), stderr: makeCapture() };
}

describe('--non-interactive mode', () => {
  it('exits 0 with only high-confidence items — no prompts fired', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeHighOutcome('EDF', 'Utilities')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const prompter = { selectCategory: vi.fn(), confirmBatch: vi.fn() };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: outcomes.map(o => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })), errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(exitCodes).toContain(0);
    expect(prompter.selectCategory).not.toHaveBeenCalled();
    expect(prompter.confirmBatch).not.toHaveBeenCalled();
  });

  it('exits 2 with low-confidence items — stderr names the count, no hang', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeLowOutcome('UBER TRIP', 'Transport')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const prompter = { selectCategory: vi.fn(), confirmBatch: vi.fn() };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: outcomes.map(o => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })), errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect((stderr as unknown as { captured: string }).captured).toContain('1 item');
    expect(prompter.selectCategory).not.toHaveBeenCalled();
  });
});

describe('--json mode', () => {
  it('emits JSON to stdout with debit/credit/category fields and no idempotencyHash — all high-confidence exits 0', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const dupItem = { sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: 'DUP', direction: 'outflow' as const, amount: EUR };
    const parseErrorRow = { line: 1, reason: 'bad date', raw: 'x' };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: outcomes[0].transaction.description, direction: 'outflow' as const, amount: EUR }], errors: [parseErrorRow] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [dupItem] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('acct-42', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn() },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    const captured = (stdout as unknown as { captured: string }).captured;
    const parsed = JSON.parse(captured.trim()) as {
      source_account: string;
      summary: { duplicates: number; parseErrors: number };
      items: Array<{ debit: string; credit: string; category: string; classification: string; idempotencyHash?: string }>;
    };

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toHaveProperty('debit');
    expect(parsed.items[0]).toHaveProperty('credit');
    expect(parsed.items[0]).toHaveProperty('category', 'Groceries');
    expect(parsed.items[0]).toHaveProperty('classification', 'expense');
    expect(parsed.items[0]).not.toHaveProperty('idempotencyHash');
    expect(parsed.source_account).toBe('acct-42');
    expect(parsed.summary.duplicates).toBe(1);
    expect(parsed.summary.parseErrors).toBe(1);
    expect(exitCodes).toContain(0);
  });

  it('exits 2 with needsReview list when low-confidence items present', async () => {
    const outcomes = [makeLowOutcome('UBER TRIP', 'Transport')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const dupItem = { sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: 'DUP', direction: 'outflow' as const, amount: EUR };
    const parseErrorRow = { line: 2, reason: 'missing amount', raw: 'y' };

    const deps: IngestCommandDeps = {
      configService: { load: () => Result.ok(baseConfig) },
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: outcomes[0].transaction.description, direction: 'outflow' as const, amount: EUR }], errors: [parseErrorRow, parseErrorRow] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [dupItem, dupItem] }) },
      transactionBuilder: { buildAll: () => Result.ok({ built: outcomes, failed: [] }) },
      pickSourceAccount: () => Result.ok(makeAccount('acct-77', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn() },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    const captured = (stdout as unknown as { captured: string }).captured;
    const parsed = JSON.parse(captured.trim()) as {
      source_account: string;
      summary: { duplicates: number; parseErrors: number };
      needsReview: string[];
      items: unknown[];
    };

    expect(exitCodes).toContain(2);
    expect(parsed.needsReview).toHaveLength(1);
    expect(parsed.needsReview[0]).toBe('tx-UBER TRIP');
    expect(parsed.items).toHaveLength(0);
    expect(parsed.source_account).toBe('acct-77');
    expect(parsed.summary.duplicates).toBe(2);
    expect(parsed.summary.parseErrors).toBe(2);
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
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
    };

    await runIngestCommand({ file: '/tmp/ambig.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect((stderr as unknown as { captured: string }).captured).toContain('ambiguous filename');
  });
});
