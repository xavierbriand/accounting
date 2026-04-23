/**
 * Unit tests for TransactionBuilder.
 *
 * Slice 1 (obvious basics): direction table, auto-tag match + Uncategorized fallback,
 *   buildAll built/failed split + order preservation, distinct UUIDs,
 *   description pass-through, occurredAt pass-through.
 *
 * Slice 2 (card-settlement classifier): see bottom of this file — tests are initially skipped
 * and enabled in the separate failing-test commit for that slice.
 *
 * Story 2.5: BuildOutcome carries idempotencyHash from the FreshIngestItem input.
 *
 * fails if: direction→debit/credit rows wrong, auto-tag seed absent, Uncategorized fallback
 *   not implemented, buildAll aborts on one failure, ordering lost, idGen called once and reused,
 *   description/occurredAt mutated by the builder,
 *   or BuildOutcome.idempotencyHash is missing/incorrect (Story 2.5).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionBuilder } from '../../../../src/core/ingest/transaction-builder.js';
import type { AccountConfig } from '../../../../src/core/config/app-config.js';
import type { IngestItem, FreshIngestItem } from '../../../../src/core/ingest/types.js';
import { Money } from '../../../../src/core/shared/money.js';

const bankAccount: AccountConfig = {
  id: 'main-1',
  type: 'bank',
  filenamePrefix: '12345678901_',
};

const cardAccount: AccountConfig = {
  id: 'card-1234',
  type: 'card',
  cardSuffix: '1234',
  filenamePrefix: 'carte_1234_',
};

const accounts: readonly AccountConfig[] = [bankAccount, cardAccount];

function eur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeItem(
  overrides: Partial<IngestItem> & Pick<IngestItem, 'sourceAccount' | 'direction'>,
): IngestItem {
  return {
    occurredAt: '2026-04-20T00:00:00+02:00',
    description: 'UBER TRIP 2026',
    amount: eur(2000),
    ...overrides,
  };
}

let idSeq = 0;
const seqIdGen = (): string => `test-id-${++idSeq}`;

// Helper: wrap an IngestItem in a FreshIngestItem for builder.build() calls.
// Existing tests that call builder.build(item) use a sentinel hash; the hash value
// is not what these tests assert, so any non-empty string works.
function asFresh(item: IngestItem): FreshIngestItem {
  return { item, idempotencyHash: 'test-hash' };
}

// Helper: wrap an IngestItem array in FreshIngestItem[] for buildAll() calls.
function asFreshArray(items: IngestItem[]): FreshIngestItem[] {
  return items.map((item) => ({ item, idempotencyHash: 'test-hash' }));
}

describe('TransactionBuilder — obvious basics', () => {
  beforeEach(() => { idSeq = 0; });

  describe('Scenario AC1/AC2: expense on a bank account (bank + outflow)', () => {
    it('returns Result.ok with classification=expense, category=Transport, confidence=high', () => {
      // fails if: bank→outflow row routes to wrong accounts, or Uber rule absent
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'UBER TRIP 2026' });
      const result = builder.build(asFresh(item));

      expect(result.isSuccess).toBe(true);
      const outcome = result.value;
      expect(outcome.classification).toBe('expense');
      expect(outcome.category).toBe('Transport');
      expect(outcome.confidence).toBe('high');
    });

    it('transaction has debit Expense:Transport and credit Assets:Bank:main-1', () => {
      // fails if: direction table maps bank+outflow to wrong credit account
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'UBER TRIP 2026', amount: eur(2000) });
      const outcome = builder.build(asFresh(item)).value;
      const entries = outcome.transaction.entries;

      const debit = entries.find((e) => e.side === 'debit');
      const credit = entries.find((e) => e.side === 'credit');
      expect(debit?.account).toBe('Expense:Transport');
      expect(credit?.account).toBe('Assets:Bank:main-1');
      expect(debit?.amount.amount).toBe(2000);
      expect(credit?.amount.amount).toBe(2000);
    });
  });

  describe('Scenario: expense on a card account (card + outflow)', () => {
    it('routes credit to Liabilities:CreditCard, not Assets:Bank', () => {
      // fails if: card→outflow row routes to Assets:Bank instead of Liabilities:CreditCard
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'card-1234',
        direction: 'outflow',
        description: 'CARREFOUR MARKET',
        amount: eur(4200),
      });
      const outcome = builder.build(asFresh(item)).value;
      const entries = outcome.transaction.entries;

      expect(outcome.category).toBe('Groceries');
      const debit = entries.find((e) => e.side === 'debit');
      const credit = entries.find((e) => e.side === 'credit');
      expect(debit?.account).toBe('Expense:Groceries');
      expect(credit?.account).toBe('Liabilities:CreditCard:card-1234');
    });
  });

  describe('Scenario: income/refund on a card account (card + inflow)', () => {
    it('reverses sides: debit CreditCard, credit Income', () => {
      // fails if: inflow on a card is treated as expense (would wrongly increase CC liability)
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'card-1234',
        direction: 'inflow',
        description: 'REMBOURSEMENT MUTUELLE',
        amount: eur(1500),
      });
      const outcome = builder.build(asFresh(item)).value;

      expect(outcome.classification).toBe('income');
      expect(outcome.category).toBe('Insurance');
      const debit = outcome.transaction.entries.find((e) => e.side === 'debit');
      const credit = outcome.transaction.entries.find((e) => e.side === 'credit');
      expect(debit?.account).toBe('Liabilities:CreditCard:card-1234');
      expect(credit?.account).toBe('Income:Insurance');
    });
  });

  describe('Scenario: bank account inflow → income', () => {
    it('routes to debit Assets:Bank, credit Income', () => {
      // fails if: bank+inflow row routes credit to Expense instead of Income
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'inflow',
        description: 'REMBOURSEMENT EDF',
        amount: eur(5000),
      });
      const outcome = builder.build(asFresh(item)).value;

      expect(outcome.classification).toBe('income');
      const debit = outcome.transaction.entries.find((e) => e.side === 'debit');
      const credit = outcome.transaction.entries.find((e) => e.side === 'credit');
      expect(debit?.account).toBe('Assets:Bank:main-1');
      expect(credit?.account).toBe('Income:Utilities');
    });
  });

  describe('Scenario: unmatched description → Uncategorized, confidence=low', () => {
    it('sets category=Uncategorized and confidence=low, does NOT drop the item', () => {
      // fails if: unmatched items get dropped (silent data loss), or confidence reports 'high'
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        description: 'WEIRD MERCHANT XYZ',
      });
      const result = builder.build(asFresh(item));

      expect(result.isSuccess).toBe(true);
      expect(result.value.category).toBe('Uncategorized');
      expect(result.value.confidence).toBe('low');
      expect(result.value.classification).toBe('expense');
    });
  });

  describe('Scenario: batch buildAll preserves input order and splits built/failed', () => {
    it('built.length == 4, failed.length == 1, order preserved', () => {
      // fails if: one bad item aborts the batch, or ordering is lost
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const goodItem = (desc: string): IngestItem =>
        makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: desc });

      const items: IngestItem[] = [
        goodItem('UBER TRIP A'),
        goodItem('UBER TRIP B'),
        makeItem({ sourceAccount: 'unknown-account', direction: 'outflow' }),
        goodItem('UBER TRIP D'),
        goodItem('UBER TRIP E'),
      ];

      const result = builder.buildAll(asFreshArray(items));
      expect(result.isSuccess).toBe(true);
      const batch = result.value;
      expect(batch.built).toHaveLength(4);
      expect(batch.failed).toHaveLength(1);
      expect(batch.failed[0].item).toBe(items[2]);
    });

    it('built items appear in the same relative order as input', () => {
      // fails if: ordering is lost (e.g. parallel processing without sort)
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const items: IngestItem[] = [
        makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'UBER TRIP 1', amount: eur(100) }),
        makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'CARREFOUR', amount: eur(200) }),
        makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'NETFLIX', amount: eur(1499) }),
      ];
      const batch = builder.buildAll(asFreshArray(items)).value;
      expect(batch.built[0].transaction.description).toBe('UBER TRIP 1');
      expect(batch.built[1].transaction.description).toBe('CARREFOUR');
      expect(batch.built[2].transaction.description).toBe('NETFLIX');
    });
  });

  describe('Scenario: batch buildAll assigns a distinct Transaction.id per item', () => {
    it('5 valid items → 5 distinct ids', () => {
      // fails if: idGen is called once in the constructor and reused,
      // or a cached UUID leaks across items
      let callCount = 0;
      const uniqueIdGen = (): string => `uid-${++callCount}`;
      const builder = new TransactionBuilder(accounts, undefined, uniqueIdGen);

      const items: IngestItem[] = Array.from({ length: 5 }, (_, i) =>
        makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: `UBER ${i}` }),
      );
      const batch = builder.buildAll(asFreshArray(items)).value;

      const ids = batch.built.map((o) => o.transaction.id);
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe('Scenario: Transaction.description pass-through', () => {
    it('transaction.description === original item.description, NOT the category', () => {
      // fails if: the category leaks into description, or builder rewrites the description
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        description: 'UBER TRIP 2026-04-20',
      });
      const outcome = builder.build(asFresh(item)).value;
      expect(outcome.transaction.description).toBe('UBER TRIP 2026-04-20');
      expect(outcome.transaction.description).not.toBe('Transport');
    });
  });

  describe('Scenario: Transaction.occurredAt pass-through', () => {
    it('transaction.occurredAt === original item.occurredAt, no reformat', () => {
      // fails if: the builder re-parses and re-serialises the timestamp,
      // or strips the offset (Story 2.2 idempotency hash depends on exact string)
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        occurredAt: '2026-04-20T00:00:00+02:00',
      });
      const outcome = builder.build(asFresh(item)).value;
      expect(outcome.transaction.occurredAt).toBe('2026-04-20T00:00:00+02:00');
    });
  });

  describe('Story 2.5: buildAll accepts FreshIngestItem[] and threads idempotencyHash into BuildOutcome', () => {
    it('BuildOutcome.idempotencyHash equals the hash supplied in FreshIngestItem', () => {
      // fails if: buildAll drops or ignores idempotencyHash from FreshIngestItem,
      //           or if the hash is overwritten with a different value in makeOutcome.
      //           This guards the chain: IdempotencyService → buildAll → saveBatch.
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({ sourceAccount: 'main-1', direction: 'outflow' });
      const freshItem: FreshIngestItem = { item, idempotencyHash: 'abc123hash' };

      const result = builder.buildAll([freshItem]);
      expect(result.isSuccess).toBe(true);
      const { built, failed } = result.value;
      expect(failed).toHaveLength(0);
      expect(built).toHaveLength(1);
      expect(built[0].idempotencyHash).toBe('abc123hash');
    });

    it('each outcome carries its own hash when multiple fresh items are provided', () => {
      // fails if: hash from item[0] is applied to all outcomes (off-by-one in loop)
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const freshItems: FreshIngestItem[] = [
        { item: makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'UBER TRIP 1' }), idempotencyHash: 'hash-one' },
        { item: makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'UBER TRIP 2' }), idempotencyHash: 'hash-two' },
        { item: makeItem({ sourceAccount: 'main-1', direction: 'outflow', description: 'UBER TRIP 3' }), idempotencyHash: 'hash-three' },
      ];

      const result = builder.buildAll(freshItems);
      expect(result.isSuccess).toBe(true);
      const { built } = result.value;
      expect(built).toHaveLength(3);
      expect(built[0].idempotencyHash).toBe('hash-one');
      expect(built[1].idempotencyHash).toBe('hash-two');
      expect(built[2].idempotencyHash).toBe('hash-three');
    });
  });
});

describe('TransactionBuilder — card-settlement classifier', () => {
  beforeEach(() => { idSeq = 0; });

  describe('Scenario AC/#26: PAIEMENT CARTE on main account → internal transfer', () => {
    it('matches PAIEMENT CARTE X1234 and classifies as internal-transfer', () => {
      // fails if: the classifier doesn't run, or it doesn't recognise the PAIEMENT CARTE pattern
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        description: 'PAIEMENT CARTE X1234 AVRIL',
        amount: eur(52345),
      });
      const result = builder.build(asFresh(item));
      expect(result.isSuccess).toBe(true);
      const outcome = result.value;
      expect(outcome.classification).toBe('internal-transfer');
      expect(outcome.category).toBe('InternalTransfer');
      expect(outcome.confidence).toBe('high');
    });

    it('debit Liabilities:CreditCard:card-1234, credit Assets:Bank:main-1', () => {
      // fails if: the internal-transfer entries swap debit/credit sides,
      // or it resolves to the wrong card account id
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        description: 'PAIEMENT CARTE X1234 AVRIL',
        amount: eur(52345),
      });
      const outcome = builder.build(asFresh(item)).value;
      const debit = outcome.transaction.entries.find((e) => e.side === 'debit');
      const credit = outcome.transaction.entries.find((e) => e.side === 'credit');
      expect(debit?.account).toBe('Liabilities:CreditCard:card-1234');
      expect(credit?.account).toBe('Assets:Bank:main-1');
      expect(debit?.amount.amount).toBe(52345);
      expect(credit?.amount.amount).toBe(52345);
    });

    it('also matches without X prefix: PAIEMENT CARTE 1234', () => {
      // fails if: the regex requires the X prefix (some BPCE statements omit it)
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        description: 'PAIEMENT CARTE 1234',
        amount: eur(10000),
      });
      const outcome = builder.build(asFresh(item)).value;
      expect(outcome.classification).toBe('internal-transfer');
    });
  });

  describe('Scenario: PAIEMENT CARTE with unknown suffix → Uncategorized expense, confidence=low', () => {
    it('falls back to expense when suffix matches no card', () => {
      // fails if: the classifier silently guesses a card, or hard-fails the item (silent data loss)
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'main-1',
        direction: 'outflow',
        description: 'PAIEMENT CARTE X9999',
        amount: eur(10000),
      });
      const result = builder.build(asFresh(item));
      expect(result.isSuccess).toBe(true);
      const outcome = result.value;
      expect(outcome.classification).toBe('expense');
      expect(outcome.category).toBe('Uncategorized');
      expect(outcome.confidence).toBe('low');
    });
  });

  describe('Scenario: card-sourced item is NOT classified by the card-settlement classifier', () => {
    it('PAIEMENT CARTE on a card account is treated as regular expense, not internal-transfer', () => {
      // fails if: the classifier runs against card-sourced items
      // (should only fire when sourceAccount.type === 'bank')
      const builder = new TransactionBuilder(accounts, undefined, seqIdGen);
      const item = makeItem({
        sourceAccount: 'card-1234',
        direction: 'outflow',
        description: 'PAIEMENT CARTE X1234',
        amount: eur(10000),
      });
      const outcome = builder.build(asFresh(item)).value;
      expect(outcome.classification).not.toBe('internal-transfer');
      expect(outcome.classification).toBe('expense');
    });
  });
});
