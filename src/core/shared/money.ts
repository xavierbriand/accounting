import Dinero from 'dinero.js';
import { Result } from './result.js';

export class Money {
  private readonly _dinero: Dinero.Dinero;

  private constructor(dinero: Dinero.Dinero) {
    this._dinero = dinero;
  }

  public static fromCents(amount: number, currency: string): Result<Money> {
    if (!Number.isInteger(amount)) {
      return Result.fail<Money>('Money amount must be an integer (cents).');
    }
    return Result.ok(new Money(Dinero({ amount, currency: currency as Dinero.Currency })));
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
      return (i % 2 === 0) ? i : i + 1;
    }
    
    // Otherwise standard round
    return Math.round(n);
  }

  public get amount(): number {
    return this._dinero.getAmount();
  }

  public get currency(): string {
    return this._dinero.getCurrency();
  }

  public add(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return Result.fail<Money>(
        `Cannot add money with different currencies: ${this.currency} vs ${other.currency}`
      );
    }
    return Result.ok(new Money(this._dinero.add(other._dinero)));
  }

  public subtract(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return Result.fail<Money>(
        `Cannot subtract money with different currencies: ${this.currency} vs ${other.currency}`
      );
    }
    return Result.ok(new Money(this._dinero.subtract(other._dinero)));
  }

  /**
   * Formats the money using the default locale (en-US style usually)
   * Note: Since we store integers, this is exact representation.
   */
  public toString(): string {
    return this._dinero.toFormat('$0,0.00');
  }

  /**
   * Implements strict equality check
   */
  public equals(other: Money): boolean {
    return this._dinero.equalsTo(other._dinero);
  }

  /**
   * Allocates the money into parts (e.g., 50/50 split).
   * Uses Largest Remainder Method (Dinero default) to ensure sum(parts) == total.
   */
  public allocate(ratios: number[]): Result<Money[]> {
    if (ratios.some((r) => r < 0)) {
      return Result.fail('Allocation ratios cannot be negative.');
    }
    
    // Dinero.allocate takes an array of ratios
    const shares = this._dinero.allocate(ratios);
    return Result.ok(shares.map((share) => new Money(share)));
  }
  
  /**
   * Helper for tests
   */
  public static zero(currency: string = 'USD'): Money {
    return new Money(Dinero({ amount: 0, currency: currency as Dinero.Currency }));
  }
}
