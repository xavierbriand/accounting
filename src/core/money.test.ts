import { describe, expect, it } from 'vitest';
import { AmountParseError, formatEur, formatEurCompact, parseAmount, sum } from './money.ts';

/**
 * French grouping uses a narrow no-break space (U+202F), and which space ICU
 * picks is a detail of the platform's locale data, not of this code. Normalise
 * it so the tests assert the formatting decisions sluice actually makes.
 */
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('parseAmount', () => {
  it('reads the bank’s comma decimals as cents', () => {
    expect(parseAmount('-21,51')).toBe(-2151);
    expect(parseAmount('+4500,00')).toBe(450000);
    expect(parseAmount('8,90')).toBe(890);
  });

  it('reads the dot decimals the OFX uses', () => {
    expect(parseAmount('-1621.51')).toBe(-162151);
    expect(parseAmount('+264.21')).toBe(26421);
  });

  it('ignores thousands separators, including the non-breaking kinds', () => {
    expect(parseAmount('1 234,56')).toBe(123456);
    expect(parseAmount('1 234,56')).toBe(123456);
    expect(parseAmount('1 234,56')).toBe(123456);
  });

  it('treats an empty cell as zero, because debit and credit share a row', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('   ')).toBe(0);
  });

  it('pads a single decimal place rather than dropping it', () => {
    expect(parseAmount('3,5')).toBe(350);
  });

  it('refuses anything it cannot read exactly', () => {
    expect(() => parseAmount('12,345')).toThrow(AmountParseError);
    expect(() => parseAmount('n/a')).toThrow(AmountParseError);
    expect(() => parseAmount('1.234,56')).toThrow(AmountParseError);
  });

  it('names where the bad value came from', () => {
    expect(() => parseAmount('oops', 'export.csv:42 Debit')).toThrow(/export\.csv:42 Debit/);
  });
});

describe('sum', () => {
  it('stays exact over many rows, which float arithmetic would not', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; in cents it is just 10+20.
    const cents = [10, 20, 30];
    expect(sum(cents)).toBe(60);

    const many = Array.from({ length: 1000 }, () => 1049);
    expect(sum(many)).toBe(1_049_000);
  });
});

describe('formatEur', () => {
  it('puts negatives in parentheses rather than using a minus sign', () => {
    expect(formatEur(-802500)).toMatch(/^\(.*\)$/);
    expect(formatEur(-802500)).not.toContain('-');
  });

  it('leaves positives bare', () => {
    expect(formatEur(802500)).not.toContain('(');
  });

  it('always shows both cents', () => {
    expect(formatEur(26421)).toContain('264,21');
    expect(plain(formatEur(500000))).toContain('5 000,00');
  });

  it('renders zero without parentheses', () => {
    expect(formatEur(0)).not.toContain('(');
  });
});

describe('formatEurCompact', () => {
  it('drops the cents for axis labels', () => {
    expect(plain(formatEurCompact(843434))).toBe('8 434 €');
  });
});
