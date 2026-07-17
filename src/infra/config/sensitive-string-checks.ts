const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const CARD_SHAPE = /^\d{13,19}$/;

// ISO 13616 mod-97 check digit: move the 4 leading characters to the end, replace each
// letter with its two-digit code (A=10..Z=35), then verify the resulting number mod 97
// equals 1. Processed in 7-digit chunks appended to the running remainder — the
// standard technique for mod-97 over an arbitrarily long digit string without
// overflowing a JS number.
function ibanMod97Valid(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

export function looksLikeIban(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return IBAN_SHAPE.test(compact) && ibanMod97Valid(compact);
}

// Luhn checksum: from the rightmost digit, double every second digit, subtracting 9
// when the double exceeds 9; the total must be a multiple of 10.
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export function looksLikeCardNumber(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '');
  return CARD_SHAPE.test(compact) && luhnValid(compact);
}
