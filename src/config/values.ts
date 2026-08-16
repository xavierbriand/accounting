import { parseAmount, AmountParseError, type Cents } from '../core/money.ts';

/**
 * Typed reading of a parsed TOML document, accumulating problems instead of
 * throwing on the first one.
 *
 * `sluice.toml` is hand-edited about once a year, and this product exists
 * because that yearly rebuild was expensive enough to skip. Reporting one typo
 * per run works directly against that, so every accessor here records what is
 * wrong and returns `null`, and the caller collects a whole file's worth of
 * problems before giving up.
 *
 * The rule that keeps that honest: **a record with any missing part is not
 * built.** Returning `null` never means "carry on with a default" — it means
 * the caller skips constructing the thing, so a shape problem can never cascade
 * into a misleading complaint about the meaning of a value that was never read.
 */

export interface Problem {
  /** Dotted path into the file, e.g. `envelopes.groceries.estimate`. */
  readonly where: string;
  readonly message: string;
}

export class Problems {
  private readonly items: Problem[] = [];

  add(where: string, message: string): void {
    this.items.push({ where, message });
  }

  get count(): number {
    return this.items.length;
  }

  get list(): readonly Problem[] {
    return this.items;
  }
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * A view over one TOML table.
 *
 * Tracks which keys have been asked for so `done()` can refuse the ones nobody
 * wanted — the single highest-value check in the file. An unrecognised key is
 * almost always a misspelling, and a misspelling leaves the key it was meant to
 * set at its default: the figure that comes out is wrong rather than missing.
 */
export class Reader {
  private readonly raw: Record<string, unknown>;
  private readonly read = new Set<string>();
  private readonly problems: Problems;
  readonly where: string;

  // Plain fields rather than constructor parameter properties: node executes
  // this file's TypeScript directly, in strip-only mode, which does not support
  // them. The test runner transforms instead of stripping and would accept them,
  // which is how one got in here unnoticed — see src/runnable.test.ts.
  constructor(table: Record<string, unknown>, where: string, problems: Problems) {
    this.raw = table;
    this.where = where;
    this.problems = problems;
  }

  private path(key: string): string {
    return this.where === '' ? key : `${this.where}.${key}`;
  }

  private fail(key: string, message: string): null {
    this.problems.add(this.path(key), message);
    return null;
  }

  /** Present, not a TOML date, and marked as read. `undefined` if absent. */
  private take(key: string): unknown {
    this.read.add(key);
    const value = this.raw[key];
    if (value instanceof Date) {
      // Nothing in sluice.toml is a date. An unquoted TOML date becomes a
      // timezone-bearing instant, which reads back a day earlier west of UTC —
      // the exact hazard the rest of the codebase avoids by never using Date.
      return this.fail(
        key,
        `"${this.path(key)}" is a date. Nothing in sluice.toml is a date, and an ` +
          `unquoted one becomes a moment in time rather than text. Put quotes around it.`,
      );
    }
    return value;
  }

  has(key: string): boolean {
    return this.raw[key] !== undefined;
  }

  string(key: string): string | null {
    const value = this.take(key);
    if (value === undefined) {
      return this.fail(key, `"${this.path(key)}" is missing.`);
    }
    if (typeof value !== 'string') {
      return this.fail(key, `"${this.path(key)}" must be text, in quotes.`);
    }
    return value;
  }

  optionalString(key: string): string | null {
    if (!this.has(key)) {
      this.read.add(key);
      return null;
    }
    return this.string(key);
  }

  stringArray(key: string): string[] | null {
    const value = this.take(key);
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      return this.fail(key, `"${this.path(key)}" must be a list of quoted strings.`);
    }
    return value as string[];
  }

  optionalStringArray(key: string): string[] | null {
    if (!this.has(key)) {
      this.read.add(key);
      return null;
    }
    return this.stringArray(key);
  }

  /**
   * An amount, written as a quoted string.
   *
   * A bare TOML number is an IEEE double, and money here is integer cents so the
   * card settlement check can be exact to the cent. The refusal is explicit
   * rather than a silent conversion because the difference only shows up as a
   * rounding error in a total nobody is checking by hand.
   */
  money(key: string): Cents | null {
    const value = this.take(key);
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (typeof value === 'number' || typeof value === 'bigint') {
      return this.fail(
        key,
        `"${this.path(key)}" is the number ${String(value)}. Amounts are quoted — ` +
          `${key} = "${String(value)}.00" — because a bare number here is a binary ` +
          `float, and sluice holds money as whole cents so the card settlement ` +
          `check can be exact.`,
      );
    }
    if (typeof value !== 'string') {
      return this.fail(key, `"${this.path(key)}" must be an amount in quotes, like "1200.00".`);
    }
    try {
      return parseAmount(value, this.path(key));
    } catch (cause) {
      if (cause instanceof AmountParseError) {
        return this.fail(key, `"${this.path(key)}" is "${value}", which is not an amount.`);
      }
      throw cause;
    }
  }

  optionalMoney(key: string): Cents | null {
    if (!this.has(key)) {
      this.read.add(key);
      return null;
    }
    return this.money(key);
  }

  integer(key: string, min: number, max: number): number | null {
    const value = this.take(key);
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return this.fail(key, `"${this.path(key)}" must be a whole number.`);
    }
    if (value < min || value > max) {
      return this.fail(key, `"${this.path(key)}" is ${value}. It must be between ${min} and ${max}.`);
    }
    return value;
  }

  integerArray(key: string): number[] | null {
    const value = this.take(key);
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'number' || !Number.isInteger(v))) {
      return this.fail(key, `"${this.path(key)}" must be a list of whole numbers.`);
    }
    return value as number[];
  }

  table(key: string): Reader | null {
    const value = this.take(key);
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (!isTable(value)) return this.fail(key, `"${this.path(key)}" must be a section.`);
    return new Reader(value, this.path(key), this.problems);
  }

  optionalTable(key: string): Reader | null {
    if (!this.has(key)) {
      this.read.add(key);
      return null;
    }
    return this.table(key);
  }

  /** `[people.alice]`, `[people.bruno]` — a table whose keys are ids. */
  namedTables(key: string): Map<string, Reader> | null {
    const parent = this.table(key);
    if (parent === null) return null;
    const out = new Map<string, Reader>();
    for (const id of Object.keys(parent.raw)) {
      const child = parent.take(id);
      if (!isTable(child)) {
        parent.fail(id, `"${parent.path(id)}" must be a section.`);
        continue;
      }
      out.set(id, new Reader(child, parent.path(id), this.problems));
    }
    return out;
  }

  /** `[[people.alice.income]]` — an array of tables. */
  tableArray(key: string): Reader[] | null {
    const value = this.take(key);
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (!Array.isArray(value) || !value.every(isTable)) {
      return this.fail(key, `"${this.path(key)}" must be a list of sections.`);
    }
    return value.map((entry, i) => new Reader(entry, `${this.path(key)}[${i}]`, this.problems));
  }

  /**
   * Refuse every key nobody asked for.
   *
   * Deliberately not a warning. A key sluice does not recognise is nearly always
   * a misspelling of one it does, and the misspelt key leaves the real one
   * unset — so the run produces a confident wrong number rather than an obvious
   * absence. That is the failure this whole module exists to prevent.
   */
  done(): void {
    for (const key of Object.keys(this.raw)) {
      if (this.read.has(key)) continue;
      const known = [...this.read].sort().join(', ');
      this.problems.add(
        this.path(key),
        `"${this.path(key)}" is not a key sluice knows${known === '' ? '' : `. The keys here are: ${known}`}. ` +
          `It is refused rather than ignored, because a misspelt key leaves the one ` +
          `it was meant to set at its default and the figure that comes out is wrong ` +
          `rather than missing.`,
      );
    }
  }
}
