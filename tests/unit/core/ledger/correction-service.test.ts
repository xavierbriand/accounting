/**
 * Unit tests for CorrectionService.correct (Story 4.2a, FR14 — reverse-and-correct).
 *
 * Gherkin coverage: docs/plans/story-4.2a.md scenarios 1 (amount correction), and the
 *   shared "original unchanged" / "reversal mirrors + nets to zero" / event-shape assertions
 *   that recur across every scenario.
 *
 * fails if: CorrectionService.correct mutates the original, emits an unbalanced reversal or
 *   correcting entry, produces a reversal that doesn't mirror the original's sides, or omits/
 *   misshapes the TransactionCorrected event.
 */
import { describe, it, expect } from 'vitest';
import { Transaction } from '@core/ledger/transaction.js';
import { Money } from '@core/shared/money.js';
import { CorrectionService } from '@core/ledger/correction-service.js';

function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}

function makeOriginal(): Transaction {
  return Transaction.create({
    id: 'tx-original',
    occurredAt: '2026-04-21T14:30:00+02:00',
    description: 'Transport',
    entries: [
      { account: 'Expense:Transport', side: 'debit', amount: makeEur(2000) },
      { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
    ],
  }).value;
}

const ids = { reversalId: 'tx-reversal', correctingId: 'tx-correcting' };

describe('CorrectionService.correct — amount correction (scenario 1)', () => {
  it('produces a reversal (mirrored entries, original date), a correcting entry (new amount, original date), and a TransactionCorrected event; original unchanged', () => {
    const original = makeOriginal();

    const result = CorrectionService.correct(
      original,
      { amount: makeEur(2500) },
      ids,
      'undercharged — receipt shows 25.00',
    );

    expect(result.isSuccess).toBe(true);
    const { reversal, correcting, event } = result.value;

    // Reversal: mirrors original entries (sides swapped), same amount, original date.
    expect(reversal.id).toBe('tx-reversal');
    expect(reversal.kind).toBe('reversal');
    expect(reversal.correctsId).toBe('tx-original');
    expect(reversal.occurredAt).toBe('2026-04-21T14:30:00+02:00');
    expect(reversal.entries).toHaveLength(2);
    expect(reversal.entries[0]).toMatchObject({ account: 'Expense:Transport', side: 'credit' });
    expect(reversal.entries[0].amount.amount).toBe(2000);
    expect(reversal.entries[1]).toMatchObject({ account: 'Liabilities:CreditCard', side: 'debit' });
    expect(reversal.entries[1].amount.amount).toBe(2000);

    // Correcting entry: new amount on both entries, original date.
    expect(correcting.id).toBe('tx-correcting');
    expect(correcting.kind).toBe('correcting');
    expect(correcting.correctsId).toBe('tx-original');
    expect(correcting.occurredAt).toBe('2026-04-21T14:30:00+02:00');
    expect(correcting.entries).toHaveLength(2);
    expect(correcting.entries[0]).toMatchObject({ account: 'Expense:Transport', side: 'debit' });
    expect(correcting.entries[0].amount.amount).toBe(2500);
    expect(correcting.entries[1]).toMatchObject({ account: 'Liabilities:CreditCard', side: 'credit' });
    expect(correcting.entries[1].amount.amount).toBe(2500);

    // Event.
    expect(event).toEqual({
      type: 'TransactionCorrected',
      targetTransactionId: 'tx-original',
      producedTransactionIds: ['tx-reversal', 'tx-correcting'],
      changedFields: ['amount'],
      reason: 'undercharged — receipt shows 25.00',
    });

    // Original untouched.
    expect(original.entries).toHaveLength(2);
    expect(original.entries[0].amount.amount).toBe(2000);
    expect(original.kind).toBe('original');
  });

  it('reversal + original net to zero on every account', () => {
    const original = makeOriginal();
    const result = CorrectionService.correct(original, { amount: makeEur(2500) }, ids, 'fix amount');
    const { reversal } = result.value;

    const netByAccount = new Map<string, number>();
    for (const entry of [...original.entries, ...reversal.entries]) {
      const sign = entry.side === 'debit' ? 1 : -1;
      netByAccount.set(entry.account, (netByAccount.get(entry.account) ?? 0) + sign * entry.amount.amount);
    }

    for (const net of netByAccount.values()) {
      expect(net).toBe(0);
    }
  });
});
