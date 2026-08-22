// Prose error messages, excluded for the reason given at the top of schema.ts:
// mutating them tests whether a regex matches a sentence, not whether the
// reader is correct. Scoped per-file so the ingest's format strings stay
// measured.
// Stryker disable StringLiteral: the strings below are prose, not contract — see the note above
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

/**
 * Every message locates itself — each one names the dotted path, the envelope or
 * the person it is about. A separate location field was carried alongside for a
 * while and rendered nowhere, which is how it was found: structure nothing reads
 * is structure that will drift away from the thing it claims to describe.
 */
/**
 * Six places in schema.ts read `if (X === null || problems.count !== before)
 * return null;`, right after each's first required field, across five reader
 * functions — readSeasonal has two, one per branch of its months/weights
 * choice. It looks like the two halves are redundant with each other: every
 * accessor that returns null has already called `add()` (directly, via
 * `fail()`, or via `take()`'s date-refusal branch) within that same call, so
 * `X === null` implies `problems.count !== before` in every case — proven by
 * reading every accessor in this file, not assumed.
 *
 * It is NOT redundant to keep, for two separate reasons:
 *
 * 1. **Type narrowing.** Every one of the six reads more of the table after
 *    this line and uses the first field as non-null (`months.length`,
 *    `category` embedded in a returned object, ...). Dropping the `X ===
 *    null` half compiles to a runtime-correct but type-UNSAFE function:
 *    TypeScript cannot see that `problems.count !== before` implies `X` is
 *    non-null, and refuses to narrow it. Verified directly — removing it
 *    produces `'X' is possibly 'null'` at every later use.
 * 2. **The right half is not redundant with the left, in principle.** Every one
 *    of the six reads more fields, or calls `done()`, or calls a nested
 *    reader, between capturing `before` and this check — and any of those
 *    can add a problem while the FIRST field parsed fine. `X === null`
 *    alone would miss that case entirely.
 *
 * In practice, verified by mutating every half of all six checks and running
 * the suite: only two of the resulting 24 mutants are killed today (both on
 * `readSeasonal`, both because bypassing them lets `null` reach a `.length`
 * read one line later and crash). The other 22 are not observable through
 * `parseConfig`'s public surface as it stands — every one of the six reader
 * functions is either itself called from within another reader's own
 * before/after window (so the outer guard re-catches whatever the inner one
 * would have), or its return value only ever reaches a check
 * (`checkEnvelopesDoNotOverlap`, `checkLabelsDoNotCollide`) that inspects a
 * field the corruption does not touch, before the same top-level
 * `problems.count > 0` throw fires regardless. That is a fact about today's
 * call graph, not a proof the right half is pointless: it is what keeps a
 * later refactor — flattening the nesting, or adding a check that inspects
 * the corrupted field — from silently reopening a hole. Kept for that
 * reason, not chased with more fixtures to force the remaining 22 mutants to
 * die.
 */
export class Problems {
  private readonly items: string[] = [];

  add(message: string): void {
    this.items.push(message);
  }

  get count(): number {
    return this.items.length;
  }

  get list(): readonly string[] {
    return this.items;
  }
}

/**
 * Stands for a value the reader has already refused.
 *
 * Without it, refusing a value once and returning `null` let the next check
 * treat the `null` as a *second* fault and record a second, misleading message —
 * one mistake in the file, two complaints in the report, the later one naming
 * the wrong problem. That is the cascade this module is built to prevent, so it
 * has to be prevented here first.
 */
const REFUSED = Symbol('refused');

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
    this.problems.add(message);
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
      this.problems.add(
        `"${this.path(key)}" is a date. Nothing in sluice.toml is a date, and an ` +
          `unquoted one becomes a moment in time rather than text. Put quotes around it.`,
      );
      return REFUSED;
    }
    return value;
  }

  has(key: string): boolean {
    return this.raw[key] !== undefined;
  }

  /**
   * Mark a key handled without reading it, so `done()` does not call it unknown.
   *
   * For the branches that reject a *combination* of keys — giving two forms of
   * the same thing, or neither — where the keys themselves need no validation but
   * still have to be accounted for before unknown keys can be reported.
   */
  skip(key: string): void {
    this.read.add(key);
  }

  string(key: string): string | null {
    const value = this.take(key);
    if (value === REFUSED) return null;
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
    if (value === REFUSED) return null;
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
    if (value === REFUSED) return null;
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
    if (value.trim() === '') {
      // `parseAmount` reads an empty string as zero, which is right for the bank's
      // CSV — debit and credit share a row and the unused one is blank. It is
      // wrong for a file someone edits by hand: a half-finished edit would become
      // a confident zero. A blank income gives that person a zero share of the
      // split and asks everyone else to fund the whole household.
      return this.fail(
        key,
        `"${this.path(key)}" is empty. Give the amount, or remove the line — an ` +
          `empty amount would be read as zero euros and quietly change the figures ` +
          `that come out.`,
      );
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
    if (value === REFUSED) return null;
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
    if (value === REFUSED) return null;
    if (value === undefined) return this.fail(key, `"${this.path(key)}" is missing.`);
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'number' || !Number.isInteger(v))) {
      return this.fail(key, `"${this.path(key)}" must be a list of whole numbers.`);
    }
    return value as number[];
  }

  table(key: string): Reader | null {
    const value = this.take(key);
    if (value === REFUSED) return null;
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
      // Already refused and reported — saying anything more about it would be a
      // second complaint about one fault, which is the cascade this reader exists
      // to prevent. Every other accessor guards this; this one did not.
      if (child === REFUSED) continue;
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
    if (value === REFUSED) return null;
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
        `"${this.path(key)}" is not a key sluice knows${known === '' ? '' : `. The keys here are: ${known}`}. ` +
          `It is refused rather than ignored, because a misspelt key leaves the one ` +
          `it was meant to set at its default and the figure that comes out is wrong ` +
          `rather than missing.`,
      );
    }
  }
}
