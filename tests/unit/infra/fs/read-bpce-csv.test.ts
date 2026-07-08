import { describe, it, expect } from 'vitest';
import { readBpceCsv } from '../../../../src/infra/fs/read-bpce-csv.js';
import { writeFileSync, chmodSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// fails if: the function returns a success result on ENOENT,
//           or error messages leak the full absolute path (home dir),
//           or the function throws instead of returning Result.fail

const TMP = tmpdir();

describe('readBpceCsv', () => {
  describe('happy path', () => {
    it('returns success with the file content as a string (latin1 encoding)', () => {
      const filePath = join(TMP, 'test-read-bpce-happy.csv');
      writeFileSync(filePath, 'header\nrow1\n', 'latin1');
      try {
        const result = readBpceCsv(filePath);
        expect(result.isSuccess).toBe(true);
        expect(result.value).toBe('header\nrow1\n');
      } finally {
        if (existsSync(filePath)) unlinkSync(filePath);
      }
    });
  });

  describe('ENOENT', () => {
    it('returns failure with a user-friendly message when file does not exist', () => {
      const fakePath = join(TMP, 'definitely-does-not-exist-xyz.csv');
      const result = readBpceCsv(fakePath);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('definitely-does-not-exist-xyz.csv');
      expect(result.error).not.toContain(TMP);
    });
  });

  describe('EACCES', () => {
    // fails if: a non-root process can still read a chmod 0o000 file
    //           (would mean the permission-error path never triggers)
    it.skipIf(process.getuid && process.getuid() === 0)(
      'returns failure with a permission-error message for unreadable file',
      () => {
        const filePath = join(TMP, 'test-read-bpce-noaccess.csv');
        writeFileSync(filePath, 'content', 'latin1');
        chmodSync(filePath, 0o000);
        try {
          const result = readBpceCsv(filePath);
          expect(result.isFailure).toBe(true);
          expect(result.error).toContain('test-read-bpce-noaccess.csv');
          expect(result.error).not.toContain(TMP);
        } finally {
          chmodSync(filePath, 0o644);
          if (existsSync(filePath)) unlinkSync(filePath);
        }
      },
    );

    // fails if: running as root, readBpceCsv throws instead of returning a
    //           Result (root bypasses the OS permission check, so EACCES
    //           never fires — the function must still resolve normally)
    it.runIf(process.getuid && process.getuid() === 0)(
      'resolves to a Result (success or failure) for root, which bypasses EACCES',
      () => {
        const filePath = join(TMP, 'test-read-bpce-noaccess.csv');
        writeFileSync(filePath, 'content', 'latin1');
        chmodSync(filePath, 0o000);
        try {
          const result = readBpceCsv(filePath);
          expect(result.isSuccess || result.isFailure).toBe(true);
        } finally {
          chmodSync(filePath, 0o644);
          if (existsSync(filePath)) unlinkSync(filePath);
        }
      },
    );
  });

  describe('PII safety', () => {
    it('error messages use only the basename, never the full path', () => {
      const filePath = join(TMP, 'nonexistent-pii-test.csv');
      const result = readBpceCsv(filePath);
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('nonexistent-pii-test.csv');
      expect(result.error).not.toContain(TMP);
    });
  });
});
