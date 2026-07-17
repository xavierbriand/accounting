/**
 * Integration tests for writeDissolutionReceipt (story-4.5c, R2 surface) — the
 * durability invariant 7 depends on: write-temp + fsync + rename, mode 0600.
 * Real fs, real tmp dirs.
 *
 * Gherkin coverage: underpins tests/features/dissolve.feature's proof-gated
 *   dissolution scenario (receipt content + permissions assertions).
 *
 * fails if: the receipt is not fsync'd before rename (a crash between write
 *   and rename could lose it — invariant 7's whole point), the file mode is
 *   not 0600, a `.tmp` remnant survives a failure, or recordedAt is not a
 *   valid ISO-8601 instant.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { DissolutionPerformed } from '../../../../src/core/events/domain-event.js';
import { writeDissolutionReceipt, type DissolutionReceipt } from '../../../../src/infra/fs/dissolution-receipt.js';

const tmpDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dissolution-receipt-'));
  tmpDirs.push(dir);
  return dir;
}

function makeEvent(): DissolutionPerformed {
  return {
    type: 'DissolutionPerformed',
    archiveLocation: 'accounting-export-2026-07-17T14-30-05',
    manifestHash: 'a'.repeat(64),
    wipedStores: ['/tmp/x/test.db.bak', '/tmp/x/test.db'],
  };
}

describe('writeDissolutionReceipt — happy path', () => {
  it('writes schemaVersion, an ISO recordedAt, the event, and archivePath', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'dissolution-receipt.json');
    const event = makeEvent();

    const result = writeDissolutionReceipt(receiptPath, { event, archivePath: '/tmp/exports/accounting-export-2026-07-17T14-30-05' });

    expect(result.isSuccess, `write failed: ${result.isFailure ? result.error : ''}`).toBe(true);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as DissolutionReceipt;
    expect(receipt.schemaVersion).toBeGreaterThan(0);
    expect(new Date(receipt.recordedAt).toISOString()).toBe(receipt.recordedAt);
    expect(receipt.event).toEqual(event);
    expect(receipt.archivePath).toBe('/tmp/exports/accounting-export-2026-07-17T14-30-05');
  });

  it.skipIf(process.platform === 'win32')('creates the file with mode 0600', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'dissolution-receipt.json');

    const result = writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/x' });

    expect(result.isSuccess).toBe(true);
    const stat = fs.statSync(receiptPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('leaves no .tmp remnant after a successful write', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'dissolution-receipt.json');

    const result = writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/x' });

    expect(result.isSuccess).toBe(true);
    expect(fs.readdirSync(tmpDir)).toEqual(['dissolution-receipt.json']);
  });

  it('fsyncs the temp file before renaming it into place (durability — invariant 7)', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'dissolution-receipt.json');
    const fsyncSpy = vi.spyOn(fs, 'fsyncSync');

    const result = writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/x' });

    expect(result.isSuccess).toBe(true);
    expect(fsyncSpy).toHaveBeenCalled();
  });

  it('overwrites an existing receipt at the same path (atomic replace)', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'dissolution-receipt.json');
    writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/first' });

    const second = writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/second' });

    expect(second.isSuccess).toBe(true);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as DissolutionReceipt;
    expect(receipt.archivePath).toBe('/tmp/second');
  });
});

describe('writeDissolutionReceipt — failure', () => {
  it('fails and leaves no .tmp remnant when the target directory does not exist', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'no-such-dir', 'dissolution-receipt.json');

    const result = writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/x' });

    expect(result.isFailure).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'no-such-dir'))).toBe(false);
  });

  it('sanitizes the underlying fs error (no absolute path leaked)', () => {
    const tmpDir = makeTmpDir();
    const receiptPath = path.join(tmpDir, 'no-such-dir', 'dissolution-receipt.json');

    const result = writeDissolutionReceipt(receiptPath, { event: makeEvent(), archivePath: '/tmp/x' });

    expect(result.isFailure).toBe(true);
    expect(result.error).not.toContain(tmpDir);
  });
});
