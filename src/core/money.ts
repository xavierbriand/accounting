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
