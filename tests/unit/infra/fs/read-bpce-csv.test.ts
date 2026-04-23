import { describe, it, expect, vi } from 'vitest';
import { readBpceCsv } from '../../../../src/infra/fs/read-bpce-csv.js';
import * as fs from 'fs';

// fails if: the function returns a success result on ENOENT,
//           or error messages leak the full absolute path (home dir),
//           or the function throws instead of returning Result.fail

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

const mockReadFileSync = vi.mocked(fs.readFileSync);

describe('readBpceCsv', () => {
  describe('happy path', () => {
    it('returns success with the file content as a string', () => {
      mockReadFileSync.mockReturnValueOnce('header\nrow1\n' as unknown as Buffer);
      const result = readBpceCsv('/tmp/X_2026.csv');
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('header\nrow1\n');
      expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/X_2026.csv', 'latin1');
    });
  });

  describe('ENOENT', () => {
    it('returns failure with a user-friendly message when file does not exist', () => {
      const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      mockReadFileSync.mockImplementationOnce(() => { throw err; });
      const result = readBpceCsv('/home/alice/X_2026.csv');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('X_2026.csv');
      expect(result.error).not.toContain('/home/alice');
    });
  });

  describe('EACCES', () => {
    it('returns failure with a permission-error message', () => {
      const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      mockReadFileSync.mockImplementationOnce(() => { throw err; });
      const result = readBpceCsv('/home/alice/X_2026.csv');
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('X_2026.csv');
      expect(result.error).not.toContain('/home/alice');
    });
  });

  describe('unknown error', () => {
    it('returns failure for unexpected errors', () => {
      mockReadFileSync.mockImplementationOnce(() => { throw new Error('something unexpected'); });
      const result = readBpceCsv('/tmp/X_2026.csv');
      expect(result.isFailure).toBe(true);
    });
  });
});
