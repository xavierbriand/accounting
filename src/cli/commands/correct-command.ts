import type { Writable } from 'stream';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';
import type { UuidGen } from '@core/ports/uuid-gen.js';
import type { CorrectionChanges } from '@core/ledger/correction-changes.js';
import { Transaction } from '@core/ledger/transaction.js';
import { Money } from '@core/shared/money.js';
import { CorrectionService, type CorrectionIds, type CorrectionOutcome } from '@core/ledger/correction-service.js';
import { expenseAccount } from '@core/ingest/account-names.js';
import { sanitizeSqlError } from '../utils/sanitize-sql-error.js';
import { parseCorrectOptions, type CorrectCommandOptions, type ParsedCorrectOptions } from './correct-command-options.js';
import { formatCorrectJson, toDisplayFieldName } from './correct-formatter-json.js';
import { formatJsonError } from '../utils/json-envelope.js';

export interface CorrectCommandDeps {
  readonly transactionRepository: Pick<TransactionRepository, 'findById' | 'saveCorrection'>;
  readonly domainEventRecorder: DomainEventRecorder;
  readonly uuidGen: UuidGen;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
}

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

function spliceDate(originalOccurredAt: string, newDatePart: string): string {
  // Splices the date portion of the original ISO-8601-with-offset string,
  // preserving time-of-day + UTC offset verbatim. String manipulation only —
  // no Date object round-trip — avoids DST-transition offset pitfalls entirely.
  const timePart = originalOccurredAt.slice(10);
  return newDatePart + timePart;
}

function loadOriginal(
  transactionId: string,
  json: boolean,
  deps: Pick<CorrectCommandDeps, 'transactionRepository' | 'stderr' | 'exitCode'>,
): Transaction | null {
  const { transactionRepository, stderr, exitCode } = deps;

  const result = transactionRepository.findById(transactionId);
  if (result.isFailure) {
    const message = `could not load transaction "${transactionId}": ${sanitizeSqlError(result.error)}`;
    writeln(stderr, `error: ${message}`);
    if (json) stderr.write(formatJsonError('correct', { code: 'QUERY_FAILURE', message }));
    exitCode(1);
    return null;
  }
  if (result.value === null) {
    const message = `no transaction found with id "${transactionId}"`;
    writeln(stderr, `error: ${message}`);
    if (json) stderr.write(formatJsonError('correct', { code: 'NOT_FOUND', message }));
    exitCode(2);
    return null;
  }
  return result.value;
}

function buildChanges(parsed: ParsedCorrectOptions, original: Transaction): CorrectionChanges {
  // Money.fromCents cannot fail here: amountCents is always an integer (from
  // parseCentsFromDecimalString) and the currency is already proven valid —
  // it comes from an already-successfully-constructed original Transaction.
  // Mirrors Transaction.ts's own internal `Money.fromCents(...).value` usage.
  const originalCurrency = original.entries[0].amount.currency;
  return {
    amount: parsed.amountCents !== undefined
      ? Money.fromCents(parsed.amountCents, originalCurrency).value
      : undefined,
    account: parsed.category !== undefined ? expenseAccount(parsed.category) : undefined,
    date: parsed.date !== undefined ? spliceDate(original.occurredAt, parsed.date) : undefined,
    description: parsed.description,
  };
}

async function persistAndRecord(
  outcome: CorrectionOutcome,
  json: boolean,
  deps: Pick<CorrectCommandDeps, 'transactionRepository' | 'domainEventRecorder' | 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
  const { transactionRepository, domainEventRecorder, stdout, stderr, exitCode } = deps;
  const { reversal, correcting, event } = outcome;

  const writeResult = transactionRepository.saveCorrection(reversal, correcting);
  if (writeResult.isFailure) {
    const message = `Correction failed: ${sanitizeSqlError(writeResult.error)}`;
    writeln(stderr, message);
    if (json) stderr.write(formatJsonError('correct', { code: 'WRITE_FAILURE', message }));
    exitCode(4);
    return;
  }

  const recordResult = domainEventRecorder.record(event);
  if (recordResult.isFailure) {
    writeln(stderr, `Warning: correction committed successfully but could not record the audit event: ${sanitizeSqlError(recordResult.error)}`);
  }

  renderOutcome(event, json, stdout);
  exitCode(0);
}

function renderOutcome(
  event: CorrectionOutcome['event'],
  json: boolean,
  stdout: Writable,
): void {
  if (json) {
    stdout.write(formatCorrectJson(event));
    return;
  }
  writeln(stdout, `Correction recorded for ${event.targetTransactionId}.`);
  writeln(stdout, `  Reversal:        ${event.producedTransactionIds[0]}`);
  writeln(stdout, `  Correcting:      ${event.producedTransactionIds[1]}`);
  writeln(stdout, `  Changed fields:  ${event.changedFields.map(toDisplayFieldName).join(', ')}`);
}

export async function runCorrectCommand(
  options: CorrectCommandOptions,
  deps: CorrectCommandDeps,
): Promise<void> {
  const { stderr, exitCode } = deps;

  const parsedResult = parseCorrectOptions(options);
  if (parsedResult.isFailure) {
    const message = parsedResult.error;
    writeln(stderr, `error: ${message}`);
    if (options.json) stderr.write(formatJsonError('correct', { code: 'INVALID_ARGUMENT', message }));
    exitCode(2);
    return;
  }
  const parsed = parsedResult.value;

  const original = loadOriginal(parsed.transactionId, parsed.json, deps);
  if (original === null) return;

  const changes = buildChanges(parsed, original);
  const ids: CorrectionIds = { reversalId: deps.uuidGen(), correctingId: deps.uuidGen() };

  const correctionResult = CorrectionService.correct(original, changes, ids, parsed.reason);
  if (correctionResult.isFailure) {
    const message = correctionResult.error;
    writeln(stderr, `error: ${message}`);
    if (parsed.json) stderr.write(formatJsonError('correct', { code: 'INVALID_ARGUMENT', message }));
    exitCode(2);
    return;
  }

  await persistAndRecord(correctionResult.value, parsed.json, deps);
}
