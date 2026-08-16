/**
 * Money is integer cents. Never a float.
 *
 * This is not fastidiousness: the ingest asserts that a card's purchases sum
 * *exactly* to the settlement the account was charged, and that assertion is the
 * main protection against double-counting. In binary floating point a sum of a
 * few hundred amounts drifts by fractions of a cent, so an exact test would fail
 * on correct data — and the usual repair is an epsilon, which quietly hides the
 * real mismatch it exists to catch.
 */

/** A signed amount in cents. Negative is money leaving the account. */
export type Cents = number;

const AMOUNT = /^[+-]?\d+(?:[.,]\d{1,2})?$/;

export class AmountParseError extends Error {
  readonly raw: string;
  readonly where: string;

  constructor(raw: string, where: string) {
    super(`Cannot read "${raw}" as an amount (${where})`);
    this.name = 'AmountParseError';
    this.raw = raw;
    this.where = where;
  }
}

/**
 * Parse a French-formatted decimal ("-1 234,56", "+4500,00") into cents.
 * Also accepts the dot-decimal form the OFX files use.
 *
 * Empty string is 0 — the CSV keeps debit and credit in separate columns and
 * leaves the unused one blank.
 */
export function parseAmount(raw: string, where = 'amount'): Cents {
  // Ordinary spaces, non-breaking spaces and narrow no-break spaces are all used
  // as thousands separators depending on who wrote the file.
  const cleaned = raw.replace(/[\s  ]/g, '');
  if (cleaned === '') return 0;
  if (!AMOUNT.test(cleaned)) throw new AmountParseError(raw, where);

  const negative = cleaned.startsWith('-');
  const digits = cleaned.replace(/^[+-]/, '');
  const [whole = '0', frac = ''] = digits.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Sum without leaving the integer domain. */
export function sum(amounts: readonly Cents[]): Cents {
  let total = 0;
  for (const a of amounts) total += a;
  return total;
}

/**
 * Split `total` across `weights`, proportionally, landing on a sum that is
 * exactly `total` — never a cent short or over from independent roundings.
 *
 * Largest-remainder apportionment: each weight gets `floor(total * w / Σw)`,
 * then the few cents still unassigned go one each to the weights with the
 * largest fractional remainder, ties broken by index for a deterministic
 * result. Twelve seasonal weights that must sum to exactly an annual
 * estimate, or a household's incomes that must sum to exactly a monthly
 * requirement, are why this exists: naive independent rounding of twelve or
 * more shares does not sum back to the total it was split from.
 *
 * The remainder step needs a fraction, but computed as an IEEE-754 double
 * (`(total * w) / weightTotal`) that fraction is exactly the kind of value
 * this module's own "integer cents, never a float" rule exists to rule
 * out — a near-tie between two weights could in principle round differently
 * than exact arithmetic would. So the whole computation runs in `BigInt`
 * instead: `total * w` divided by `weightTotal` is `bigint` truncating
 * division, exact for any input, and the remainder used to break ties is the
 * exact `bigint` remainder of that division, not a subtraction of floats.
 * `weights` must therefore be whole numbers — true of every caller today,
 * relative seasonal weights and `Cents` incomes alike.
 *
 * `total` must be non-negative — refuses otherwise. Nothing in this codebase
 * ever allocates a negative pot, and this division is not validated for one,
 * so the contract stays honest rather than half-supporting a case nothing
 * exercises. `weights` must be non-negative and sum to more than zero: an
 * internal invariant, not user input — config already refuses all-zero or
 * negative seasonal weights and negative income at the parse stage, so
 * nothing should ever call this with a broken weight set.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  if (total < 0) {
    throw new Error(`allocate: total must be non-negative, got ${total}`);
  }
  if (weights.some((w) => w < 0) || sum(weights) <= 0) {
    throw new Error('allocate: weights must be non-negative and sum to more than zero');
  }

  const totalBig = BigInt(total);
  const weightTotalBig = weights.reduce((acc, w) => acc + BigInt(w), 0n);

  const bases: bigint[] = [];
  const remainders: bigint[] = [];
  for (const w of weights) {
    const product = totalBig * BigInt(w);
    bases.push(product / weightTotalBig);
    remainders.push(product % weightTotalBig);
  }

  // How many cents are still unassigned once every weight has its exact
  // floor — always a small non-negative integer, at most one per weight,
  // so converting it back to a plain number is safe.
  const remainder = Number(totalBig - bases.reduce((a, b) => a + b, 0n));

  const byRemainder = remainders
    .map((r, i) => ({ i, remainder: r }))
    .sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : 0) || a.i - b.i);

  const out = bases.map(Number);
  for (let k = 0; k < remainder; k++) {
    const i = byRemainder[k]!.i;
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Accounting notation: negatives in parentheses, never a minus sign.
 * `formatEur(-802500)` → `(8 025,00 €)`
 */
export function formatEur(cents: Cents): string {
  const text = EUR.format(Math.abs(cents) / 100);
  return cents < 0 ? `(${text})` : text;
}

/** Plain signed notation, for axes and tooltips where parentheses read as noise. */
export function formatEurSigned(cents: Cents): string {
  return EUR.format(cents / 100);
}

/**
 * Whole euros, for chart axes where the cents are visual clutter.
 *
 * Rounded on the magnitude and the sign reapplied, rather than on the signed
 * value. `Math.round` breaks ties toward +∞, which is asymmetric across zero:
 * it turns -150 into -1 while +150 becomes 2, and it yields negative zero for
 * anything under half a euro — which `Intl` renders, unhelpfully, as "-0 €".
 */
export function formatEurCompact(cents: Cents): string {
  const euros = Math.round(Math.abs(cents) / 100);
  // Negating zero produces -0, which is exactly the value being avoided.
  const signed = cents < 0 && euros !== 0 ? -euros : euros;
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(signed) + ' €';
}
