import type { AccountConfig } from '@core/config/app-config.js';
import type { UuidGen } from '@core/ports/uuid-gen.js';
import type { IngestItem, BuildOutcome, BuildBatchOutcome, Classification, Confidence } from './types.js';
import type { AutoTagRule } from './auto-tag-rules.js';
import { DEFAULT_RULES } from './auto-tag-rules.js';
import { bankAccount, cardAccount, expenseAccount, incomeAccount } from './account-names.js';
import { Transaction } from '@core/ledger/transaction.js';
import { Result } from '@core/shared/result.js';

// Matches French bank descriptions like:
//   "PAIEMENT CARTE X1234 AVRIL"
//   "PAIEMENT CARTE 1234"
// Capture group 1 is the 4-digit suffix.
const CARD_SETTLEMENT_RE = /^PAIEMENT\s+CARTE\s+X?(\d{4})(?:\s.*)?$/i;

// Replaced at the CLI assembly point (Story 2.4). Core has no access to node:crypto.
const defaultUuidGen: UuidGen = (): string => {
  throw new Error('TransactionBuilder: idGen not wired — provide a UuidGen in constructor');
};

function tagDescription(description: string, rules: readonly AutoTagRule[]): { category: string; confidence: Confidence } {
  const matched = rules.find((r) => r.pattern.test(description));
  if (matched) {
    return { category: matched.category, confidence: 'high' };
  }
  return { category: 'Uncategorized', confidence: 'low' };
}

function tryCardSettlement(
  item: IngestItem,
  source: AccountConfig,
  accounts: readonly AccountConfig[],
): { category: string; classification: Classification; confidence: Confidence; cardId: string } | null {
  if (source.type !== 'bank') return null;

  const match = CARD_SETTLEMENT_RE.exec(item.description);
  if (!match) return null;

  const suffix = match[1];
  const matchingCards = accounts.filter((a) => a.type === 'card' && a.cardSuffix === suffix);

  if (matchingCards.length !== 1) {
    // Zero or multiple matches → fall back to regular expense path (not silent data loss)
    return null;
  }

  return {
    category: 'InternalTransfer',
    classification: 'internal-transfer',
    confidence: 'high',
    cardId: matchingCards[0].id,
  };
}

function makeOutcome(
  id: string,
  item: IngestItem,
  debitAccount: string,
  creditAccount: string,
  classification: Classification,
  category: string,
  confidence: Confidence,
): Result<BuildOutcome> {
  const txResult = Transaction.create({
    id,
    occurredAt: item.occurredAt,
    description: item.description,
    entries: [
      { account: debitAccount, side: 'debit', amount: item.amount },
      { account: creditAccount, side: 'credit', amount: item.amount },
    ],
  });
  if (txResult.isFailure) return Result.fail(txResult.error);
  return Result.ok({ transaction: txResult.value, category, classification, confidence });
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

    const id = this.idGen();

    const settlement = tryCardSettlement(item, source, this.accounts);
    if (settlement) {
      return makeOutcome(
        id, item,
        cardAccount(settlement.cardId), bankAccount(source.id),
        settlement.classification, settlement.category, settlement.confidence,
      );
    }

    const { category, confidence } = tagDescription(item.description, this.rules);

    if (source.type === 'bank' && item.direction === 'outflow') {
      return makeOutcome(id, item, expenseAccount(category), bankAccount(source.id), 'expense', category, confidence);
    }

    if (source.type === 'bank' && item.direction === 'inflow') {
      return makeOutcome(id, item, bankAccount(source.id), incomeAccount(category), 'income', category, confidence);
    }

    if (source.type === 'card' && item.direction === 'outflow') {
      return makeOutcome(id, item, expenseAccount(category), cardAccount(source.id), 'expense', category, confidence);
    }

    // card + inflow (refund/income)
    return makeOutcome(id, item, cardAccount(source.id), incomeAccount(category), 'income', category, confidence);
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
