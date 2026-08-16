import { describe, expect, it } from 'vitest';
import {
  labelMatches,
  matcherMatches,
  matchersOverlap,
  normaliseLabel,
  type EnvelopeMatcher,
} from './match.ts';

const wholeCategory = (category: string): EnvelopeMatcher => ({ kind: 'category', category });
const onePair = (category: string, subCategory: string): EnvelopeMatcher => ({
  kind: 'sub-category',
  category,
  subCategory,
});

describe('matcherMatches', () => {
  it('matches the one pair a sub-category matcher names', () => {
    const m = onePair('Alimentation', 'Supermarche');
    expect(matcherMatches(m, 'Alimentation', 'Supermarche')).toBe(true);
    expect(matcherMatches(m, 'Alimentation', 'Restaurant')).toBe(false);
  });

  it('matches every sub-category under a category matcher', () => {
    const m = wholeCategory('Alimentation');
    expect(matcherMatches(m, 'Alimentation', 'Supermarche')).toBe(true);
    expect(matcherMatches(m, 'Alimentation', 'Restaurant')).toBe(true);
  });

  it('does not reach into another category', () => {
    expect(matcherMatches(wholeCategory('Alimentation'), 'Transports', 'Carburant')).toBe(false);
    expect(matcherMatches(onePair('Alimentation', 'Supermarche'), 'Transports', 'Supermarche')).toBe(
      false,
    );
  });

  it('compares exactly, rather than folding case', () => {
    // The bank's taxonomy is a fixed list picked from at source, so there is no
    // spelling variance to be lenient about — and leniency would silently merge
    // two categories the bank deliberately keeps apart.
    expect(matcherMatches(wholeCategory('Alimentation'), 'alimentation', 'Supermarche')).toBe(false);
  });
});

describe('matchersOverlap', () => {
  it('sees two envelopes claiming the same pair', () => {
    expect(
      matchersOverlap(onePair('Alimentation', 'Supermarche'), onePair('Alimentation', 'Supermarche')),
    ).toBe(true);
  });

  it('sees a category matcher swallowing a sub-category one beneath it', () => {
    // The case worth catching: "all of Alimentation" and "Alimentation /
    // Supermarche" look unrelated in the file and count the same spending twice.
    expect(matchersOverlap(wholeCategory('Alimentation'), onePair('Alimentation', 'Supermarche'))).toBe(
      true,
    );
    expect(matchersOverlap(onePair('Alimentation', 'Supermarche'), wholeCategory('Alimentation'))).toBe(
      true,
    );
  });

  it('leaves sibling sub-categories alone', () => {
    expect(
      matchersOverlap(onePair('Alimentation', 'Supermarche'), onePair('Alimentation', 'Restaurant')),
    ).toBe(false);
  });

  it('leaves different categories alone', () => {
    expect(matchersOverlap(wholeCategory('Alimentation'), wholeCategory('Transports'))).toBe(false);
  });
});

describe('labelMatches', () => {
  it('matches a substring of the transfer label', () => {
    expect(labelMatches('ALICE MARTIN', 'VIR RECU ALICE MARTIN 03/26')).toBe(true);
  });

  it('ignores case, because banks are inconsistent about it', () => {
    expect(labelMatches('alice martin', 'VIR RECU ALICE MARTIN')).toBe(true);
    expect(labelMatches('ALICE MARTIN', 'Vir recu Alice Martin')).toBe(true);
  });

  it('collapses runs of whitespace on both sides', () => {
    expect(labelMatches('ALICE  MARTIN', 'VIR ALICE MARTIN')).toBe(true);
    expect(labelMatches('ALICE MARTIN', 'VIR   ALICE   MARTIN')).toBe(true);
  });

  it('does not fold accents, so it fails in the direction that shows', () => {
    // A missed match leaves the contribution in the visible unattributed band,
    // where it can be found and fixed. A false match silently credits money to
    // the wrong person.
    expect(labelMatches('BENOIT', 'VIR RECU BENOÎT')).toBe(false);
  });

  it('never matches on an empty pattern', () => {
    // An empty string is a substring of everything, so this would credit every
    // inbound transfer in the ledger to one person.
    expect(labelMatches('', 'VIR RECU ALICE MARTIN')).toBe(false);
    expect(labelMatches('   ', 'VIR RECU ALICE MARTIN')).toBe(false);
  });

  it('does not match a label that merely shares a prefix', () => {
    expect(labelMatches('ALICE MARTIN', 'VIR RECU ALICE')).toBe(false);
  });
});

describe('normaliseLabel', () => {
  it('trims and collapses, leaving the words alone', () => {
    expect(normaliseLabel('  VIR   RECU  ALICE ')).toBe('VIR RECU ALICE');
  });
});
