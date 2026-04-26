import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Result } from '@core/shared/result.js';

// Property tests for Result combinators: map, flatMap, getOrElse, Result.all
// All fail until the combinators are implemented on the Result class.

describe('Result.map', () => {
  it('map identity: r.map(x => x) === r (success)', () => {
    fc.assert(
      fc.property(fc.string(), (val) => {
        const r = Result.ok(val);
        const mapped = r.map((x) => x);
        expect(mapped.isSuccess).toBe(r.isSuccess);
        expect(mapped.value).toBe(r.value);
      }),
    );
  });

  it('map identity: r.map(x => x) === r (failure)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (err) => {
        const r = Result.fail<string>(err);
        const mapped = r.map((x) => x);
        expect(mapped.isFailure).toBe(true);
        expect(mapped.error).toBe(err);
      }),
    );
  });

  it('map composition: r.map(g(f(x))) === r.map(f).map(g)', () => {
    fc.assert(
      fc.property(fc.integer(), (val) => {
        const f = (x: number): string => String(x);
        const g = (x: string): boolean => x.length > 0;
        const r = Result.ok(val);
        const composed = r.map((x) => g(f(x)));
        const chained = r.map(f).map(g);
        expect(composed.isSuccess).toBe(chained.isSuccess);
        expect(composed.value).toBe(chained.value);
      }),
    );
  });

  it('map transforms success value', () => {
    const r = Result.ok(42);
    const mapped = r.map((x) => x * 2);
    expect(mapped.isSuccess).toBe(true);
    expect(mapped.value).toBe(84);
  });

  it('map passes through failure unchanged', () => {
    const r = Result.fail<number>('some error');
    const mapped = r.map((x) => x * 2);
    expect(mapped.isFailure).toBe(true);
    expect(mapped.error).toBe('some error');
  });
});

describe('Result.flatMap', () => {
  it('flatMap left identity: Result.ok(x).flatMap(f) === f(x)', () => {
    fc.assert(
      fc.property(fc.integer(), (val) => {
        const f = (x: number): Result<string> => Result.ok(String(x));
        const r = Result.ok(val).flatMap(f);
        const direct = f(val);
        expect(r.isSuccess).toBe(direct.isSuccess);
        expect(r.value).toBe(direct.value);
      }),
    );
  });

  it('flatMap right identity: r.flatMap(Result.ok) === r (success)', () => {
    fc.assert(
      fc.property(fc.string(), (val) => {
        const r = Result.ok(val);
        const chained = r.flatMap((x) => Result.ok(x));
        expect(chained.isSuccess).toBe(r.isSuccess);
        expect(chained.value).toBe(r.value);
      }),
    );
  });

  it('flatMap short-circuit: Result.fail(e).flatMap(f) === Result.fail(e)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (err) => {
        let callCount = 0;
        const f = (x: string): Result<string> => {
          callCount++;
          return Result.ok(x);
        };
        const r = Result.fail<string>(err);
        const chained = r.flatMap(f);
        expect(chained.isFailure).toBe(true);
        expect(chained.error).toBe(err);
        expect(callCount).toBe(0);
      }),
    );
  });

  it('flatMap chains two successful results', () => {
    const r = Result.ok(5)
      .flatMap((x) => Result.ok(x + 1))
      .flatMap((x) => Result.ok(x * 2));
    expect(r.isSuccess).toBe(true);
    expect(r.value).toBe(12);
  });

  it('flatMap short-circuits on first failure', () => {
    const r = Result.ok(5)
      .flatMap(() => Result.fail<number>('mid-chain error'))
      .flatMap((x) => Result.ok(x * 2));
    expect(r.isFailure).toBe(true);
    expect(r.error).toBe('mid-chain error');
  });
});

describe('Result.getOrElse', () => {
  it('getOrElse: Result.ok(x).getOrElse(y) === x', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (val, fallback) => {
        const r = Result.ok(val);
        expect(r.getOrElse(fallback)).toBe(val);
      }),
    );
  });

  it('getOrElse: Result.fail(e).getOrElse(y) === y', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string(), (err, fallback) => {
        const r = Result.fail<string>(err);
        expect(r.getOrElse(fallback)).toBe(fallback);
      }),
    );
  });
});

describe('Result.all', () => {
  it('Result.all([]) returns Result.ok([])', () => {
    const r = Result.all([]);
    expect(r.isSuccess).toBe(true);
    expect(r.value).toEqual([]);
  });

  it('Result.all with all successes accumulates values', () => {
    const r = Result.all([Result.ok(1), Result.ok(2), Result.ok(3)]);
    expect(r.isSuccess).toBe(true);
    expect(r.value).toEqual([1, 2, 3]);
  });

  it('Result.all short-circuits on first failure', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        fc.nat({ max: 4 }),
        (values, failIdx) => {
          const actualFailIdx = failIdx % values.length;
          const results = values.map((v, i) =>
            i === actualFailIdx ? Result.fail<string>('fail-at-' + i) : Result.ok(v),
          );
          const combined = Result.all(results);
          if (results.every((r) => r.isSuccess)) {
            expect(combined.isSuccess).toBe(true);
          } else {
            expect(combined.isFailure).toBe(true);
          }
        },
      ),
    );
  });

  it('Result.all first-failure: the error is the first failing element error', () => {
    const r = Result.all([
      Result.ok('a'),
      Result.fail<string>('first error'),
      Result.fail<string>('second error'),
    ]);
    expect(r.isFailure).toBe(true);
    expect(r.error).toBe('first error');
  });
});
