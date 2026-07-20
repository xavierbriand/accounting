import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';

export type Side = 'debit' | 'credit';

export interface Entry {
  readonly account: string;
  readonly side: Side;
  readonly amount: Money;
}

export interface EntryDraft {
  account: string;
  side: Side;
  amount: Money;
}

export type TransactionKind = 'original' | 'reversal' | 'correcting';

export interface TransactionDraft {
  id: string;
  occurredAt: string;
  description: string;
  entries: EntryDraft[];
  kind?: TransactionKind;
  correctsId?: string;
}

export class Transaction {
  private constructor(
    private readonly _id: string,
    private readonly _occurredAt: string,
    private readonly _description: string,
    private readonly _entries: readonly Entry[],
    private readonly _kind: TransactionKind,
    private readonly _correctsId: string | undefined,
  ) {}

  get id(): string {
    return this._id;
  }

  get occurredAt(): string {
    return this._occurredAt;
  }

  get description(): string {
    return this._description;
  }

  get entries(): readonly Entry[] {
    return this._entries;
  }

  get kind(): TransactionKind {
    return this._kind;
  }

  get correctsId(): string | undefined {
    return this._correctsId;
  }

  static create(draft: TransactionDraft): Result<Transaction> {
    const { id, occurredAt, description, entries, kind = 'original', correctsId } = draft;

    if (entries.length < 2) {
      return Result.fail('Invariant Violation: at least 2 entries are required');
    }

    for (const entry of entries) {
      if (entry.amount.amount < 0) {
        return Result.fail('Invariant Violation: amount must be non-negative');
      }
    }

    const currencies = new Set(entries.map((e) => e.amount.currency));
    if (currencies.size > 1) {
      return Result.fail('Invariant Violation: currency mismatch — all entries must share the same currency');
    }

    const currency = entries[0].amount.currency;
    let debitSum = Money.fromCents(0, currency).value;
    let creditSum = Money.fromCents(0, currency).value;

    for (const entry of entries) {
      if (entry.side === 'debit') {
        const added = debitSum.add(entry.amount);
        /* v8 ignore next -- unreachable: the currency-uniqueness check above already guarantees a shared currency */
        if (added.isFailure) return Result.fail(added.error);
        debitSum = added.value;
      } else {
        const added = creditSum.add(entry.amount);
        /* v8 ignore next -- unreachable: the currency-uniqueness check above already guarantees a shared currency */
        if (added.isFailure) return Result.fail(added.error);
        creditSum = added.value;
      }
    }

    if (!debitSum.equals(creditSum)) {
      return Result.fail(
        `Invariant Violation: debits (${debitSum.amount}) must equal credits (${creditSum.amount})`,
      );
    }

    return Result.ok(new Transaction(id, occurredAt, description, entries, kind, correctsId));
  }
}
