import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Transaction } from '@core/ledger/transaction.js';
import { Money } from '@core/shared/money.js';

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeUsd(cents: number): Money {
  return Money.fromCents(cents, 'USD').value;
}

describe('Transaction.create', () => {
  it('rejects an unbalanced transaction (debit=100 credit=99)', () => {
    const result = Transaction.create({
      id: 'tx-1',
      occurredAt: '2026-04-21T14:00:00+02:00',
      description: 'test',
      entries: [
        { account: 'Expense:Transport', side: 'debit', amount: makeEur(100) },
        { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(99) },
      ],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/^Invariant Violation: debits/);
  });

  it('accepts a balanced, single-currency transaction', () => {
    const result = Transaction.create({
      id: 'tx-2',
      occurredAt: '2026-04-21T14:00:00+02:00',
      description: 'transport',
      entries: [
        { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
        { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
      ],
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.id).toBe('tx-2');
    expect(result.value.entries).toHaveLength(2);
  });

  it('rejects mixed-currency transaction', () => {
    const result = Transaction.create({
      id: 'tx-3',
      occurredAt: '2026-04-21T14:00:00+02:00',
      description: 'test',
      entries: [
        { account: 'Expense:Transport', side: 'debit', amount: makeEur(100) },
        { account: 'Liabilities:CreditCard', side: 'credit', amount: makeUsd(100) },
      ],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/^Invariant Violation:.*currency/i);
  });

  it('rejects a draft containing a negative amount entry', () => {
    const result = Transaction.create({
      id: 'tx-4',
      occurredAt: '2026-04-21T14:00:00+02:00',
      description: 'test',
      entries: [
        { account: 'Expense:Transport', side: 'debit', amount: makeEur(-1) },
        { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(-1) },
      ],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/^Invariant Violation: amount/);
  });

  it('rejects a draft with fewer than 2 entries', () => {
    const result = Transaction.create({
      id: 'tx-5',
      occurredAt: '2026-04-21T14:00:00+02:00',
      description: 'test',
      entries: [
        { account: 'Expense:Transport', side: 'debit', amount: makeEur(100) },
      ],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/^Invariant Violation:/);
  });

  describe('Properties (fast-check)', () => {
    it('balanced debit/credit arrays in one currency always succeed and preserve entry order/currency', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat({ max: 100_000 }), { minLength: 1, maxLength: 5 }),
          (amounts) => {
            const total = amounts.reduce((s, n) => s + n, 0);
            if (total === 0) return true; // zero-sum not interesting but valid
            const entries = [
              ...amounts.map((n, i) => ({
                account: `Debit:${i}`,
                side: 'debit' as const,
                amount: makeEur(n),
              })),
              { account: 'Credit:0', side: 'credit' as const, amount: makeEur(total) },
            ];
            const result = Transaction.create({
              id: 'prop-tx',
              occurredAt: '2026-04-21T14:00:00+02:00',
              description: 'property test',
              entries,
            });
            if (!result.isSuccess) return false;
            const tx = result.value;
            return (
              tx.entries.length === entries.length &&
              tx.entries.every((e, i) => e.amount.currency === 'EUR' && e.side === entries[i].side)
            );
          },
        ),
      );
    });

    it('any non-zero perturbation of the credit total causes failure', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 100_000 }),
          fc.integer({ min: 1, max: 50 }),
          (debitCents, delta) => {
            const result = Transaction.create({
              id: 'prop-tx-imbalance',
              occurredAt: '2026-04-21T14:00:00+02:00',
              description: 'property imbalance',
              entries: [
                { account: 'Debit', side: 'debit', amount: makeEur(debitCents) },
                { account: 'Credit', side: 'credit', amount: makeEur(debitCents + delta) },
              ],
            });
            return result.isFailure;
          },
        ),
      );
    });
  });

  describe('kind + correctsId (Story 4.2a)', () => {
    it('defaults kind to "original" and correctsId to undefined when omitted', () => {
      const result = Transaction.create({
        id: 'tx-kind-default',
        occurredAt: '2026-04-21T14:00:00+02:00',
        description: 'test',
        entries: [
          { account: 'Expense:Transport', side: 'debit', amount: makeEur(100) },
          { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(100) },
        ],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.kind).toBe('original');
      expect(result.value.correctsId).toBeUndefined();
    });

    it('accepts an explicit kind + correctsId (reversal)', () => {
      const result = Transaction.create({
        id: 'tx-reversal',
        occurredAt: '2026-04-21T14:00:00+02:00',
        description: 'reversal of tx-original',
        kind: 'reversal',
        correctsId: 'tx-original',
        entries: [
          { account: 'Liabilities:CreditCard', side: 'debit', amount: makeEur(100) },
          { account: 'Expense:Transport', side: 'credit', amount: makeEur(100) },
        ],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.kind).toBe('reversal');
      expect(result.value.correctsId).toBe('tx-original');
    });

    it('accepts an explicit kind + correctsId (correcting)', () => {
      const result = Transaction.create({
        id: 'tx-correcting',
        occurredAt: '2026-04-21T14:00:00+02:00',
        description: 'corrected transport',
        kind: 'correcting',
        correctsId: 'tx-original',
        entries: [
          { account: 'Expense:Transport', side: 'debit', amount: makeEur(150) },
          { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(150) },
        ],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.kind).toBe('correcting');
      expect(result.value.correctsId).toBe('tx-original');
    });

    it('existing invariants (balance, entry count) still apply when kind is set', () => {
      const result = Transaction.create({
        id: 'tx-unbalanced-reversal',
        occurredAt: '2026-04-21T14:00:00+02:00',
        description: 'bad reversal',
        kind: 'reversal',
        correctsId: 'tx-original',
        entries: [
          { account: 'Liabilities:CreditCard', side: 'debit', amount: makeEur(100) },
          { account: 'Expense:Transport', side: 'credit', amount: makeEur(99) },
        ],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toMatch(/^Invariant Violation: debits/);
    });
  });
});
