import type { AccountConfig } from '@core/config/app-config.js';
import type { UuidGen } from '@core/ports/uuid-gen.js';
import type { IngestItem, BuildOutcome, BuildBatchOutcome } from './types.js';
import type { AutoTagRule } from './auto-tag-rules.js';
import { DEFAULT_RULES } from './auto-tag-rules.js';
import { bankAccount, cardAccount, expenseAccount, incomeAccount } from './account-names.js';
import { Transaction } from '@core/ledger/transaction.js';
import { Result } from '@core/shared/result.js';

const defaultUuidGen: UuidGen = (): string =>
  // Replaced at the CLI assembly point (Story 2.4). Core has no access to node:crypto.
  // Tests must inject a deterministic sequence via the constructor.
  (() => { throw new Error('TransactionBuilder: idGen not wired — provide a UuidGen in constructor'); })();

function tagDescription(description: string, rules: readonly AutoTagRule[]): { category: string; confidence: 'high' | 'low' } {
  const matched = rules.find((r) => r.pattern.test(description));
  if (matched) {
    return { category: matched.category, confidence: 'high' };
  }
  return { category: 'Uncategorized', confidence: 'low' };
}

export class TransactionBuilder {
  constructor(
    private readonly accounts: readonly AccountConfig[],
    private readonly rules: readonly AutoTagRule[] = DEFAULT_RULES,
    private readonly idGen: UuidGen = defaultUuidGen,
  ) {}

  build(item: IngestItem): Result<BuildOutcome> {
    const source = this.accounts.find((a) => a.id === item.sourceAccount);
    if (!source) {
      return Result.fail(`Unknown sourceAccount: ${item.sourceAccount}`);
    }

    const { category, confidence } = tagDescription(item.description, this.rules);

    const id = this.idGen();

    if (source.type === 'bank' && item.direction === 'outflow') {
      const txResult = Transaction.create({
        id,
        occurredAt: item.occurredAt,
        description: item.description,
        entries: [
          { account: expenseAccount(category), side: 'debit', amount: item.amount },
          { account: bankAccount(source.id), side: 'credit', amount: item.amount },
        ],
      });
      if (txResult.isFailure) return Result.fail(txResult.error);
      return Result.ok({ transaction: txResult.value, category, classification: 'expense', confidence });
    }

    if (source.type === 'bank' && item.direction === 'inflow') {
      const txResult = Transaction.create({
        id,
        occurredAt: item.occurredAt,
        description: item.description,
        entries: [
          { account: bankAccount(source.id), side: 'debit', amount: item.amount },
          { account: incomeAccount(category), side: 'credit', amount: item.amount },
        ],
      });
      if (txResult.isFailure) return Result.fail(txResult.error);
      return Result.ok({ transaction: txResult.value, category, classification: 'income', confidence });
    }

    if (source.type === 'card' && item.direction === 'outflow') {
      const txResult = Transaction.create({
        id,
        occurredAt: item.occurredAt,
        description: item.description,
        entries: [
          { account: expenseAccount(category), side: 'debit', amount: item.amount },
          { account: cardAccount(source.id), side: 'credit', amount: item.amount },
        ],
      });
      if (txResult.isFailure) return Result.fail(txResult.error);
      return Result.ok({ transaction: txResult.value, category, classification: 'expense', confidence });
    }

    // card + inflow (refund/income)
    const txResult = Transaction.create({
      id,
      occurredAt: item.occurredAt,
      description: item.description,
      entries: [
        { account: cardAccount(source.id), side: 'debit', amount: item.amount },
        { account: incomeAccount(category), side: 'credit', amount: item.amount },
      ],
    });
    if (txResult.isFailure) return Result.fail(txResult.error);
    return Result.ok({ transaction: txResult.value, category, classification: 'income', confidence });
  }

  buildAll(items: readonly IngestItem[]): Result<BuildBatchOutcome> {
    const built: BuildOutcome[] = [];
    const failed: { item: IngestItem; reason: string }[] = [];

    for (const item of items) {
      const result = this.build(item);
      if (result.isSuccess) {
        built.push(result.value);
      } else {
        failed.push({ item, reason: result.error });
      }
    }

    return Result.ok({ built, failed });
  }
}
