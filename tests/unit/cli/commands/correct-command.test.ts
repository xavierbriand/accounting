/**
 * Unit tests for runCorrectCommand (Story 4.2b, FR14 — correct CLI command).
 *
 * Gherkin coverage: docs/plans/story-4.2b.md scenario 1 (happy path, human output).
 *
 * fails if: the command doesn't call saveCorrection + record in that order, misreports
 *   changed fields, or omits the reversal/correcting ids from stdout.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { PassThrough } from 'stream';
import { runCorrectCommand } from '../../../../src/cli/commands/correct-command.js';
import type { CorrectCommandDeps } from '../../../../src/cli/commands/correct-command.js';
import type { CorrectCommandOptions } from '../../../../src/cli/commands/correct-command-options.js';
import { Result } from '@core/shared/result.js';
import { Transaction } from '@core/ledger/transaction.js';
import { Money } from '@core/shared/money.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeOriginal(): Transaction {
  return Transaction.create({
    id: 'tx-original',
    occurredAt: '2026-04-21T14:30:00+02:00',
    description: 'Transport',
    entries: [
      { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
}

function makeCapture(): Writable & { captured: string } {
  const buf: string[] = [];
  const stream = new PassThrough() as unknown as Writable & { captured: string };
  stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
  Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
  return stream;
}

function baseOptions(overrides: Partial<CorrectCommandOptions> = {}): CorrectCommandOptions {
  return {
    transactionId: 'tx-original',
    reason: 'wrong amount on receipt',
    json: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CorrectCommandDeps> = {}): {
  deps: CorrectCommandDeps;
  stdout: Writable & { captured: string };
  stderr: Writable & { captured: string };
  exitCodes: number[];
  findByIdMock: ReturnType<typeof vi.fn>;
  saveCorrectionMock: ReturnType<typeof vi.fn>;
  recordMock: ReturnType<typeof vi.fn>;
} {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];

  const findByIdMock = vi.fn().mockReturnValue(Result.ok(makeOriginal()));
  const saveCorrectionMock = vi.fn().mockReturnValue(Result.ok());
  const recordMock = vi.fn().mockReturnValue(Result.ok());

  const transactionRepository: Pick<TransactionRepository, 'findById' | 'saveCorrection'> = {
    findById: findByIdMock,
    saveCorrection: saveCorrectionMock,
  };
  const domainEventRecorder: DomainEventRecorder = { record: recordMock };

  let callCount = 0;
  const uuidGen = () => `uuid-${++callCount}`;

  const deps: CorrectCommandDeps = {
    transactionRepository,
    domainEventRecorder,
    uuidGen,
    stdout: stdout as Writable,
    stderr: stderr as Writable,
    exitCode: (code) => exitCodes.push(code),
    ...overrides,
  };

  return { deps, stdout, stderr, exitCodes, findByIdMock, saveCorrectionMock, recordMock };
}

describe('runCorrectCommand — happy path, human output (scenario 1)', () => {
  it('loads the original, corrects, persists, records, and reports the ids + changed fields', async () => {
    const { deps, stdout, exitCodes, findByIdMock, saveCorrectionMock, recordMock } = makeDeps();

    await runCorrectCommand(baseOptions({ amount: '45.30' }), deps);

    expect(findByIdMock).toHaveBeenCalledWith('tx-original');
    expect(saveCorrectionMock).toHaveBeenCalledOnce();
    const [reversalArg, correctingArg] = saveCorrectionMock.mock.calls[0] as [Transaction, Transaction];
    expect(reversalArg.kind).toBe('reversal');
    expect(correctingArg.kind).toBe('correcting');
    expect(correctingArg.entries[0].amount.amount).toBe(4530);

    expect(recordMock).toHaveBeenCalledOnce();
    expect(recordMock).toHaveBeenCalledWith({
      type: 'TransactionCorrected',
      targetTransactionId: 'tx-original',
      producedTransactionIds: [reversalArg.id, correctingArg.id],
      changedFields: ['amount'],
      reason: 'wrong amount on receipt',
    });

    expect(stdout.captured).toContain(reversalArg.id);
    expect(stdout.captured).toContain(correctingArg.id);
    expect(stdout.captured).toContain('amount');
    expect(exitCodes).toEqual([0]);
  });

  it('saveCorrection is called before record (write-then-record ordering, B1)', async () => {
    const callOrder: string[] = [];
    const { deps } = makeDeps({
      transactionRepository: {
        findById: vi.fn().mockReturnValue(Result.ok(makeOriginal())),
        saveCorrection: vi.fn().mockImplementation(() => {
          callOrder.push('saveCorrection');
          return Result.ok();
        }),
      },
      domainEventRecorder: {
        record: vi.fn().mockImplementation(() => {
          callOrder.push('record');
          return Result.ok();
        }),
      },
    });

    await runCorrectCommand(baseOptions({ amount: '45.30' }), deps);

    expect(callOrder).toEqual(['saveCorrection', 'record']);
  });
});

// fails if: the JSON payload is missing a field, only reports one of two
// simultaneously-changed fields (R8 mock-diversity), or human-readable prose
// leaks into stdout alongside the JSON document.
describe('runCorrectCommand — --json output, multiple changed fields (scenario 2)', () => {
  it('emits a single JSON document naming both changed fields, no human prose mixed in', async () => {
    const { deps, stdout, exitCodes } = makeDeps();

    await runCorrectCommand(
      baseOptions({ amount: '45.30', category: 'Insurance', json: true }),
      deps,
    );

    expect(exitCodes).toEqual([0]);
    const lines = stdout.captured.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      targetTransactionId: string;
      producedTransactionIds: string[];
      changedFields: string[];
      reason: string;
    };
    expect(parsed.targetTransactionId).toBe('tx-original');
    expect(parsed.producedTransactionIds).toHaveLength(2);
    expect(parsed.changedFields).toEqual(['amount', 'account']);
    expect(parsed.reason).toBe('wrong amount on receipt');

    // No human-readable prose leaks into stdout under --json.
    expect(stdout.captured).not.toContain('Correction recorded');
    expect(stdout.captured).not.toContain('Reversal:');
  });
});

function makeReversal(): Transaction {
  return Transaction.create({
    id: 'tx-reversal-target',
    occurredAt: '2026-04-21T14:30:00+02:00',
    description: 'Reversal of tx-original',
    kind: 'reversal',
    correctsId: 'tx-original',
    entries: [
      { account: 'Expense:Transport', side: 'credit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'debit', amount: makeEur(2000) },
    ],
  }).value;
}

// fails if: any error path writes rows or records an event despite failing
// (not-found, reversal-guard, no-fields-guard, write-failure), an exit code
// doesn't match the plan's table (2 validation, 1 unexpected read error, 4
// write failure), or a write-failure message leaks an unredacted DB error.
describe('runCorrectCommand — error paths → exit codes (scenarios 4, 5, 6, 6b)', () => {
  it('(scenario 4) transaction not found: exits 2, stderr names the id, no write/record', async () => {
    const { deps, stderr, exitCodes, saveCorrectionMock, recordMock } = makeDeps({
      transactionRepository: {
        findById: vi.fn().mockReturnValue(Result.ok(null)),
        saveCorrection: vi.fn(),
      },
    });

    await runCorrectCommand(baseOptions({ transactionId: 'tx-bogus', amount: '10.00' }), deps);

    expect(exitCodes).toEqual([2]);
    expect(stderr.captured).toContain('tx-bogus');
    expect(saveCorrectionMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('(unexpected findById read failure) exits 1, stderr redacted, no write/record', async () => {
    const { deps, stderr, exitCodes, saveCorrectionMock, recordMock } = makeDeps({
      transactionRepository: {
        findById: vi.fn().mockReturnValue(Result.fail('SqliteError: database disk image is malformed')),
        saveCorrection: vi.fn(),
      },
    });

    await runCorrectCommand(baseOptions({ amount: '10.00' }), deps);

    expect(exitCodes).toEqual([1]);
    expect(stderr.captured).toContain('tx-original');
    expect(saveCorrectionMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('(scenario 5) rejects correcting a reversal: exits 2, stderr cites "reversal", no write/record', async () => {
    const { deps, stderr, exitCodes, saveCorrectionMock, recordMock } = makeDeps({
      transactionRepository: {
        findById: vi.fn().mockReturnValue(Result.ok(makeReversal())),
        saveCorrection: vi.fn(),
      },
    });

    await runCorrectCommand(baseOptions({ transactionId: 'tx-reversal-target', amount: '10.00' }), deps);

    expect(exitCodes).toEqual([2]);
    expect(stderr.captured.toLowerCase()).toContain('reversal');
    expect(saveCorrectionMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('(scenario 6) no fields to correct: exits 2, stderr cites "at least one field", no write', async () => {
    const { deps, stderr, exitCodes, saveCorrectionMock } = makeDeps();

    await runCorrectCommand(baseOptions(), deps);

    expect(exitCodes).toEqual([2]);
    expect(stderr.captured.toLowerCase()).toContain('at least one field');
    expect(saveCorrectionMock).not.toHaveBeenCalled();
  });

  it('(scenario 6b) saveCorrection write failure: exits 4, sanitizeSqlError-redacted stderr, no record', async () => {
    const collidingHash = 'a'.repeat(64);
    const { deps, stderr, exitCodes, recordMock } = makeDeps({
      transactionRepository: {
        findById: vi.fn().mockReturnValue(Result.ok(makeOriginal())),
        saveCorrection: vi.fn().mockReturnValue(
          Result.fail(`SqliteError: UNIQUE constraint failed: transactions.idempotency_hash = ${collidingHash}`),
        ),
      },
    });

    await runCorrectCommand(baseOptions({ amount: '45.30' }), deps);

    expect(exitCodes).toEqual([4]);
    expect(stderr.captured).not.toContain(collidingHash);
    expect(stderr.captured).toContain('<redacted>');
    expect(recordMock).not.toHaveBeenCalled();
  });
});

// fails if: a record()-failure warning string echoes the literal reason text
// (reason is PII-adjacent per the glossary; only the audit-trail payload
// itself, never a CLI stderr message, should carry it verbatim).
describe('runCorrectCommand — reason-leakage guard (Risks & deferred items)', () => {
  it('a record()-failure warning never echoes the literal reason text', async () => {
    const secretReason = 'IBAN FR7612345987650123456789014 refund correction';
    const { deps, stderr, exitCodes } = makeDeps({
      domainEventRecorder: { record: vi.fn().mockReturnValue(Result.fail('SqliteError: disk I/O error')) },
    });

    await runCorrectCommand(baseOptions({ amount: '45.30', reason: secretReason }), deps);

    expect(exitCodes).toEqual([0]);
    expect(stderr.captured).not.toContain(secretReason);
    expect(stderr.captured).toContain('Warning');
  });
});

// fails if: the correcting entry's date doesn't take the new date, the
// reversal's date moves off the original, or a Date-object round-trip
// silently shifts an offset across a DST transition instead of the raw
// ISO string components being spliced.
describe('runCorrectCommand — --date splicing (Risks: DST-safety, string manipulation only)', () => {
  it('splices the new date onto the original\'s time-of-day + UTC offset', async () => {
    const { deps, saveCorrectionMock } = makeDeps();

    await runCorrectCommand(baseOptions({ date: '2026-04-25' }), deps);

    const [, correctingArg] = saveCorrectionMock.mock.calls[0] as [Transaction, Transaction];
    expect(correctingArg.occurredAt).toBe('2026-04-25T14:30:00+02:00');
  });

  it('does not touch the reversal\'s date (reversal keeps the original date)', async () => {
    const { deps, saveCorrectionMock } = makeDeps();

    await runCorrectCommand(baseOptions({ date: '2026-04-25' }), deps);

    const [reversalArg] = saveCorrectionMock.mock.calls[0] as [Transaction, Transaction];
    expect(reversalArg.occurredAt).toBe('2026-04-21T14:30:00+02:00');
  });

  it('preserves a non-UTC offset verbatim across a DST-transition boundary (no Date round-trip)', async () => {
    // The original sits just before a fictional US-style DST transition (2026-03-08).
    // A pure Date-object round-trip would risk silently shifting the offset when the
    // new date crosses the transition; string-splicing keeps -05:00 verbatim, proving
    // no Date object is ever constructed from the offset-bearing timestamp.
    const dstOriginal = Transaction.create({
      id: 'tx-dst-original',
      occurredAt: '2026-03-07T23:30:00-05:00',
      description: 'Late-night purchase',
      entries: [
        { account: 'Expense:Transport', side: 'debit', amount: makeEur(1000) },
        { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(1000) },
      ],
    }).value;

    const saveCorrectionMock = vi.fn().mockReturnValue(Result.ok());
    const { deps } = makeDeps({
      transactionRepository: {
        findById: vi.fn().mockReturnValue(Result.ok(dstOriginal)),
        saveCorrection: saveCorrectionMock,
      },
    });

    await runCorrectCommand(baseOptions({ transactionId: 'tx-dst-original', date: '2026-03-09' }), deps);

    const [, correctingArg] = saveCorrectionMock.mock.calls[0] as [Transaction, Transaction];
    expect(correctingArg.occurredAt).toBe('2026-03-09T23:30:00-05:00');
  });
});
