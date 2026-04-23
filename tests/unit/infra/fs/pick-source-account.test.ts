import { describe, it, expect } from 'vitest';
import { pickSourceAccount } from '../../../../src/infra/fs/pick-source-account.js';
import type { AccountConfig } from '@core/config/app-config.js';

// fails if: the longest-prefix-wins rule is implemented as first-wins,
//           or ties don't return Result.fail,
//           or zero-match doesn't return Result.fail

const bankAccount = (id: string, prefix: string): AccountConfig => ({
  id,
  type: 'bank',
  filenamePrefix: prefix,
});

describe('pickSourceAccount', () => {
  describe('zero matches', () => {
    it('returns failure when no account prefix matches the basename', () => {
      const accounts = [bankAccount('main', 'MAIN_'), bankAccount('savings', 'SAV_')];
      const result = pickSourceAccount('/tmp/OTHER_2026.csv', accounts);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('no account configured for this filename');
    });

    it('returns failure for empty accounts list', () => {
      const result = pickSourceAccount('/tmp/X_2026.csv', []);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('no account configured for this filename');
    });
  });

  describe('single match', () => {
    it('returns the matching account when exactly one prefix matches', () => {
      const accounts = [bankAccount('main', 'X_'), bankAccount('savings', 'SAV_')];
      const result = pickSourceAccount('/tmp/X_2026.csv', accounts);
      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('main');
    });

    it('matches on basename, not full path', () => {
      const accounts = [bankAccount('main', 'X_')];
      const result = pickSourceAccount('/home/user/downloads/X_2026.csv', accounts);
      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('main');
    });
  });

  describe('longest prefix wins', () => {
    it('selects the account with the longer matching prefix over a shorter one', () => {
      const accounts = [
        bankAccount('short', 'X_'),
        bankAccount('long', 'X_2026_'),
      ];
      const result = pickSourceAccount('/tmp/X_2026_jan.csv', accounts);
      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('long');
    });
  });

  describe('tied-length multi-match', () => {
    it('returns failure when two accounts have the same prefix and both match', () => {
      // Duplicate prefixes are prevented by config schema validation, but we test
      // the runtime guard directly here using raw AccountConfig objects.
      const tiedAccounts = [
        bankAccount('acct-a', 'FILE'),
        bankAccount('acct-b', 'FILE'),
      ];
      const result = pickSourceAccount('/tmp/FILE_2026.csv', tiedAccounts);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('ambiguous filename');
    });
  });

  describe('PII safety', () => {
    it('error messages do not contain the full path (home dir leak defence)', () => {
      const accounts = [bankAccount('main', 'MAIN_')];
      const result = pickSourceAccount('/home/alice/sensitive/OTHER_2026.csv', accounts);
      expect(result.isFailure).toBe(true);
      expect(result.error).not.toContain('/home/alice/sensitive');
    });
  });
});
