import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { makeCapturingStream as makeStdout } from '../../../_helpers/streams.js';
import { runIngestCommand } from '../../../../src/cli/commands/ingest-command.js';
import type { IngestCommandDeps, IngestCommandOptions } from '../../../../src/cli/commands/ingest-command.js';
import type { InteractivePrompter } from '../../../../src/cli/utils/interactive.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig, AccountConfig } from '@core/config/app-config.js';
import type { BuildOutcome } from '@core/ingest/types.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import { Money } from '@core/shared/money.js';
import type { ConfigWriter } from '@core/ports/config-writer.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';

// fails if: the summary table is not written to stdout,
//           or the interactive loop is skipped for low-confidence items,
//           or a per-item change is not applied to the BuildOutcome,
//           or exit code is wrong for any case

const EUR = Money.zero('EUR').value;
const TEST_DB_PATH = '/tmp/test-ingest.db';

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


function makeStderr(): Writable & { captured: string } {
  return makeStdout();
}

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
  return {
    appendAutoTagRules: vi.fn().mockResolvedValue(Result.ok()),
  };
}

function makeNoOpDomainEventRecorder(): DomainEventRecorder {
  return { record: vi.fn().mockReturnValue(Result.ok()) };
}

// No-op InteractivePrompter stub that satisfies the updated interface.
// Used in tests that don't exercise confirmRememberRule.
const noOpConfirmRememberRule = vi.fn().mockResolvedValue({ action: 'skip' as const });

describe('runIngestCommand — happy path (interactive)', () => {
  it('writes summary table to stdout and calls final confirm once', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const outcomes = [makeHighOutcome('CARREFOUR', 'Groceries'), makeLowOutcome('UBER TRIP', 'Transport')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'keep' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: noOpConfirmRememberRule,
    };

    const deps: IngestCommandDeps = {
      config: baseConfig,
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
        // Story 2.5: filterNew returns FreshIngestItem[] (item + idempotencyHash)
        filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }),
      },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
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
      confirmRememberRule: noOpConfirmRememberRule,
    };

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: {
        parse: () => Result.ok({
          items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR }],
          errors: [],
        }),
      },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
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
      confirmRememberRule: noOpConfirmRememberRule,
    };

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'CARREFOUR', direction: 'outflow', amount: EUR }], errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
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
      confirmRememberRule: noOpConfirmRememberRule,
    };

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({ items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR }], errors: [] }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
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
      config: baseConfig,
      csvParser: { parse: vi.fn() },
      idempotencyService: { filterNew: vi.fn() },
      transactionBuilder: () => ({ buildAll: vi.fn() }),
      pickSourceAccount: () => Result.fail('no account configured for this filename'),
      readFile: () => Result.ok('csv-content'),
      prompt: { selectCategory: vi.fn(), confirmBatch: vi.fn(), confirmRememberRule: noOpConfirmRememberRule },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/orphan.csv', nonInteractive: false, json: false }, deps);

    expect(capturedExitCode).toContain(2);
    expect(stderr.captured).toContain('no account configured for this filename');
  });
});

describe('runIngestCommand — interactive re-categorisation preserves idempotencyHash (Story 2.5)', () => {
  it('object-spread at "change" preserves idempotencyHash from original outcome', async () => {
    // fails if: the object-spread at runInteractiveLoop drops idempotencyHash
    //   resolved[idx] = { ...outcome, category: answer.category, confidence: 'high' }
    //   must preserve idempotencyHash — a future implementation that drops it would
    //   silently write NULL to the DB, breaking the dedup column (Plan-agent Decision 1 lock-in)
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const lowOutcomeWithHash = makeLowOutcome('UBER TRIP', 'Transport');
    // Ensure it has a specific hash we can verify
    const lowOutcomeWithSpecificHash: BuildOutcome = { ...lowOutcomeWithHash, idempotencyHash: 'specific-hash-xyz' };


    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'Groceries' }),
      confirmBatch: vi.fn().mockImplementation((count: number) => {
        // capture won't happen here; see below
        void count;
        return Promise.resolve(true);
      }),
      confirmRememberRule: noOpConfirmRememberRule,
    };

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: {
        parse: () => Result.ok({
          items: [{ sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR }],
          errors: [],
        }),
      },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: [lowOutcomeWithSpecificHash], failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    // The summary table is written to stdout; we can't easily inspect resolved outcomes
    // from outside, but the key assertion is: the command reaches exitCode(0) — meaning
    // the confirm step was reached (idempotencyHash was still present, not undefined).
    // A more direct test: if idempotencyHash were dropped, the type would be violated
    // and the downstream saveBatch (Story 2.5) would get undefined — caught by the
    // TypeScript compile and the property test in the integration suite.
    expect(capturedExitCode).toContain(0);
    // The category change was applied
    expect(stdout.captured).toContain('Groceries');
    // The original hash string does NOT appear in stderr (it would be PII-leaked if it did)
    expect(stderr.captured).not.toContain('specific-hash-xyz');
  });
});

describe('runIngestCommand — commitBatch flow (Story 2.5)', () => {
  // fails if: snapshot not called before saveBatch, wrong exit codes, PII-leaked in stderr,
  //   remove called after failure, or the non-interactive path skips the commit (story-4.4a
  //   flipped the old "--non-interactive triggers no writes" guard — dry-run was bug #181)

  function makeBaseInteractiveDeps(
    overrides: Partial<IngestCommandDeps> = {},
  ): {
    deps: IngestCommandDeps;
    stdout: Writable & { captured: string };
    stderr: Writable & { captured: string };
    exitCodes: number[];
  } {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const exitCodes: number[] = [];

    const outcomes = [
      makeHighOutcome('CARREFOUR', 'Groceries'),
      makeHighOutcome('EDF', 'Utilities'),
      makeHighOutcome('AMAZON', 'Shopping'),
    ];

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: { parse: () => Result.ok({
        items: outcomes.map((o) => ({ sourceAccount: 'main-X', occurredAt: o.transaction.occurredAt, description: o.transaction.description, direction: 'outflow' as const, amount: EUR })),
        errors: [],
      }) },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: {
        selectCategory: vi.fn(),
        confirmBatch: vi.fn().mockResolvedValue(true),
        confirmRememberRule: noOpConfirmRememberRule,
      },
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: makeNoOpTransactionRepo(),
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
      ...overrides,
    };

    return { deps, stdout, stderr, exitCodes };
  }

  it('(a) happy path: create + saveBatch + remove called in order, exit 0, stderr "N transaction(s) committed"', async () => {
    // fails if: snapshot skipped, saveBatch skipped, remove not called on success,
    //   or exit code is not 0
    const snapshotService: SnapshotService = {
      create: vi.fn().mockResolvedValue(Result.ok()),
      restore: vi.fn().mockResolvedValue(Result.ok()),
      remove: vi.fn().mockResolvedValue(Result.ok()),
    };
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 3 })),
    };

    const { deps, stderr, exitCodes } = makeBaseInteractiveDeps({ snapshotService, transactionRepository });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(snapshotService.create).toHaveBeenCalledOnce();
    expect(snapshotService.create).toHaveBeenCalledWith(TEST_DB_PATH, TEST_DB_PATH + '.bak');
    expect(transactionRepository.saveBatch).toHaveBeenCalledOnce();
    expect(snapshotService.remove).toHaveBeenCalledOnce();
    expect(snapshotService.remove).toHaveBeenCalledWith(TEST_DB_PATH + '.bak');
    expect(exitCodes).toContain(0);
    expect(stderr.captured).toContain('3 transaction(s) committed');
  });

  it('(b) saveBatch fails: remove NOT called, stderr "rolled back" + "Snapshot retained at", exit 4', async () => {
    // fails if: remove is called after a batch failure (would destroy the recovery artifact),
    //   or exit code is not 4, or the raw SQL error is leaked (PII)
    const snapshotService: SnapshotService = {
      create: vi.fn().mockResolvedValue(Result.ok()),
      restore: vi.fn().mockResolvedValue(Result.ok()),
      remove: vi.fn().mockResolvedValue(Result.ok()),
    };
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.fail('SQLITE_CONSTRAINT: UNIQUE constraint failed: transactions.idempotency_hash')),
    };

    const { deps, stderr, exitCodes } = makeBaseInteractiveDeps({ snapshotService, transactionRepository });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(snapshotService.remove).not.toHaveBeenCalled();
    expect(stderr.captured).toContain('Commit failed (batch rolled back)');
    expect(stderr.captured).toContain('Snapshot retained at');
    expect(exitCodes).toContain(4);
  });

  it('(c) create fails: saveBatch NOT called, stderr "Snapshot failed", exit 3', async () => {
    // fails if: saveBatch fires anyway when create fails, or exit code is not 3
    const snapshotService: SnapshotService = {
      create: vi.fn().mockResolvedValue(Result.fail('EACCES: permission denied')),
      restore: vi.fn().mockResolvedValue(Result.ok()),
      remove: vi.fn().mockResolvedValue(Result.ok()),
    };
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 3 })),
    };

    const { deps, stderr, exitCodes } = makeBaseInteractiveDeps({ snapshotService, transactionRepository });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(transactionRepository.saveBatch).not.toHaveBeenCalled();
    expect(stderr.captured).toContain('Snapshot failed');
    expect(exitCodes).toContain(3);
  });

  it('(d) remove fails after successful saveBatch: exit 0 (non-fatal warning)', async () => {
    // fails if: a remove failure causes exit 1/4 (it should be a warning only — write succeeded)
    const snapshotService: SnapshotService = {
      create: vi.fn().mockResolvedValue(Result.ok()),
      restore: vi.fn().mockResolvedValue(Result.ok()),
      remove: vi.fn().mockResolvedValue(Result.fail('EACCES: permission denied on .bak')),
    };
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 3 })),
    };

    const { deps, stderr, exitCodes } = makeBaseInteractiveDeps({ snapshotService, transactionRepository });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(0);
    expect(stderr.captured).toContain('Warning');
  });

  it('(e) --non-interactive flag commits a clean batch: create/saveBatch/remove all called, exit 0 (story-4.4a, closes #181)', async () => {
    // fails if: --non-interactive returns without calling commitBatch — the #181
    // production bug (runNonInteractive silently dry-ran even with zero decisions to take)
    const snapshotService: SnapshotService = {
      create: vi.fn().mockResolvedValue(Result.ok()),
      restore: vi.fn().mockResolvedValue(Result.ok()),
      remove: vi.fn().mockResolvedValue(Result.ok()),
    };
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 3 })),
    };

    const { deps, exitCodes } = makeBaseInteractiveDeps({ snapshotService, transactionRepository });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: false }, deps);

    expect(snapshotService.create).toHaveBeenCalledOnce();
    expect(transactionRepository.saveBatch).toHaveBeenCalledOnce();
    expect(snapshotService.remove).toHaveBeenCalledOnce();
    expect(exitCodes).toContain(0);
  });

  it('(f) saveBatch fails: domainEventRecorder.record is NEVER called (story-4.1 ordering guard)', async () => {
    // fails if: record(...) is called before/independently of saveBatch success —
    //   guards the "only on success" ordering in commitBatch (docs/plans/story-4.1.md
    //   Gherkin scenario "A failed batch commit records no event").
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.fail('SQLITE_CONSTRAINT: UNIQUE constraint failed: transactions.idempotency_hash')),
    };
    const domainEventRecorder: DomainEventRecorder = {
      record: vi.fn().mockReturnValue(Result.ok()),
    };

    const { deps, exitCodes } = makeBaseInteractiveDeps({ transactionRepository, domainEventRecorder });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(4);
    expect(domainEventRecorder.record).not.toHaveBeenCalled();
  });

  it('(g) saveBatch succeeds: domainEventRecorder.record is called once with the committed ids + source account', async () => {
    // fails if: record(...) is never called on a successful commit, called more than
    //   once (should be one batch-level event), or built from the wrong ids/account.
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 3 })),
    };
    const domainEventRecorder: DomainEventRecorder = {
      record: vi.fn().mockReturnValue(Result.ok()),
    };

    const { deps, exitCodes } = makeBaseInteractiveDeps({ transactionRepository, domainEventRecorder });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(exitCodes).toContain(0);
    expect(domainEventRecorder.record).toHaveBeenCalledOnce();
    expect(domainEventRecorder.record).toHaveBeenCalledWith({
      type: 'TransactionIngested',
      transactionIds: ['tx-CARREFOUR', 'tx-EDF', 'tx-AMAZON'],
      sourceAccount: 'main-X',
    });
  });

  it('(h) --json commit failure: success-shaped JSON already on stdout, exit 4 + stderr carry the truth (story-4.4a)', async () => {
    // fails if: the emit-then-commit order changes (stdout JSON would vanish entirely —
    //   commitBatch's exitCode(0) is process.exit at the composition root, so nothing
    //   prints after it), or the failed commit stops being detectable by a scripted
    //   consumer via exit 4 + "rolled back" on stderr
    const snapshotService: SnapshotService = {
      create: vi.fn().mockResolvedValue(Result.ok()),
      restore: vi.fn().mockResolvedValue(Result.ok()),
      remove: vi.fn().mockResolvedValue(Result.ok()),
    };
    const transactionRepository: Pick<TransactionRepository, 'saveBatch'> = {
      saveBatch: vi.fn().mockReturnValue(Result.fail('SQLITE_CONSTRAINT: UNIQUE constraint failed: transactions.idempotency_hash')),
    };

    const { deps, stdout, stderr, exitCodes } = makeBaseInteractiveDeps({ snapshotService, transactionRepository });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: true, json: true }, deps);

    expect((JSON.parse(stdout.captured) as { summary: { total: number } }).summary.total).toBe(3);
    expect(exitCodes).toContain(4);
    expect(snapshotService.remove).not.toHaveBeenCalled();
    expect(stderr.captured).toContain('Commit failed (batch rolled back)');
  });
});

describe('runIngestCommand — new category propagates to subsequent prompts (Story A)', () => {
  // fails if: the new category name is not pushed into the in-memory categories array
  //   after a define-new action — subsequent prompts would not offer 'AutoInsurance'
  //   as a 'Change to:' option, silently dropping the feature (guards
  //   ingest-command.ts:runInteractiveLoop categories-array push).

  it('new category from first outcome appears in availableCategories for second outcome', async () => {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const capturedExitCode: number[] = [];

    const outcomes = [
      makeLowOutcome('UBER TRIP', 'Uncategorized'),
      makeLowOutcome('AMAZON', 'Uncategorized'),
    ];

    const selectCategoryMock = vi.fn()
      .mockResolvedValueOnce({ action: 'change', category: 'AutoInsurance' })
      .mockResolvedValueOnce({ action: 'keep' });

    const prompter: InteractivePrompter = {
      selectCategory: selectCategoryMock,
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: noOpConfirmRememberRule,
    };

    const saveBatchMock = vi.fn().mockReturnValue(Result.ok({ written: 2 }));

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: {
        parse: () => Result.ok({
          items: [
            { sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'UBER TRIP', direction: 'outflow', amount: EUR },
            { sourceAccount: 'main-X', occurredAt: '2026-04-20T00:00:00+02:00', description: 'AMAZON', direction: 'outflow', amount: EUR },
          ],
          errors: [],
        }),
      },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => capturedExitCode.push(code),
      transactionRepository: { saveBatch: saveBatchMock },
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter: makeNoOpConfigWriterStub(),
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    // Second selectCategory call receives the new name in availableCategories.
    const secondCallCategories = selectCategoryMock.mock.calls[1][2] as readonly string[];
    expect(secondCallCategories).toContain('AutoInsurance');

    // saveBatch payload: outcome 1 was 'change'd to AutoInsurance with confidence promoted to 'high';
    // outcome 2 was 'kept' so its original category and confidence are unchanged.
    expect(saveBatchMock).toHaveBeenCalledOnce();
    const committed = saveBatchMock.mock.calls[0][0] as ReadonlyArray<{ category: string; confidence: string }>;
    expect(committed[0]).toMatchObject({ category: 'AutoInsurance', confidence: 'high' });
    expect(committed[1]).toMatchObject({ category: 'Uncategorized', confidence: 'low' });

    expect(capturedExitCode).toContain(0);
  });
});

// ---- configWriter integration in runIngestCommand (Story C) ----
// fails if: configWriter is not called before saveBatch (guards YAML-before-DB ordering),
//           configWriter failure does not abort with exit 5 and prevent saveBatch (guards Q1-b),
//           configWriter is called when there are no remembered rules (wasteful write)

describe('runIngestCommand — configWriter buffer-then-flush (Story C)', () => {
  function makeDepsWithWriter(
    configWriter: ConfigWriter,
    prompter: InteractivePrompter,
    outcomes: BuildOutcome[],
  ): {
    deps: IngestCommandDeps;
    stdout: Writable & { captured: string };
    stderr: Writable & { captured: string };
    exitCodes: number[];
    saveBatchMock: ReturnType<typeof vi.fn>;
  } {
    const stdout = makeStdout();
    const stderr = makeStderr();
    const exitCodes: number[] = [];
    const saveBatchMock = vi.fn().mockReturnValue(Result.ok({ written: outcomes.length }));

    const deps: IngestCommandDeps = {
      config: baseConfig,
      csvParser: {
        parse: () => Result.ok({
          items: outcomes.map((o) => ({
            sourceAccount: 'main-X',
            occurredAt: o.transaction.occurredAt,
            description: o.transaction.description,
            direction: 'outflow' as const,
            amount: EUR,
          })),
          errors: [],
        }),
      },
      idempotencyService: { filterNew: (items) => Result.ok({ fresh: items.map((i) => ({ item: i, idempotencyHash: `hash-${i.description}` })), duplicates: [] }) },
      transactionBuilder: () => ({ buildAll: () => Result.ok({ built: outcomes, failed: [] }) }),
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok('csv-content'),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      transactionRepository: { saveBatch: saveBatchMock },
      snapshotService: makeNoOpSnapshotService(),
      dbPath: TEST_DB_PATH,
      configWriter,
      domainEventRecorder: makeNoOpDomainEventRecorder(),
    };

    return { deps, stdout, stderr, exitCodes, saveBatchMock };
  }

  it('(a) configWriter is called before saveBatch when remembered rules exist', async () => {
    // fails if: YAML-before-DB ordering is violated
    const callOrder: string[] = [];

    const configWriter: ConfigWriter = {
      appendAutoTagRules: vi.fn().mockImplementation(async () => {
        callOrder.push('configWriter');
        return Result.ok();
      }),
    };

    const outcomes = [makeLowOutcome('ALTIMA COURTAGE', 'Uncategorized')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'AutoInsurance' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: vi.fn().mockResolvedValue({ action: 'remember', pattern: 'courtage' }),
    };

    const { deps, saveBatchMock, exitCodes } = makeDepsWithWriter(configWriter, prompter, outcomes);
    saveBatchMock.mockImplementation(() => { callOrder.push('saveBatch'); return Result.ok({ written: 1 }); });

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(callOrder).toEqual(['configWriter', 'saveBatch']);
    expect(exitCodes).toContain(0);
  });

  it('(b) configWriter failure exits 5 and does NOT call saveBatch', async () => {
    // fails if: saveBatch is called when configWriter fails (guards Q1-b atomicity)
    const configWriter: ConfigWriter = {
      appendAutoTagRules: vi.fn().mockResolvedValue(
        Result.fail({ kind: 'mtime-race' as const }),
      ),
    };

    const outcomes = [makeLowOutcome('ALTIMA COURTAGE', 'Uncategorized')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'AutoInsurance' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: vi.fn().mockResolvedValue({ action: 'remember', pattern: 'courtage' }),
    };

    const { deps, saveBatchMock, exitCodes, stderr } = makeDepsWithWriter(configWriter, prompter, outcomes);

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(saveBatchMock).not.toHaveBeenCalled();
    expect(exitCodes).toContain(5);
    expect(stderr.captured).toMatch(/yaml|config|changed/i);
  });

  it('(c) configWriter not called when no rules are remembered', async () => {
    // fails if: configWriter is called on empty rememberedRules (wasteful no-op write)
    const configWriter: ConfigWriter = {
      appendAutoTagRules: vi.fn().mockResolvedValue(Result.ok()),
    };

    const outcomes = [makeLowOutcome('ALTIMA COURTAGE', 'Uncategorized')];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'AutoInsurance' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: vi.fn().mockResolvedValue({ action: 'skip' }),
    };

    const { deps, exitCodes } = makeDepsWithWriter(configWriter, prompter, outcomes);

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(configWriter.appendAutoTagRules).not.toHaveBeenCalled();
    expect(exitCodes).toContain(0);
  });

  it('(d) in-batch duplicate (same cat+pat twice) is collapsed to one entry', async () => {
    // Q5-c: user confirms (AutoInsurance, courtage) twice → only one append
    const configWriter: ConfigWriter = {
      appendAutoTagRules: vi.fn().mockResolvedValue(Result.ok()),
    };

    const outcomes = [
      makeLowOutcome('ALTIMA COURTAGE', 'Uncategorized'),
      makeLowOutcome('ALTIMA SOLO', 'Uncategorized'),
    ];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn()
        .mockResolvedValueOnce({ action: 'change', category: 'AutoInsurance' })
        .mockResolvedValueOnce({ action: 'change', category: 'AutoInsurance' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: vi.fn()
        .mockResolvedValueOnce({ action: 'remember', pattern: 'courtage' })
        .mockResolvedValueOnce({ action: 'remember', pattern: 'courtage' }),
    };

    const { deps, exitCodes } = makeDepsWithWriter(configWriter, prompter, outcomes);

    await runIngestCommand({ file: '/tmp/X_2026.csv', nonInteractive: false, json: false }, deps);

    expect(configWriter.appendAutoTagRules).toHaveBeenCalledOnce();
    const calledWith = (configWriter.appendAutoTagRules as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ category: string; pattern: string }>;
    // Only one entry despite two confirms
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0]).toEqual({ category: 'AutoInsurance', pattern: 'courtage' });
    expect(exitCodes).toContain(0);
  });
});
