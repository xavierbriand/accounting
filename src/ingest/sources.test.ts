import { describe, expect, it } from 'vitest';
import { csvNameFor, SourceNameError, sourceOf } from './sources.ts';

describe('sourceOf', () => {
  it('reads a current account export', () => {
    const s = sourceOf('00000000001_01012024_31122024.ofx');
    expect(s.kind).toBe('account');
    expect(s.id).toBe('00000000001');
    // The union gives an account no card number at all, rather than an optional
    // one that every consumer has to defend against.
    expect(s).not.toHaveProperty('cardNumber');
  });

  it('reads a card export and keeps the four digits the settlement row cites', () => {
    const s = sourceOf('carte_1111_01012024_31122024.ofx');
    expect(s.kind).toBe('card');
    if (s.kind !== 'card') throw new Error('unreachable');
    expect(s.cardNumber).toBe('1111');
  });

  it('gives the same id whatever date range was exported', () => {
    // Otherwise a re-export over a wider window mints a new source and every
    // transaction is counted twice.
    expect(sourceOf('carte_1111_01012024_31032024.ofx').id).toBe(
      sourceOf('carte_1111_01062024_31122024.ofx').id,
    );
  });

  it('gives different ids to different cards', () => {
    expect(sourceOf('carte_1111_01012024_31122024.ofx').id).not.toBe(
      sourceOf('carte_2222_01012024_31122024.ofx').id,
    );
  });

  it('ignores the directory it was found in', () => {
    expect(sourceOf('/somewhere/else/carte_1111_01012024_31122024.ofx').id).toBe('carte_1111');
  });

  it('reads the csv the same way as the ofx', () => {
    expect(sourceOf('carte_1111_01012024_31122024.csv').id).toBe('carte_1111');
  });

  it('refuses a name it cannot attribute to an account', () => {
    expect(() => sourceOf('statement.ofx')).toThrow(SourceNameError);
    expect(() => sourceOf('export-2026.ofx')).toThrow(/expects the bank's own export naming/);
  });

  it('refuses a name it cannot classify, rather than assuming it is cash', () => {
    // Guessing "account" is expensive in both directions: a savings export gets
    // added to spendable cash, and a card whose name is slightly off has its
    // negative unsettled balance subtracted from cash while dropping out of the
    // settlement check entirely.
    expect(() => sourceOf('livret_a_01012025_31122025.ofx')).toThrow(SourceNameError);
    expect(() => sourceOf('joint_savings_01012025_31122025.ofx')).toThrow(/refused rather than guessed/);
  });

  it('refuses a card whose digits are not four, instead of near-matching it', () => {
    expect(() => sourceOf('carte_111_01012025_31122025.ofx')).toThrow(SourceNameError);
    expect(() => sourceOf('carte_11111_01012025_31122025.ofx')).toThrow(SourceNameError);
    expect(() => sourceOf('cb_1111_01012025_31122025.ofx')).toThrow(SourceNameError);
  });

  it('refuses trailing characters after the extension, rather than ignoring them', () => {
    // EXPORT_NAME is anchored at both ends. Unanchored at the tail, a renamed
    // or backed-up file — "….ofxBACKUP" — would still match on its real
    // extension and be silently accepted as the genuine export.
    expect(() => sourceOf('00000000001_01012025_31122025.ofxBACKUP')).toThrow(SourceNameError);
  });

  it('refuses leading characters before the stem, rather than skipping past them', () => {
    // Unanchored at the head, "(.+?)" would happily start matching partway
    // through the filename — accepting "xcarte_1111_…" as card "carte_1111"
    // and silently dropping the "x" that made the name unrecognisable.
    expect(() => sourceOf('xcarte_1111_01012025_31122025.ofx')).toThrow(SourceNameError);
  });

  it('refuses a name with an embedded newline before an otherwise-valid stem', () => {
    // "(.+?)" cannot cross a newline without the anchor forcing the match to
    // start at position 0 — without "^", exec() is free to start the match
    // just past the newline instead of refusing the whole name. The one
    // input shape where the anchor above is not equivalent to leaving it out.
    expect(() => sourceOf('junk\ncarte_1111_01012025_31122025.ofx')).toThrow(SourceNameError);
  });

  it('refuses a stem with a card-shaped tail but junk before it', () => {
    // CARD_STEM is anchored at both ends too. Unanchored at the head it would
    // accept "xcarte_1111" as card "1111", the same failure as above but one
    // level deeper — inside the already-extracted stem rather than the whole
    // filename.
    expect(() => sourceOf('xcarte_1111_01012025_31122025.ofx')).toThrow(/is not a name sluice recognises/);
  });

  it('refuses an account stem with non-digit characters at either end', () => {
    // ACCOUNT_STEM is anchored at both ends. Unanchored at the head or tail,
    // a stem with leading or trailing junk around a run of digits — a typo,
    // a copy-paste artifact — would be misread as a bare account number.
    expect(() => sourceOf('x00000000001_01012025_31122025.ofx')).toThrow(/is not a name sluice recognises/);
    expect(() => sourceOf('00000000001x_01012025_31122025.ofx')).toThrow(/is not a name sluice recognises/);
  });
});

describe('csvNameFor', () => {
  it('finds the csv beside the ofx', () => {
    expect(csvNameFor('carte_1111_01012024_31122024.ofx')).toBe('carte_1111_01012024_31122024.csv');
  });

  it('keeps the extension in the case it found it', () => {
    // The .ofx scan accepts any case and the lookup that follows is an exact
    // filename match, so lowercasing here rejected a correctly-named uppercase
    // pair that was sitting in the folder.
    expect(csvNameFor('CARTE_1111_01012024_31122024.OFX')).toBe('CARTE_1111_01012024_31122024.CSV');
  });

  it('replaces the trailing extension, not the first occurrence of ".ofx"', () => {
    // Anchored at the end on purpose: a filename that happens to contain
    // ".ofx" earlier than its real, trailing extension must still be
    // rewritten at the extension, not at the first match.
    expect(csvNameFor('export.ofx.backup.ofx')).toBe('export.ofx.backup.csv');
  });
});
