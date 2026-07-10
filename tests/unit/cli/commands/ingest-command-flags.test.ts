import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { makeCapturingStream as makeCapture } from '../../../_helpers/streams.js';
import { unwrapSuccess, unwrapError } from '../../../_helpers/json-envelope.js';
import { runIngestCommand } from '../../../../src/cli/commands/ingest-command.js';
import type { IngestCommandDeps } from '../../../../src/cli/commands/ingest-command.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig, AccountConfig } from '@core/config/app-config.js';
import type { BuildOutcome } from '@core/ingest/types.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import { Money } from '@core/shared/money.js';
import type { ConfigWriter } from '@core/ports/config-writer.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';

// fails if: --non-interactive falsely flags high-confidence as needing review,
//           or the command hangs waiting for a prompt in CI mode (timeout guards this),
//           or --json output contains idempotencyHash,
//           or exit codes are wrong for any flag combination

const EUR = Money.zero('EUR').value;

function makeAccount(id: string, prefix: string): AccountConfig {
  return { id, type: 'bank', filenamePrefix: prefix };
}

const baseConfig: AppConfig = {
  dbPath: './test.db',
  defaultCurrency: 'EUR',
  timezone: 'Europe/Paris',
  splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] }],
  buffers: [],
  accounts: [makeAccount('main-X', 'X_')],
  recurring: [],
  autoTagRules: [],
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

function makeNoOpConfigWriterStub(): ConfigWriter {
  return { appendAutoTagRules: vi.fn().mockResolvedValue(Result.ok()) };
}

function makeNoOpDomainEventRecorder(): DomainEventRecorder {
  return { record: vi.fn().mockReturnValue(Result.ok()) };
}

const noOpConfirmRememberRule = vi.fn().mockResolvedValue({ action: 'skip' as const });

function makeStreams(): { stdout: Writable & { captured: string }; stderr: Writable & { captured: string } } {
  return { stdout: makeCapture(), stderr: makeCapture() };
}

describe('--non-interactive mode', () => {
  it('exits 0 with only high-confidence items — no prompts fired, batch committed (story-4.4a, closes #181)', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeHighOutcome('EDF', 'Utilities')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const prompter = { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule };
    const transactionRepository = makeNoOpTransactionRepo();

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: outcomes.map(o => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })), errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository,
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(exitCodes).toContain(0);
    expect(prompter.selectCategory).not.toHaveBeenCalled();
    expect(prompter.confirmBatch).not.toHaveBeenCalled();
    // fails if: runNonInteractive returns without calling commitBatch (the #181 dry-run bug)
    expect(transactionRepository.saveBatch).toHaveBeenCalledOnce();
  }, 500);

  it('exits 2 with low-confidence items — stderr names the count, no hang, no commit (story-4.4a guard regression pin)', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeLowOutcome('UBER TRIP', 'Transport')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const prompter = { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule };
    const transactionRepository = makeNoOpTransactionRepo();

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: outcomes.map(o => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })), errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository,
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect((stderr as unknown as { captured: string }).captured).toContain('1 item');
    expect(prompter.selectCategory).not.toHaveBeenCalled();
    // fails if: the lowConfidence.length > 0 guard is removed or the commit is hoisted above it
    expect(transactionRepository.saveBatch).not.toHaveBeenCalled();
  }, 500);
});

describe('--json mode (story-4.4b: enveloped, camelCase, Money.toString() conventions)', () => {
  it('emits an enveloped document with camelCase sourceAccount, Money.toString() amount, debit/credit/category fields and no idempotencyHash — all high-confidence exits 0 and commits (story-4.4a, closes #181)', async () => {
    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const dupItem = { item: { sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: 'DUP', direction: 'outflow' as const, amount: EUR }, idempotencyHash: 'hash-DUP' };
    const parseErrorRow = { line: 1, reason: 'bad date', raw: 'x' };
    const transactionRepository = makeNoOpTransactionRepo();

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: outcomes[0].transaction.description, direction: 'outflow' as const, amount: EUR }], errors: [parseErrorRow] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [dupItem] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('acct-42', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository,
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    const captured = (stdout as unknown as { captured: string }).captured;
    const data = unwrapSuccess<{
      sourceAccount: string;
      summary: { duplicates: number; parseErrors: number };
      items: Array<{ amount: string; debit: string; credit: string; category: string; classification: string; idempotencyHash?: string }>;
    }>(captured);

    expect(data.items).toHaveLength(1);
    expect(data.items[0].amount).toMatch(/^[A-Z]{3} -?\d+\.\d{2}$/);
    expect(data.items[0]).toHaveProperty('debit');
    expect(data.items[0]).toHaveProperty('credit');
    expect(data.items[0]).toHaveProperty('category', 'Groceries');
    expect(data.items[0]).toHaveProperty('classification', 'expense');
    expect(data.items[0]).not.toHaveProperty('idempotencyHash');
    expect(data.sourceAccount).toBe('acct-42');
    expect(data.summary.duplicates).toBe(1);
    expect(data.summary.parseErrors).toBe(1);
    expect(exitCodes).toContain(0);
    // fails if: --json alone (nonInteractive: false) fails to route through commitBatch too
    expect(transactionRepository.saveBatch).toHaveBeenCalledOnce();
    // fails if a snake_case field survives the conventions normalization
    expect(captured).not.toContain('source_account');
    expect(captured).not.toContain('amount_cents');
  });

  it('exits 2 with a NEEDS_REVIEW envelope on the final stderr line when low-confidence items present, no commit (story-4.4a guard regression pin; story-4.4b moves the payload off stdout)', async () => {
    const outcomes = [makeLowOutcome('UBER TRIP', 'Transport')];
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];
    const dupItem = { item: { sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: 'DUP', direction: 'outflow' as const, amount: EUR }, idempotencyHash: 'hash-DUP' };
    const parseErrorRow = { line: 2, reason: 'missing amount', raw: 'y' };
    const transactionRepository = makeNoOpTransactionRepo();

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: outcomes[0].transaction.occurredAt, description: outcomes[0].transaction.description, direction: 'outflow' as const, amount: EUR }], errors: [parseErrorRow, parseErrorRow] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [dupItem, dupItem] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('acct-77', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository,
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    expect((stdout as unknown as { captured: string }).captured).toBe('');

    const error = unwrapError((stderr as unknown as { captured: string }).captured);
    expect(error.code).toBe('NEEDS_REVIEW');
    const details = error.details as { sourceAccount: string; summary: { duplicates: number; parseErrors: number }; lowConfidence: string[] };

    expect(exitCodes).toContain(2);
    expect(details.lowConfidence).toHaveLength(1);
    expect(details.lowConfidence[0]).toBe('tx-UBER TRIP');
    expect(details.sourceAccount).toBe('acct-77');
    expect(details.summary.duplicates).toBe(2);
    expect(details.summary.parseErrors).toBe(2);
    // fails if: the lowConfidence.length > 0 guard is removed or the commit is hoisted above it
    expect(transactionRepository.saveBatch).not.toHaveBeenCalled();
  });

  it('ambiguous filename match exits 2', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.fail('ambiguous filename — multiple account prefixes match'),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/ambig.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect((stderr as unknown as { captured: string }).captured).toContain('ambiguous filename');
  });
});

// story-4.4b: remaining --json-reachable failure sites (source-account resolution,
// read, parse, idempotency check, build) each gain a final-stderr-line coded error
// envelope, ahead of the existing prose line; exit codes unchanged.
describe('--json mode: remaining failure envelopes (story-4.4b)', () => {
  it('source-account resolution failure + --json: final stderr line is an INVALID_ARGUMENT envelope', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.fail('ambiguous filename — multiple account prefixes match'),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/ambig.csv', nonInteractive: false, json: true }, deps);

    expect(exitCodes).toContain(2);
    const error = unwrapError((stderr as unknown as { captured: string }).captured);
    expect(error.code).toBe('INVALID_ARGUMENT');
    expect(error.message).toContain('ambiguous filename');
  });

  it('read failure + --json: final stderr line is a READ_FAILURE envelope', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.fail('ENOENT: no such file or directory'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    expect(exitCodes).toContain(1);
    const error = unwrapError((stderr as unknown as { captured: string }).captured);
    expect(error.code).toBe('READ_FAILURE');
    expect(error.message).toContain('ENOENT');
  });

  it('CSV parse failure + --json: final stderr line is a READ_FAILURE envelope', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.fail('malformed header row') },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    expect(exitCodes).toContain(1);
    const error = unwrapError((stderr as unknown as { captured: string }).captured);
    expect(error.code).toBe('READ_FAILURE');
    expect(error.message).toContain('malformed header row');
  });

  it('idempotency check failure + --json: final stderr line is a QUERY_FAILURE envelope', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: [], errors: [] }) },
      idempotencyService: { filterNew: () => Result.fail('hash repository unreachable') },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    expect(exitCodes).toContain(1);
    const error = unwrapError((stderr as unknown as { captured: string }).captured);
    expect(error.code).toBe('QUERY_FAILURE');
    expect(error.message).toContain('hash repository unreachable');
  });

  it('build failure + --json: final stderr line is a QUERY_FAILURE envelope', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: [], errors: [] }) },
      idempotencyService: { filterNew: () => Result.ok({ fresh: [], duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.fail('unknown account in batch') }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: true }, deps);

    expect(exitCodes).toContain(1);
    const error = unwrapError((stderr as unknown as { captured: string }).captured);
    expect(error.code).toBe('QUERY_FAILURE');
    expect(error.message).toContain('unknown account in batch');
  });

  it('non-json mode stays prose-only for all of the above (no envelope line)', async () => {
    const { stdout, stderr } = makeStreams();
    const exitCodes: number[] = [];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.fail('ambiguous filename — multiple account prefixes match'),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/ambig.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect(() => JSON.parse((stderr as unknown as { captured: string }).captured.trim())).toThrow();
  });
});
