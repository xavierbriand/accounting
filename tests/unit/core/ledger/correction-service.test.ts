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
import fc from 'fast-check';
import { Transaction, type Entry } from '@core/ledger/transaction.js';
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

describe('CorrectionService.correct — field-change semantics (scenario 2, 3)', () => {
  it('correcting only the description leaves entries unchanged and names "description" in changedFields', () => {
    const original = makeOriginal();

    const result = CorrectionService.correct(
      original,
      { description: 'Transport (corrected)' },
      ids,
      'typo in description',
    );

    expect(result.isSuccess).toBe(true);
    const { correcting, event } = result.value;

    expect(correcting.description).toBe('Transport (corrected)');
    expect(correcting.entries[0]).toMatchObject({ account: 'Expense:Transport', side: 'debit' });
    expect(correcting.entries[0].amount.amount).toBe(2000);
    expect(correcting.entries[1]).toMatchObject({ account: 'Liabilities:CreditCard', side: 'credit' });
    expect(correcting.entries[1].amount.amount).toBe(2000);
    expect(correcting.occurredAt).toBe(original.occurredAt);
    expect(event.changedFields).toEqual(['description']);
  });

  it('correcting the debit-side account retargets only the debit entry, credit side untouched', () => {
    const original = makeOriginal();

    const result = CorrectionService.correct(
      original,
      { account: 'Expense:Groceries' },
      ids,
      'miscategorized',
    );

    expect(result.isSuccess).toBe(true);
    const { correcting, event } = result.value;

    expect(correcting.entries[0]).toMatchObject({ account: 'Expense:Groceries', side: 'debit' });
    expect(correcting.entries[0].amount.amount).toBe(2000);
    expect(correcting.entries[1]).toMatchObject({ account: 'Liabilities:CreditCard', side: 'credit' });
    expect(event.changedFields).toEqual(['account']);
  });

  it('correcting the date: correcting entry carries the new date, reversal keeps the original date (scenario 3)', () => {
    const original = makeOriginal();
    const newDate = '2026-04-25T09:00:00+02:00';

    const result = CorrectionService.correct(original, { date: newDate }, ids, 'wrong date recorded');

    expect(result.isSuccess).toBe(true);
    const { reversal, correcting, event } = result.value;

    expect(correcting.occurredAt).toBe(newDate);
    expect(reversal.occurredAt).toBe(original.occurredAt);
    expect(event.changedFields).toEqual(['date']);
  });

  it('correcting entry keeps the original date when date is not among the changes', () => {
    const original = makeOriginal();

    const result = CorrectionService.correct(original, { description: 'renamed' }, ids, 'renamed only');

    expect(result.isSuccess).toBe(true);
    expect(result.value.correcting.occurredAt).toBe(original.occurredAt);
  });
});

describe('CorrectionService.correct — input guards (scenarios 4, 5, 8)', () => {
  it('empty reason is rejected (scenario 4) and the message never echoes the (empty) reason text', () => {
    const original = makeOriginal();

    const result = CorrectionService.correct(original, { description: 'x' }, ids, '');

    expect(result.isFailure).toBe(true);
    expect(result.error.toLowerCase()).toContain('reason');
  });

  it('whitespace-only reason is rejected (scenario 4)', () => {
    const original = makeOriginal();

    const result = CorrectionService.correct(original, { description: 'x' }, ids, '   ');

    expect(result.isFailure).toBe(true);
  });

  it('a reason with PII-adjacent text never appears verbatim in a failing result message (reason redaction)', () => {
    const original = makeOriginal();
    const secretReason = 'IBAN FR7612345987650123456789014 refund';

    // Force a failure via cross-currency, carrying the secret reason, to prove it's never echoed.
    const usd = Money.fromCents(2500, 'USD').value;
    const result = CorrectionService.correct(original, { amount: usd }, ids, secretReason);

    expect(result.isFailure).toBe(true);
    expect(result.error).not.toContain(secretReason);
  });

  it('cross-currency correction is rejected citing currency mismatch (scenario 5)', () => {
    const original = makeOriginal();
    const usd = Money.fromCents(2500, 'USD').value;

    const result = CorrectionService.correct(original, { amount: usd }, ids, 'wrong currency entered');

    expect(result.isFailure).toBe(true);
    expect(result.error.toLowerCase()).toContain('currency');
  });

  it('correcting a >2-entry (split) original is rejected, citing split-correction is unsupported (scenario 8)', () => {
    const split = Transaction.create({
      id: 'tx-split',
      occurredAt: '2026-04-21T14:30:00+02:00',
      description: 'Split purchase',
      entries: [
        { account: 'Expense:Food', side: 'debit', amount: makeEur(1000) },
        { account: 'Expense:Household', side: 'debit', amount: makeEur(1000) },
        { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(2000) },
      ],
    }).value;

    const result = CorrectionService.correct(split, { description: 'x' }, ids, 'try to correct a split');

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/split/i);
  });
});

describe('CorrectionService.correct — chaining (scenario 6)', () => {
  it('correcting a prior correcting entry carries correctsId = that correcting entry\'s id', () => {
    const original = makeOriginal();
    const first = CorrectionService.correct(original, { amount: makeEur(2500) }, ids, 'first correction').value;

    const secondIds = { reversalId: 'tx-reversal-2', correctingId: 'tx-correcting-2' };
    const second = CorrectionService.correct(
      first.correcting,
      { description: 'second pass' },
      secondIds,
      'second correction',
    );

    expect(second.isSuccess).toBe(true);
    expect(second.value.reversal.correctsId).toBe(first.correcting.id);
    expect(second.value.correcting.correctsId).toBe(first.correcting.id);
  });
});

describe('CorrectionService.correct — core invariants as properties (Story 4.0 model note inv 1, 5)', () => {
  function netByAccount(entries: readonly Entry[]): Map<string, number> {
    const net = new Map<string, number>();
    for (const entry of entries) {
      const sign = entry.side === 'debit' ? 1 : -1;
      net.set(entry.account, (net.get(entry.account) ?? 0) + sign * entry.amount.amount);
    }
    return net;
  }

  it('invariant 1: reversal + original net to zero on every account, for any balanced two-entry original and any amount correction', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        (originalCents, correctedCents) => {
          const original = Transaction.create({
            id: 'prop-original',
            occurredAt: '2026-04-21T14:30:00+02:00',
            description: 'property original',
            entries: [
              { account: 'Expense:Transport', side: 'debit', amount: makeEur(originalCents) },
              { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(originalCents) },
            ],
          }).value;

          const result = CorrectionService.correct(
            original,
            { amount: makeEur(correctedCents) },
            ids,
            'property: amount correction',
          );
          if (result.isFailure) return false;

          const { reversal } = result.value;
          const net = netByAccount([...original.entries, ...reversal.entries]);
          return [...net.values()].every((n) => n === 0);
        },
      ),
    );
  });

  it('invariant 5: the three-row group (original + reversal + correcting) nets, per account, to exactly what a single corrected transaction would show', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        (originalCents, correctedCents) => {
          const original = Transaction.create({
            id: 'prop-original-2',
            occurredAt: '2026-04-21T14:30:00+02:00',
            description: 'property original',
            entries: [
              { account: 'Expense:Transport', side: 'debit', amount: makeEur(originalCents) },
              { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(originalCents) },
            ],
          }).value;

          const result = CorrectionService.correct(
            original,
            { amount: makeEur(correctedCents) },
            ids,
            'property: observational equality',
          );
          if (result.isFailure) return false;

          const { reversal, correcting } = result.value;
          const threeRowNet = netByAccount([...original.entries, ...reversal.entries, ...correcting.entries]);

          const singleCorrected = Transaction.create({
            id: 'prop-single-corrected',
            occurredAt: original.occurredAt,
            description: original.description,
            entries: [
              { account: 'Expense:Transport', side: 'debit', amount: makeEur(correctedCents) },
              { account: 'Liabilities:CreditCard', side: 'credit', amount: makeEur(correctedCents) },
            ],
          }).value;
          const singleNet = netByAccount(singleCorrected.entries);

          if (threeRowNet.size !== singleNet.size) return false;
          for (const [account, net] of singleNet) {
            if (threeRowNet.get(account) !== net) return false;
          }
          return true;
        },
      ),
    );
  });
});
