import { describe, it, expect } from 'vitest';
import { Transaction } from '@core/ledger/transaction';
import { Money } from '@core/shared/money';

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
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
});
