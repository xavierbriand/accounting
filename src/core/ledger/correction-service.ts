import { Result } from '@core/shared/result.js';
import { Transaction, type Entry } from '@core/ledger/transaction.js';
import type { CorrectionChanges } from '@core/ledger/correction-changes.js';
import type { TransactionCorrected } from '@core/events/domain-event.js';

export interface CorrectionIds {
  readonly reversalId: string;
  readonly correctingId: string;
}

export interface CorrectionOutcome {
  readonly reversal: Transaction;
  readonly correcting: Transaction;
  readonly event: TransactionCorrected;
}

function mirrorSide(side: Entry['side']): Entry['side'] {
  return side === 'debit' ? 'credit' : 'debit';
}

function buildReversal(original: Transaction, reversalId: string): Result<Transaction> {
  return Transaction.create({
    id: reversalId,
    occurredAt: original.occurredAt,
    description: `Reversal of ${original.id}`,
    kind: 'reversal',
    correctsId: original.id,
    entries: original.entries.map((entry) => ({
      account: entry.account,
      side: mirrorSide(entry.side),
      amount: entry.amount,
    })),
  });
}

function buildCorrecting(
  original: Transaction,
  changes: CorrectionChanges,
  correctingId: string,
): Result<Transaction> {
  const occurredAt = changes.date ?? original.occurredAt;
  const description = changes.description ?? original.description;

  const correctedEntries = original.entries.map((entry) => {
    const amount = changes.amount ?? entry.amount;
    const isDebitSide = entry.side === 'debit';
    const account = changes.account && isDebitSide ? changes.account : entry.account;
    return { account, side: entry.side, amount };
  });

  return Transaction.create({
    id: correctingId,
    occurredAt,
    description,
    kind: 'correcting',
    correctsId: original.id,
    entries: correctedEntries,
  });
}

function changedFieldsOf(changes: CorrectionChanges): string[] {
  const fields: string[] = [];
  if (changes.amount) fields.push('amount');
  if (changes.account) fields.push('account');
  if (changes.date) fields.push('date');
  if (changes.description) fields.push('description');
  return fields;
}

export class CorrectionService {
  static correct(
    original: Transaction,
    changes: CorrectionChanges,
    ids: CorrectionIds,
    reason: string,
  ): Result<CorrectionOutcome> {
    if (!reason || reason.trim().length === 0) {
      return Result.fail('CorrectionService: a non-empty reason is required');
    }

    if (original.entries.length > 2) {
      return Result.fail(
        'CorrectionService: correcting a transaction with more than 2 entries is not supported (split-correction deferred, see #183)',
      );
    }

    const built = Result.all([
      buildReversal(original, ids.reversalId),
      buildCorrecting(original, changes, ids.correctingId),
    ]);

    if (built.isFailure) return Result.fail(built.error);
    const [reversal, correcting] = built.value;

    const event: TransactionCorrected = {
      type: 'TransactionCorrected',
      targetTransactionId: original.id,
      producedTransactionIds: [reversal.id, correcting.id],
      changedFields: changedFieldsOf(changes),
      reason,
    };

    return Result.ok({ reversal, correcting, event });
  }
}
