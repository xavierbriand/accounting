/**
 * Unit tests for account-name helpers.
 *
 * Gherkin coverage (Scenario: obvious basics):
 *   - bankAccount(id) returns 'Assets:Bank:<id>'
 *   - cardAccount(id) returns 'Liabilities:CreditCard:<id>'
 *   - expenseAccount(cat) returns 'Expense:<cat>'
 *   - incomeAccount(cat) returns 'Income:<cat>'
 *
 * fails if: any helper returns wrong prefix or wrong separator
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  bankAccount,
  cardAccount,
  expenseAccount,
  incomeAccount,
} from '../../../../src/core/ingest/account-names.js';

describe('bankAccount', () => {
  it('prefixes with Assets:Bank:', () => {
    // fails if bankAccount returns a wrong prefix
    expect(bankAccount('main-1')).toBe('Assets:Bank:main-1');
  });

  it('property: always starts with Assets:Bank:', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (id) => {
        return bankAccount(id).startsWith('Assets:Bank:');
      }),
    );
  });
});

describe('cardAccount', () => {
  it('prefixes with Liabilities:CreditCard:', () => {
    // fails if cardAccount returns a wrong prefix
    expect(cardAccount('card-1234')).toBe('Liabilities:CreditCard:card-1234');
  });

  it('property: always starts with Liabilities:CreditCard:', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (id) => {
        return cardAccount(id).startsWith('Liabilities:CreditCard:');
      }),
    );
  });
});

describe('expenseAccount', () => {
  it('prefixes with Expense:', () => {
    // fails if expenseAccount returns a wrong prefix
    expect(expenseAccount('Transport')).toBe('Expense:Transport');
  });

  it('property: always starts with Expense:', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (cat) => {
        return expenseAccount(cat).startsWith('Expense:');
      }),
    );
  });
});

describe('incomeAccount', () => {
  it('prefixes with Income:', () => {
    // fails if incomeAccount returns a wrong prefix
    expect(incomeAccount('Refund')).toBe('Income:Refund');
  });

  it('property: always starts with Income:', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (cat) => {
        return incomeAccount(cat).startsWith('Income:');
      }),
    );
  });
});
