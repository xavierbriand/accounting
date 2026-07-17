/**
 * Unit tests for runExportCommand (story-4.5b, FR21 — export CLI command
 * orchestration). Port mocks (DataExporter, DomainEventRecorder) — real fs
 * only for the --out resolution/validation branch (mirrors db-path-validator.ts's
 * own real-tmp-dir testing convention).
 *
 * Gherkin coverage: docs/plans/story-4.5b.md § Gherkin acceptance scenarios —
 *   the record-before-write ordering (invariant 8) and failure-envelope shape
 *   this file drives are exercised end-to-end by tests/features/export.feature.
 *
 * fails if: writeBundle is called before domainEventRecorder.record() (breaks
 *   invariant 8), the +1 for the about-to-exist event is missing from the
 *   recorded exported.events count, a failure path skips the WRITE_FAILURE/
 *   QUERY_FAILURE envelope under --json, or the bundleName handed to record()
 *   and writeBundle() ever diverge.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Writable } from 'stream';
import { makeCapturingStream as makeCapture } from '../../../_helpers/streams.js';
import { unwrapSuccess, unwrapError } from '../../../_helpers/json-envelope.js';
import { runExportCommand } from '../../../../src/cli/commands/export-command.js';
import type { ExportCommandDeps } from '../../../../src/cli/commands/export-command.js';
import type { ExportCommandOptions } from '../../../../src/cli/commands/export-command.js';
import { Result } from '@core/shared/result.js';
import type { DataExporter } from '@core/ports/data-exporter.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-command-unit-'));
  tmpDirs.push(dir);
  return dir;
}

function baseOptions(overrides: Partial<ExportCommandOptions> = {}): ExportCommandOptions {
  return { json: false, ...overrides };
}

function makeDeps(overrides: {
  cwd?: string;
  countsResult?: Result<{ transactions: number; events: number }>;
  recordResult?: Result<void>;
  writeBundleResult?: Result<{ manifestHash: string; location: string }>;
} = {}): {
  deps: ExportCommandDeps;
  stdout: Writable & { captured: string };
  stderr: Writable & { captured: string };
  exitCodes: number[];
  recordMock: ReturnType<typeof vi.fn>;
  writeBundleMock: ReturnType<typeof vi.fn>;
  callOrder: string[];
} {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];
  const callOrder: string[] = [];

  const countsResult = overrides.countsResult ?? Result.ok({ transactions: 4, events: 6 });
  const recordResult = overrides.recordResult ?? Result.ok();
  const writeBundleResult =
    overrides.writeBundleResult ?? Result.ok({ manifestHash: 'a'.repeat(64), location: '/exports/accounting-export-fixed-stamp' });

  const recordMock = vi.fn().mockImplementation(() => {
    callOrder.push('record');
    return recordResult;
  });
  const writeBundleMock = vi.fn().mockImplementation(() => {
    callOrder.push('writeBundle');
    return Promise.resolve(writeBundleResult);
  });

  const dataExporter: DataExporter = {
    counts: () => countsResult,
    writeBundle: writeBundleMock,
  };
  const domainEventRecorder: DomainEventRecorder = { record: recordMock };

  const deps: ExportCommandDeps = {
    dataExporter,
    domainEventRecorder,
    clock: () => 'fixed-stamp',
    cwd: overrides.cwd ?? makeTmpDir(),
    stdout,
    stderr,
    exitCode: (code: number) => exitCodes.push(code),
  };

  return { deps, stdout, stderr, exitCodes, recordMock, writeBundleMock, callOrder };
}

describe('runExportCommand — --out resolution', () => {
  it('defaults to ./exports under cwd when --out is omitted', async () => {
    const cwd = makeTmpDir();
    const { deps, exitCodes } = makeDeps({ cwd });

    await runExportCommand(baseOptions(), deps);

    expect(exitCodes).toEqual([0]);
    expect(fs.existsSync(path.join(cwd, 'exports'))).toBe(true);
  });

  it('creates a custom --out directory when it does not yet exist', async () => {
    const cwd = makeTmpDir();
    const { deps, exitCodes } = makeDeps({ cwd });

    await runExportCommand(baseOptions({ out: 'my-backups' }), deps);

    expect(exitCodes).toEqual([0]);
    expect(fs.existsSync(path.join(cwd, 'my-backups'))).toBe(true);
  });

  it('fails with WRITE_FAILURE when --out cannot be created (a file blocks the path)', async () => {
    const cwd = makeTmpDir();
    fs.writeFileSync(path.join(cwd, 'blocked'), 'not a directory', 'utf8');
    const { deps, stderr, exitCodes, recordMock, writeBundleMock } = makeDeps({ cwd });

    await runExportCommand(baseOptions({ out: 'blocked', json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('WRITE_FAILURE');
    expect(recordMock).not.toHaveBeenCalled();
    expect(writeBundleMock).not.toHaveBeenCalled();
  });

  it('cites the raw --out value (not the resolved absolute path) in the failure message', async () => {
    const cwd = makeTmpDir();
    fs.writeFileSync(path.join(cwd, 'blocked'), 'not a directory', 'utf8');
    const { deps, stderr } = makeDeps({ cwd });

    await runExportCommand(baseOptions({ out: 'blocked' }), deps);

    expect(stderr.captured).toContain('blocked');
    expect(stderr.captured).not.toContain(cwd);
  });
});

describe('runExportCommand — counts failure', () => {
  it('fails with QUERY_FAILURE and never records or writes when counts() fails', async () => {
    const { deps, stderr, exitCodes, recordMock, writeBundleMock } = makeDeps({
      countsResult: Result.fail('db unreachable'),
    });

    await runExportCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('QUERY_FAILURE');
    expect(recordMock).not.toHaveBeenCalled();
    expect(writeBundleMock).not.toHaveBeenCalled();
  });
});

describe('runExportCommand — record-before-write ordering (invariant 8)', () => {
  it('calls domainEventRecorder.record() before dataExporter.writeBundle()', async () => {
    const { deps, callOrder } = makeDeps();

    await runExportCommand(baseOptions(), deps);

    expect(callOrder).toEqual(['record', 'writeBundle']);
  });

  it('records exported.events as counts.events + 1 (the event about to exist)', async () => {
    const { deps, recordMock } = makeDeps({ countsResult: Result.ok({ transactions: 4, events: 6 }) });

    await runExportCommand(baseOptions(), deps);

    const event = recordMock.mock.calls[0][0] as { exported: { transactions: number; events: number } };
    expect(event.exported).toEqual({ transactions: 4, events: 7 });
  });

  it('records a DataExported event with an archiveLocation matching the bundle name (no path separators)', async () => {
    const { deps, recordMock } = makeDeps();

    await runExportCommand(baseOptions(), deps);

    const event = recordMock.mock.calls[0][0] as { type: string; archiveLocation: string };
    expect(event.type).toBe('DataExported');
    expect(event.archiveLocation).toBe('accounting-export-fixed-stamp');
    expect(event.archiveLocation).not.toMatch(/[/\\]/);
  });

  it('passes the same bundle name to writeBundle as was recorded', async () => {
    const { deps, recordMock, writeBundleMock } = makeDeps();

    await runExportCommand(baseOptions(), deps);

    const event = recordMock.mock.calls[0][0] as { archiveLocation: string };
    const [, bundleNameArg] = writeBundleMock.mock.calls[0] as [string, string];
    expect(bundleNameArg).toBe(event.archiveLocation);
  });

  it('does not call writeBundle when record() fails (never write a bundle the trail cannot explain)', async () => {
    const { deps, stderr, exitCodes, writeBundleMock } = makeDeps({
      recordResult: Result.fail('disk full'),
    });

    await runExportCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('WRITE_FAILURE');
    expect(writeBundleMock).not.toHaveBeenCalled();
  });
});

describe('runExportCommand — writeBundle failure', () => {
  it('fails with WRITE_FAILURE when writeBundle() fails', async () => {
    const { deps, stderr, exitCodes } = makeDeps({
      writeBundleResult: Result.fail('permission denied'),
    });

    await runExportCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('WRITE_FAILURE');
  });
});

describe('runExportCommand — success output', () => {
  it('prints the bundle location and the manifest-hash proof on the human path', async () => {
    const { deps, stdout, exitCodes } = makeDeps({
      writeBundleResult: Result.ok({ manifestHash: 'f'.repeat(64), location: '/exports/accounting-export-fixed-stamp' }),
    });

    await runExportCommand(baseOptions(), deps);

    expect(exitCodes).toEqual([0]);
    expect(stdout.captured).toContain('/exports/accounting-export-fixed-stamp');
    expect(stdout.captured).toContain('f'.repeat(64));
  });

  it('emits the documented envelope shape on the --json path with non-zero exported counts', async () => {
    const { deps, stdout, exitCodes } = makeDeps({
      countsResult: Result.ok({ transactions: 4, events: 6 }),
      writeBundleResult: Result.ok({ manifestHash: 'b'.repeat(64), location: '/exports/accounting-export-fixed-stamp' }),
    });

    await runExportCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([0]);
    const data = unwrapSuccess<{ location: string; proof: string; exported: { transactions: number; events: number } }>(stdout.captured);
    expect(data.location).toBe('/exports/accounting-export-fixed-stamp');
    expect(data.proof).toBe('b'.repeat(64));
    expect(data.exported).toEqual({ transactions: 4, events: 7 });
    expect(data.exported.transactions).toBeGreaterThan(0);
    expect(data.exported.events).toBeGreaterThan(0);
  });
});
