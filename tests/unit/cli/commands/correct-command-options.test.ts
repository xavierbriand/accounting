/**
 * Unit tests for parseCorrectOptions (Story 4.2b, FR14 — correct CLI options + zod boundary).
 *
 * fails if: --amount is parsed through a float intermediate (Number()/parseFloat) instead of
 *   string->integer-cents (security-checklist.md bans float parsing for money), or the zod
 *   boundary silently accepts an empty --category, a malformed --date, or an empty --reason.
 */
import { describe, it, expect } from 'vitest';
import { parseCorrectOptions } from '../../../../src/cli/commands/correct-command-options.js';
import type { CorrectCommandOptions } from '../../../../src/cli/commands/correct-command-options.js';

function baseOptions(overrides: Partial<CorrectCommandOptions> = {}): CorrectCommandOptions {
  return {
    transactionId: 'tx-original',
    reason: 'a valid reason',
    json: false,
    ...overrides,
  };
}

describe('parseCorrectOptions — amount: string-to-integer-cents, never a float intermediate', () => {
  it('parses a two-decimal amount to integer cents', () => {
    const result = parseCorrectOptions(baseOptions({ amount: '45.30' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.amountCents).toBe(4530);
  });

  it('parses a whole-number amount (no decimal point) to integer cents', () => {
    const result = parseCorrectOptions(baseOptions({ amount: '45' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.amountCents).toBe(4500);
  });

  it('pads a single-digit fraction to two decimal places', () => {
    const result = parseCorrectOptions(baseOptions({ amount: '45.3' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.amountCents).toBe(4530);
  });

  it('leaves amountCents undefined when --amount is not supplied', () => {
    const result = parseCorrectOptions(baseOptions());
    expect(result.isSuccess).toBe(true);
    expect(result.value.amountCents).toBeUndefined();
  });

  it('rejects a comma-separated decimal (not this CLI\'s locale, period-separated)', () => {
    const result = parseCorrectOptions(baseOptions({ amount: '45,30' }));
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('--amount');
  });

  it('rejects a non-numeric amount', () => {
    const result = parseCorrectOptions(baseOptions({ amount: 'abc' }));
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('--amount');
  });
});

describe('parseCorrectOptions — --category', () => {
  it('passes a non-empty category through unchanged', () => {
    const result = parseCorrectOptions(baseOptions({ category: 'Insurance' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.category).toBe('Insurance');
  });

  it('rejects an explicit empty --category (no business meaning, unlike --description)', () => {
    const result = parseCorrectOptions(baseOptions({ category: '' }));
    expect(result.isFailure).toBe(true);
  });
});

describe('parseCorrectOptions — --date', () => {
  it('accepts a bare YYYY-MM-DD date', () => {
    const result = parseCorrectOptions(baseOptions({ date: '2026-04-25' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.date).toBe('2026-04-25');
  });

  it('rejects a full ISO 8601 timestamp (bare date only, per the CLI contract)', () => {
    const result = parseCorrectOptions(baseOptions({ date: '2026-04-25T09:00:00+02:00' }));
    expect(result.isFailure).toBe(true);
  });

  it('rejects a slash-separated date', () => {
    const result = parseCorrectOptions(baseOptions({ date: '2026/04/25' }));
    expect(result.isFailure).toBe(true);
  });
});

describe('parseCorrectOptions — --description (any string, including empty — closes #185)', () => {
  it('passes an explicit empty description through as "" (not undefined)', () => {
    const result = parseCorrectOptions(baseOptions({ description: '' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.description).toBe('');
  });

  it('passes a non-empty description through unchanged', () => {
    const result = parseCorrectOptions(baseOptions({ description: 'Transport (corrected)' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.description).toBe('Transport (corrected)');
  });
});

describe('parseCorrectOptions — --reason (belt-and-suspenders non-empty check)', () => {
  it('rejects an empty reason', () => {
    const result = parseCorrectOptions(baseOptions({ reason: '' }));
    expect(result.isFailure).toBe(true);
  });

  it('accepts a non-empty reason', () => {
    const result = parseCorrectOptions(baseOptions({ reason: 'wrong amount on receipt' }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.reason).toBe('wrong amount on receipt');
  });
});

describe('parseCorrectOptions — pass-through fields', () => {
  it('carries transactionId and json through unchanged', () => {
    const result = parseCorrectOptions(baseOptions({ transactionId: 'tx-abc', json: true }));
    expect(result.isSuccess).toBe(true);
    expect(result.value.transactionId).toBe('tx-abc');
    expect(result.value.json).toBe(true);
  });

  it('rejects an empty transactionId', () => {
    const result = parseCorrectOptions(baseOptions({ transactionId: '' }));
    expect(result.isFailure).toBe(true);
  });
});
