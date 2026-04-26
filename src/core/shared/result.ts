
export class Result<T, E = string> {
  public isSuccess: boolean;
  public isFailure: boolean;
  private _error?: E;
  private _value?: T;

  private constructor(isSuccess: boolean, error?: E, value?: T) {
    if (isSuccess && error) {
      throw new Error("InvalidOperation: A result cannot be successful and contain an error");
    }
    if (!isSuccess && !error) {
      throw new Error("InvalidOperation: A failing result needs to contain an error message");
    }

    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._error = error;
    this._value = value;
  }

  public get value(): T {
    if (!this.isSuccess) {
      throw new Error(`Can't get the value of an error result. Use 'errorValue' instead.`);
    }
    return this._value as T;
  }

  public get error(): E {
    if (this.isSuccess) {
      throw new Error(`Can't get the error of a success result. Use 'value' instead.`);
    }
    return this._error as E;
  }

  public map<U>(fn: (t: T) => U): Result<U, E> {
    if (this.isFailure) return Result.fail(this._error as E);
    return Result.ok(fn(this._value as T));
  }

  public flatMap<U, F = E>(fn: (t: T) => Result<U, F>): Result<U, E | F> {
    if (this.isFailure) return Result.fail(this._error as E | F);
    return fn(this._value as T) as Result<U, E | F>;
  }

  public getOrElse<U>(fallback: U): T | U {
    return this.isSuccess ? (this._value as T) : fallback;
  }

  public static ok<U>(value?: U): Result<U, never> {
    return new Result<U, never>(true, undefined, value);
  }

  public static fail<U, E = string>(error: E): Result<U, E> {
    return new Result<U, E>(false, error);
  }

  public static all<U, E = string>(results: readonly Result<U, E>[]): Result<readonly U[], E> {
    const values: U[] = [];
    for (const r of results) {
      if (r.isFailure) return Result.fail(r.error);
      values.push(r.value);
    }
    return Result.ok(values);
  }

  /** @deprecated Use Result.all(...).map(() => undefined) for the discard case. */
  public static combine(results: Result<unknown>[]): Result<unknown> {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}
