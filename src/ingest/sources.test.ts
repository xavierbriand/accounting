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
});

describe('csvNameFor', () => {
  it('finds the csv beside the ofx', () => {
    expect(csvNameFor('carte_1111_01012024_31122024.ofx')).toBe('carte_1111_01012024_31122024.csv');
  });
});
