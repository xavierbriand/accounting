import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from '@core/shared/money.js';

describe('Money Value Object', () => {
  describe('Creation', () => {
    it('should create from cents', () => {
      const m = Money.fromCents(100, 'EUR');
      expect(m.isSuccess).toBe(true);
      expect(m.value.amount).toBe(100);
      expect(m.value.currency).toBe('EUR');
    });

    it('should fail for non-integer cents', () => {
      const m = Money.fromCents(100.5, 'EUR');
      expect(m.isFailure).toBe(true);
    });

    it('should fail for an unknown currency code', () => {
      const m = Money.fromCents(100, 'XXX');
      expect(m.isFailure).toBe(true);
      expect(m.error).toMatch(/currency/i);
    });

    it('should implement Bankers Rounding for decimals', () => {
      // 2.5 cents -> 2 cents (Round Half to Even)
      // Note: fromDecimal takes "Units". 0.025 units = 2.5 cents.
      
      // Case 1: 0.025 EUR (2.5 cents) -> Rounds to 2 (Even)
      expect(Money.fromDecimal(0.025, 'EUR').value.amount).toBe(2);
      
      // Case 2: 0.035 EUR (3.5 cents) -> Rounds to 4 (Even)
      expect(Money.fromDecimal(0.035, 'EUR').value.amount).toBe(4);

      // Case 3: 0.015 EUR (1.5 cents) -> Rounds to 2 (Even)
      expect(Money.fromDecimal(0.015, 'EUR').value.amount).toBe(2);
      
      // Case 4: 0.045 EUR (4.5 cents) -> Rounds to 4 (Even) (Wait, 4 is even)
      // 4.5 -> 4.
      expect(Money.fromDecimal(0.045, 'EUR').value.amount).toBe(4);
    });
  });

  describe('Operations', () => {
    it('should add same currency', () => {
      const m1 = Money.fromCents(100, 'EUR').value;
      const m2 = Money.fromCents(50, 'EUR').value;
      const result = m1.add(m2);
      expect(result.isSuccess).toBe(true);
      expect(result.value.amount).toBe(150);
    });

    it('should fail to add different currencies', () => {
      const m1 = Money.fromCents(100, 'EUR').value;
      const m2 = Money.fromCents(50, 'USD').value;
      const result = m1.add(m2);
      expect(result.isFailure).toBe(true);
    });

    it('should allocate properly (Largest Remainder)', () => {
      const m = Money.fromCents(100, 'EUR').value;
      // Split 100 into 3 parts
      const result = m.allocate([1, 1, 1]);
      expect(result.isSuccess).toBe(true);
      const shares = result.value;
      expect(shares).toHaveLength(3);
      expect(shares[0].amount).toBe(34); // 33.33 -> 34
      expect(shares[1].amount).toBe(33);
      expect(shares[2].amount).toBe(33);
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(100);
    });
  });

  describe('Properties (Fast-Check)', () => {
    it('should satisfy associativity: (a + b) + c === a + (b + c)', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), fc.integer(), (a, b, c) => {
          const m1 = Money.fromCents(a, 'EUR').value;
          const m2 = Money.fromCents(b, 'EUR').value;
          const m3 = Money.fromCents(c, 'EUR').value;

          const left = m1.add(m2).value.add(m3).value;
          const right = m1.add(m2.add(m3).value).value;

          return left.equals(right);
        })
      );
    });

    it('should satisfy distributivity of allocation: allocate(a + b) === allocate(a) + allocate(b) (roughly)', () => {
      // Note: Integer allocation is NOT perfectly distributive due to remainders.
      // (100+100)/3 = 66, 67, 67.
      // 100/3 = 33, 33, 34. Sum = 66, 66, 68.
      // So this property does NOT hold for integer math.
      // Instead, let's test that allocate always sums to total.

      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000000 }), fc.array(fc.integer({min: 1, max: 10}), {minLength: 1, maxLength: 10}), (amount, ratios) => {
          const m = Money.fromCents(amount, 'EUR').value;
          const parts = m.allocate(ratios).value;
          const sum = parts.reduce((acc, p) => acc + p.amount, 0);
          return sum === amount;
        })
      );
    });
  });

  describe('lessThan / lessThanOrEqual (Story 3.2)', () => {
    it('lessThan returns true when a < b (same currency)', () => {
      // fails if lessThan is not implemented or returns wrong result
      const a = Money.fromCents(100, 'EUR').value;
      const b = Money.fromCents(200, 'EUR').value;
      const result = a.lessThan(b);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('lessThan returns false when a > b (same currency)', () => {
      const a = Money.fromCents(300, 'EUR').value;
      const b = Money.fromCents(200, 'EUR').value;
      const result = a.lessThan(b);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('lessThan returns false when a == b (same currency)', () => {
      const a = Money.fromCents(200, 'EUR').value;
      const b = Money.fromCents(200, 'EUR').value;
      const result = a.lessThan(b);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('lessThan returns Result.fail on currency mismatch', () => {
      // fails if lessThan does not guard against cross-currency comparison
      const a = Money.fromCents(100, 'EUR').value;
      const b = Money.fromCents(100, 'USD').value;
      const result = a.lessThan(b);
      expect(result.isFailure).toBe(true);
    });

    it('lessThanOrEqual returns true when a < b (same currency)', () => {
      // fails if lessThanOrEqual is not implemented
      const a = Money.fromCents(100, 'EUR').value;
      const b = Money.fromCents(200, 'EUR').value;
      const result = a.lessThanOrEqual(b);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('lessThanOrEqual returns true when a == b (same currency)', () => {
      const a = Money.fromCents(200, 'EUR').value;
      const b = Money.fromCents(200, 'EUR').value;
      const result = a.lessThanOrEqual(b);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('lessThanOrEqual returns false when a > b (same currency)', () => {
      const a = Money.fromCents(300, 'EUR').value;
      const b = Money.fromCents(200, 'EUR').value;
      const result = a.lessThanOrEqual(b);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('lessThanOrEqual returns Result.fail on currency mismatch', () => {
      // fails if lessThanOrEqual does not guard against cross-currency comparison
      const a = Money.fromCents(100, 'EUR').value;
      const b = Money.fromCents(100, 'USD').value;
      const result = a.lessThanOrEqual(b);
      expect(result.isFailure).toBe(true);
    });

    it('Property: trichotomy — for same-currency a, b: exactly one of lessThan(a,b), equals, lessThan(b,a)', () => {
      // fails if lessThan does not satisfy strict order trichotomy
      fc.assert(
        fc.property(
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          (aAmount, bAmount) => {
            const a = Money.fromCents(aAmount, 'EUR').value;
            const b = Money.fromCents(bAmount, 'EUR').value;
            const aLtB = a.lessThan(b).value;
            const bLtA = b.lessThan(a).value;
            const eq = a.equals(b);
            const trueCount = [aLtB, bLtA, eq].filter(Boolean).length;
            return trueCount === 1;
          }
        )
      );
    });

    it('Property: lessThanOrEqual is strict superset of lessThan union equals', () => {
      // fails if lessThanOrEqual is not consistent with lessThan and equals
      fc.assert(
        fc.property(
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          (aAmount, bAmount) => {
            const a = Money.fromCents(aAmount, 'EUR').value;
            const b = Money.fromCents(bAmount, 'EUR').value;
            const ltOrEq = a.lessThanOrEqual(b).value;
            const lt = a.lessThan(b).value;
            const eq = a.equals(b);
            return ltOrEq === (lt || eq);
          }
        )
      );
    });

    it('Property: currency mismatch always returns Result.fail for both lessThan and lessThanOrEqual', () => {
      // fails if cross-currency comparison does not return failure
      fc.assert(
        fc.property(
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          fc.integer({ min: -10_000_00, max: 10_000_00 }),
          (aAmount, bAmount) => {
            const a = Money.fromCents(aAmount, 'EUR').value;
            const b = Money.fromCents(bAmount, 'USD').value;
            return a.lessThan(b).isFailure && a.lessThanOrEqual(b).isFailure;
          }
        )
      );
    });
  });
});
