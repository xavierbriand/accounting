import { Money } from '../shared/money.js';
import { Result } from '../shared/result.js';
import { randomUUID } from 'crypto';

export interface LedgerEntryProps {
  id: string;
  amount: Money;
  category: string;
  tags: string[];
}

export class LedgerEntry {
  public readonly id: string;
  public readonly amount: Money;
  public readonly category: string;
  public readonly tags: string[];

  private constructor(props: LedgerEntryProps) {
    this.id = props.id;
    this.amount = props.amount;
    this.category = props.category;
    this.tags = props.tags;
  }

  public static create(amount: Money, category: string, tags: string[] = []): Result<LedgerEntry> {
    if (!category) {
      return Result.fail('Category is required');
    }
    return Result.ok(new LedgerEntry({
      id: randomUUID(),
      amount,
      category,
      tags
    }));
  }

  public static reconstruct(props: LedgerEntryProps): LedgerEntry {
    return new LedgerEntry(props);
  }
}

export interface TransactionProps {
  id: string;
  date: Date;
  description: string;
  entries: LedgerEntry[];
}

export class Transaction {
  public readonly id: string;
  public readonly date: Date;
  public readonly description: string;
  public readonly entries: LedgerEntry[];

  private constructor(props: TransactionProps) {
    this.id = props.id;
    this.date = props.date;
    this.description = props.description;
    this.entries = props.entries;
  }

  public static create(
    date: Date,
    description: string,
    entries: LedgerEntry[]
  ): Result<Transaction> {
    if (entries.length < 2) {
      return Result.fail('Transaction must have at least 2 entries (Double Entry).');
    }

    if (!description) {
      return Result.fail('Description is required.');
    }

    // Validate Balance (Sum of all entries must be 0)
    // We assume all entries have the same currency for now.
    // Story 1.2 said "Result.fail if adding different currencies".
    
    let sum = Money.zero(entries[0].amount.currency);
    
    for (const entry of entries) {
      const result = sum.add(entry.amount);
      if (result.isFailure) {
        return Result.fail(result.error as string);
      }
      sum = result.value;
    }

    if (sum.amount !== 0) {
      return Result.fail(`Transaction is not balanced. Sum is ${sum.toString()} (should be 0).`);
    }

    return Result.ok(new Transaction({
      id: randomUUID(),
      date,
      description,
      entries
    }));
  }

  public static reconstruct(props: TransactionProps): Transaction {
    return new Transaction(props);
  }
}
