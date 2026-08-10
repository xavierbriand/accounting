import { Money } from '@core/shared/money.js';

export function makeEur(cents: number): Money {
  return Money.fromCents(cents, 'EUR').value;
}
