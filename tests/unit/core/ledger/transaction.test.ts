import { describe, it, expect } from 'vitest';
import { Transaction } from '@core/ledger/transaction';
import { Money } from '@core/shared/money';

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
});
