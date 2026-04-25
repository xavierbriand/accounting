import {
  dinero,
  add,
  subtract,
  equal,
  allocate,
  toSnapshot,
  type Dinero,
  type DineroCurrency,
} from 'dinero.js';
import * as currencies from 'dinero.js/currencies';
import { Result } from './result.js';

const currencyMap: Record<string, DineroCurrency<number>> =
  currencies as unknown as Record<string, DineroCurrency<number>>;

export class Money {
  private readonly _dinero: Dinero<number>;

  private constructor(d: Dinero<number>) {
    this._dinero = d;
  }

  public static fromCents(amount: number, currency: string): Result<Money> {
    if (!Number.isInteger(amount)) {
      return Result.fail<Money>('Money amount must be an integer (cents).');
    }
    const currencyDef = currencyMap[currency];
    if (!currencyDef) {
      return Result.fail<Money>(`Unknown currency code: ${currency}. Must be a valid ISO 4217 currency.`);
    }
    return Result.ok(new Money(dinero({ amount, currency: currencyDef })));
  }

  public static fromDecimal(amount: number, currency: string, precision: number = 2): Result<Money> {
    const factor = Math.pow(10, precision);
    const rawCents = amount * factor;
    const roundedCents = Money.bankersRound(rawCents);

    return Money.fromCents(roundedCents, currency);
  }

  /**
   * Rounds a number using the "Round Half to Even" strategy (also known as Banker's Rounding).
   *
   * This method reduces rounding bias when operating on large datasets by rounding to the nearest even number
   * when the fraction is exactly 0.5.
   *
   * Examples:
   * - 2.5 -> 2
   * - 3.5 -> 4
   * - 2.4 -> 2
   * - 2.6 -> 3
   *
   * @param num The number to round
   * @returns The rounded integer
   */
  private static bankersRound(num: number): number {
    // Epsilon for float comparison
    const epsilon = 1e-8;
    const n = num;
    const i = Math.floor(n);
    const f = n - i;

    // Check if fraction is exactly 0.5 (within epsilon)
    if (Math.abs(f - 0.5) < epsilon) {
      return i % 2 === 0 ? i : i + 1;
    }

    // Otherwise standard round
    return Math.round(n);
  }

  public get amount(): number {
    return toSnapshot(this._dinero).amount;
  }

  public get currency(): string {
    return toSnapshot(this._dinero).currency.code;
  }

  public add(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return Result.fail<Money>(
        `Cannot add money with different currencies: ${this.currency} vs ${other.currency}`
      );
    }
    return Result.ok(new Money(add(this._dinero, other._dinero)));
  }

  public subtract(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return Result.fail<Money>(
        `Cannot subtract money with different currencies: ${this.currency} vs ${other.currency}`
      );
    }
    return Result.ok(new Money(subtract(this._dinero, other._dinero)));
  }

  public toString(): string {
    const { amount, currency } = toSnapshot(this._dinero);
    return `${currency.code} ${(amount / 10 ** currency.exponent).toFixed(currency.exponent)}`;
  }

  public equals(other: Money): boolean {
    return equal(this._dinero, other._dinero);
  }

  /**
   * Allocates the money into parts (e.g., 50/50 split).
   * Uses Largest Remainder Method (Dinero default) to ensure sum(parts) == total.
   */
  public allocate(ratios: number[]): Result<Money[]> {
    if (ratios.some((r) => r < 0)) {
      return Result.fail('Allocation ratios cannot be negative.');
    }

    const shares = allocate(this._dinero, ratios);
    return Result.ok(shares.map((share) => new Money(share)));
  }

  /**
   * Helper for tests
   */
  public static zero(currency: string = 'EUR'): Money {
    const currencyDef = currencyMap[currency];
    if (!currencyDef) {
      throw new Error(`Unknown currency code: ${currency}. Must be a valid ISO 4217 currency.`);
    }
    return new Money(dinero({ amount: 0, currency: currencyDef }));
  }
}
