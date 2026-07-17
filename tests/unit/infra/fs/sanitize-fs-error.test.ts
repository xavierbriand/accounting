/**
 * Unit tests for the shared sanitizeFsError helper (story-4.5b, extracted from
 * YamlConfigWriter's private copy — CLAUDE.md § 8 security-checklist "Filesystem
 * error messages from config-write paths must be sanitised").
 *
 * fails if: an absolute Unix or Windows path survives sanitisation, or the token
 *   parameter is ignored (both call sites — YamlConfigWriter and FsDataExporter —
 *   need their own redaction token).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeFsError } from '../../../../src/infra/fs/sanitize-fs-error.js';

describe('sanitizeFsError', () => {
  it('replaces a Unix absolute path in an Error message with the given token', () => {
    const err = new Error("ENOENT: no such file or directory, open '/home/user/secret/accounting.yaml'");
    const sanitized = sanitizeFsError(err, '<export>');
    expect(sanitized).not.toContain('/home/user/secret');
    expect(sanitized).toContain('<export>');
  });

  it('replaces a Windows absolute path in an Error message with the given token', () => {
    const err = new Error("EACCES: permission denied, open 'C:\\Users\\secret\\accounting.yaml'");
    const sanitized = sanitizeFsError(err, '<export>');
    expect(sanitized).not.toContain('C:\\Users\\secret');
    expect(sanitized).toContain('<export>');
  });

  it('accepts a non-Error value and stringifies it first', () => {
    expect(sanitizeFsError('plain string /abs/path', '<export>')).toContain('<export>');
  });

  it('is token-parameterized — different call sites redact with different tokens', () => {
    const err = new Error("EACCES: permission denied, mkdir '/tmp/x'");
    expect(sanitizeFsError(err, '<config>')).toContain('<config>');
    expect(sanitizeFsError(err, '<export>')).toContain('<export>');
  });

  it('leaves a message with no absolute path unchanged', () => {
    const err = new Error('mtime race');
    expect(sanitizeFsError(err, '<config>')).toBe('mtime race');
  });

  it('property: any generated absolute Unix path is fully removed from the sanitized message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_.-]+$/.test(s)),
        (segment) => {
          const err = new Error(`ENOENT: no such file or directory, open '/tmp/${segment}/file.txt'`);
          return !sanitizeFsError(err, '<x>').includes(`/tmp/${segment}`);
        },
      ),
    );
  });
});
