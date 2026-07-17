/**
 * Unit tests for runDissolveCommand (story-4.5c, FR21 completion — dissolve CLI
 * command orchestration). Port mocks (DataExporter, StoreReset, InteractivePrompter)
 * + injected verifyBundle/writeReceipt/planWipeTargets function refs; real fs only
 * for the --bundle resolution branch (mirrors export-command.test.ts's own
 * real-tmp-dir convention for --out).
 *
 * Gherkin coverage: docs/plans/story-4.5c.md § Gherkin acceptance scenarios — the
 *   verify→stale→confirm→receipt→closeDb→wipe gating order (invariants 6/7) this
 *   file drives is exercised end-to-end by tests/features/dissolve.feature.
 *
 * fails if: storeReset.wipe() is ever called before writeReceipt succeeds
 *   (invariant 7), or before verifyBundle/staleness pass (invariant 6), a
 *   refusal path still calls closeDb/wipe, the confirm gate's three outcomes
 *   (bypass/typed-refusal/prompt-unavailable) map to the wrong exit code, or
 *   the receipt's wipedStores diverges from the pre-wipe prediction.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Writable } from 'stream';
import { makeCapturingStream as makeCapture } from '../../../_helpers/streams.js';
import { unwrapSuccess, unwrapError } from '../../../_helpers/json-envelope.js';
import { runDissolveCommand } from '../../../../src/cli/commands/dissolve-command.js';
import type { DissolveCommandDeps, DissolveCommandOptions } from '../../../../src/cli/commands/dissolve-command.js';
import { Result } from '@core/shared/result.js';
import type { DataExporter } from '@core/ports/data-exporter.js';
import type { StoreReset } from '@core/ports/store-reset.js';
import type { VerifiedBundle } from '../../../../src/infra/export/bundle-verifier.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dissolve-command-unit-'));
  tmpDirs.push(dir);
  return dir;
}

function baseOptions(overrides: Partial<DissolveCommandOptions> = {}): DissolveCommandOptions {
  return { bundle: 'the-bundle', confirm: true, json: false, ...overrides };
}

function makeVerified(overrides: Partial<VerifiedBundle> = {}): VerifiedBundle {
  return {
    manifestHash: 'a'.repeat(64),
    counts: { transactions: 2, events: 3 },
    lastEvent: { seq: 3, type: 'DataExported', recordedAt: '2026-07-17T12:00:00.000Z' },
    ...overrides,
  };
}

function makeDeps(overrides: {
  cwd?: string;
  bundleDir?: string;
  verifyResult?: Result<VerifiedBundle>;
  countsResult?: Result<{ transactions: number; events: number }>;
  confirmResult?: 'true' | 'false' | 'throw';
  writeReceiptResult?: Result<void>;
  wipeResult?: Result<readonly string[]>;
  planWipeTargetsReturn?: readonly string[];
} = {}): {
  deps: DissolveCommandDeps;
  stdout: Writable & { captured: string };
  stderr: Writable & { captured: string };
  exitCodes: number[];
  callOrder: string[];
  verifyBundleMock: ReturnType<typeof vi.fn>;
  countsMock: ReturnType<typeof vi.fn>;
  confirmMock: ReturnType<typeof vi.fn>;
  writeReceiptMock: ReturnType<typeof vi.fn>;
  closeDbMock: ReturnType<typeof vi.fn>;
  wipeMock: ReturnType<typeof vi.fn>;
  planWipeTargetsMock: ReturnType<typeof vi.fn>;
  bundleDir: string;
} {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];
  const callOrder: string[] = [];

  const cwd = overrides.cwd ?? makeTmpDir();
  const bundleDir = overrides.bundleDir ?? (() => {
    const dir = path.join(cwd, 'the-bundle');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  })();

  const verifyResult = overrides.verifyResult ?? Result.ok(makeVerified());
  const countsResult = overrides.countsResult ?? Result.ok({ transactions: 2, events: 3 });
  const writeReceiptResult = overrides.writeReceiptResult ?? Result.ok(undefined);
  const wipeResult = overrides.wipeResult ?? Result.ok(['/db.bak', '/db']);
  const planWipeTargetsReturn = overrides.planWipeTargetsReturn ?? ['/db.bak', '/db'];

  const verifyBundleMock = vi.fn().mockImplementation(() => {
    callOrder.push('verifyBundle');
    return Promise.resolve(verifyResult);
  });

  const countsMock = vi.fn().mockImplementation(() => {
    callOrder.push('counts');
    return countsResult;
  });

  const confirmMock = vi.fn().mockImplementation(() => {
    callOrder.push('confirm');
    if (overrides.confirmResult === 'false') return Promise.resolve(false);
    if (overrides.confirmResult === 'throw') return Promise.reject(new Error('prompt unavailable'));
    return Promise.resolve(true);
  });

  const writeReceiptMock = vi.fn().mockImplementation(() => {
    callOrder.push('writeReceipt');
    return writeReceiptResult;
  });

  const closeDbMock = vi.fn().mockImplementation(() => {
    callOrder.push('closeDb');
  });

  const wipeMock = vi.fn().mockImplementation(() => {
    callOrder.push('wipe');
    return Promise.resolve(wipeResult);
  });

  const planWipeTargetsMock = vi.fn().mockReturnValue(planWipeTargetsReturn);

  const dataExporter: DataExporter = { counts: countsMock, writeBundle: vi.fn() };
  const storeReset: StoreReset = { wipe: wipeMock };

  const deps: DissolveCommandDeps = {
    dataExporter,
    storeReset,
    verifyBundle: verifyBundleMock,
    writeReceipt: writeReceiptMock,
    planWipeTargets: planWipeTargetsMock,
    prompt: {
      selectCategory: vi.fn(),
      confirmBatch: vi.fn(),
      confirmRememberRule: vi.fn(),
      confirmDissolution: confirmMock,
    },
    closeDb: closeDbMock,
    dbPath: path.join(cwd, 'test.db'),
    configPath: path.join(cwd, 'accounting.yaml'),
    cwd,
    stdout,
    stderr,
    exitCode: (code: number) => exitCodes.push(code),
  };

  return {
    deps, stdout, stderr, exitCodes, callOrder,
    verifyBundleMock, countsMock, confirmMock, writeReceiptMock, closeDbMock, wipeMock, planWipeTargetsMock,
    bundleDir,
  };
}

describe('runDissolveCommand — --bundle resolution', () => {
  it('fails with INVALID_ARGUMENT citing the raw value when the bundle directory does not exist', async () => {
    const cwd = makeTmpDir();
    const { deps, stderr, exitCodes, verifyBundleMock } = makeDeps({ cwd, bundleDir: path.join(cwd, 'ghost') });

    await runDissolveCommand(baseOptions({ bundle: 'ghost', json: true }), deps);

    expect(exitCodes).toEqual([2]);
    expect(unwrapError(stderr.captured).code).toBe('INVALID_ARGUMENT');
    expect(stderr.captured).toContain('ghost');
    expect(verifyBundleMock).not.toHaveBeenCalled();
  });

  it('refuses a symlinked --bundle directory', async () => {
    const cwd = makeTmpDir();
    const target = path.join(cwd, 'real-bundle');
    fs.mkdirSync(target);
    const link = path.join(cwd, 'link-bundle');
    fs.symlinkSync(target, link);
    const { deps, stderr, exitCodes, verifyBundleMock } = makeDeps({ cwd, bundleDir: target });

    await runDissolveCommand(baseOptions({ bundle: 'link-bundle', json: true }), deps);

    expect(exitCodes).toEqual([2]);
    expect(unwrapError(stderr.captured).code).toBe('INVALID_ARGUMENT');
    expect(verifyBundleMock).not.toHaveBeenCalled();
  });

  it('fails with INVALID_ARGUMENT when --bundle points at a file, not a directory', async () => {
    const cwd = makeTmpDir();
    const filePath = path.join(cwd, 'not-a-dir');
    fs.writeFileSync(filePath, 'nope', 'utf8');
    const { deps, stderr, exitCodes } = makeDeps({ cwd, bundleDir: filePath });

    await runDissolveCommand(baseOptions({ bundle: 'not-a-dir', json: true }), deps);

    expect(exitCodes).toEqual([2]);
    expect(unwrapError(stderr.captured).code).toBe('INVALID_ARGUMENT');
  });
});

describe('runDissolveCommand — verification failure', () => {
  it('fails with INVALID_ARGUMENT and touches nothing further when verifyBundle fails', async () => {
    const { deps, stderr, exitCodes, countsMock, confirmMock, writeReceiptMock, closeDbMock, wipeMock } = makeDeps({
      verifyResult: Result.fail('checksum mismatch'),
    });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([2]);
    expect(unwrapError(stderr.captured).code).toBe('INVALID_ARGUMENT');
    expect(countsMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writeReceiptMock).not.toHaveBeenCalled();
    expect(closeDbMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();
  });
});

describe('runDissolveCommand — staleness gate', () => {
  it('fails with INVALID_ARGUMENT naming the export-proof and suggesting a fresh export when counts differ', async () => {
    const { deps, stderr, exitCodes, confirmMock, writeReceiptMock, wipeMock } = makeDeps({
      verifyResult: Result.ok(makeVerified({ counts: { transactions: 2, events: 3 } })),
      countsResult: Result.ok({ transactions: 3, events: 3 }),
    });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([2]);
    const error = unwrapError(stderr.captured);
    expect(error.code).toBe('INVALID_ARGUMENT');
    expect(error.message).toContain('export-proof');
    expect(error.message).toContain('accounting export');
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writeReceiptMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();
  });

  it('fails as stale when the bundle lastEvent is not DataExported', async () => {
    const { deps, exitCodes, stderr } = makeDeps({
      verifyResult: Result.ok(makeVerified({ lastEvent: { seq: 4, type: 'TransactionIngested', recordedAt: '2026-07-17T12:00:00.000Z' } })),
    });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([2]);
    expect(unwrapError(stderr.captured).code).toBe('INVALID_ARGUMENT');
  });

  it('fails as stale when the bundle lastEvent is null', async () => {
    const { deps, exitCodes } = makeDeps({
      verifyResult: Result.ok(makeVerified({ lastEvent: null })),
    });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([2]);
  });

  it('fails with QUERY_FAILURE when the live counts read fails', async () => {
    const { deps, stderr, exitCodes } = makeDeps({ countsResult: Result.fail('db unreachable') });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('QUERY_FAILURE');
  });
});

describe('runDissolveCommand — confirmation gate', () => {
  it('bypasses the prompt entirely when --confirm is set', async () => {
    const { deps, confirmMock, exitCodes } = makeDeps();

    await runDissolveCommand(baseOptions({ confirm: true }), deps);

    expect(confirmMock).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([0]);
  });

  it('emits NEEDS_REVIEW without ever prompting when --json is set without --confirm', async () => {
    const { deps, confirmMock, stderr, exitCodes, writeReceiptMock } = makeDeps();

    await runDissolveCommand(baseOptions({ confirm: false, json: true }), deps);

    expect(confirmMock).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([2]);
    expect(unwrapError(stderr.captured).code).toBe('NEEDS_REVIEW');
    expect(writeReceiptMock).not.toHaveBeenCalled();
  });

  it('exits 0 with nothing touched when the user types anything other than DISSOLVE', async () => {
    const { deps, exitCodes, writeReceiptMock, wipeMock } = makeDeps({ confirmResult: 'false' });

    await runDissolveCommand(baseOptions({ confirm: false, json: false }), deps);

    expect(exitCodes).toEqual([0]);
    expect(writeReceiptMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();
  });

  it('exits 2 with nothing touched when the confirmation prompt is unavailable (rejects)', async () => {
    const { deps, exitCodes, writeReceiptMock, wipeMock, stderr } = makeDeps({ confirmResult: 'throw' });

    await runDissolveCommand(baseOptions({ confirm: false, json: false }), deps);

    expect(exitCodes).toEqual([2]);
    expect(writeReceiptMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();
    expect(stderr.captured.length).toBeGreaterThan(0);
  });

  it('proceeds to the receipt when the user types DISSOLVE', async () => {
    const { deps, exitCodes, writeReceiptMock } = makeDeps({ confirmResult: 'true' });

    await runDissolveCommand(baseOptions({ confirm: false, json: false }), deps);

    expect(exitCodes).toEqual([0]);
    expect(writeReceiptMock).toHaveBeenCalledOnce();
  });
});

describe('runDissolveCommand — receipt-before-wipe ordering (invariant 7)', () => {
  it('calls verifyBundle, counts, writeReceipt, closeDb, then wipe in that order', async () => {
    const { deps, callOrder } = makeDeps();

    await runDissolveCommand(baseOptions(), deps);

    expect(callOrder).toEqual(['verifyBundle', 'counts', 'writeReceipt', 'closeDb', 'wipe']);
  });

  it('does not call closeDb or wipe when writeReceipt fails', async () => {
    const { deps, closeDbMock, wipeMock, stderr, exitCodes } = makeDeps({
      writeReceiptResult: Result.fail('disk full'),
    });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('WRITE_FAILURE');
    expect(closeDbMock).not.toHaveBeenCalled();
    expect(wipeMock).not.toHaveBeenCalled();
  });

  it('records the pre-wipe planWipeTargets prediction as the receipt event\'s wipedStores', async () => {
    const { deps, writeReceiptMock } = makeDeps({ planWipeTargetsReturn: ['/x/test.db.bak', '/x/test.db'] });

    await runDissolveCommand(baseOptions(), deps);

    const [, params] = writeReceiptMock.mock.calls[0] as [string, { event: { wipedStores: string[] } }];
    expect(params.event.wipedStores).toEqual(['/x/test.db.bak', '/x/test.db']);
  });

  it('records manifestHash and the bundle basename as archiveLocation in the receipt event', async () => {
    const { deps, writeReceiptMock, bundleDir } = makeDeps({
      verifyResult: Result.ok(makeVerified({ manifestHash: 'f'.repeat(64) })),
    });

    await runDissolveCommand(baseOptions(), deps);

    const [, params] = writeReceiptMock.mock.calls[0] as [string, { event: { manifestHash: string; archiveLocation: string; type: string } }];
    expect(params.event.type).toBe('DissolutionPerformed');
    expect(params.event.manifestHash).toBe('f'.repeat(64));
    expect(params.event.archiveLocation).toBe(path.basename(bundleDir));
  });
});

describe('runDissolveCommand — wipe failure', () => {
  it('fails with WRITE_FAILURE after closeDb has already run when wipe fails', async () => {
    const { deps, stderr, exitCodes, closeDbMock } = makeDeps({ wipeResult: Result.fail('permission denied') });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([1]);
    expect(unwrapError(stderr.captured).code).toBe('WRITE_FAILURE');
    expect(closeDbMock).toHaveBeenCalledOnce();
  });
});

describe('runDissolveCommand — success output', () => {
  it('emits the documented envelope shape with receiptPath, archiveLocation, and wipedStores', async () => {
    const { deps, stdout, exitCodes, bundleDir } = makeDeps({
      wipeResult: Result.ok(['/x/test.db.bak', '/x/test.db']),
    });

    await runDissolveCommand(baseOptions({ json: true }), deps);

    expect(exitCodes).toEqual([0]);
    const data = unwrapSuccess<{ receiptPath: string; archiveLocation: string; wipedStores: string[] }>(stdout.captured);
    expect(data.receiptPath).toBe(path.join(path.dirname(deps.configPath), 'dissolution-receipt.json'));
    expect(data.archiveLocation).toBe(path.basename(bundleDir));
    expect(data.wipedStores).toEqual(['/x/test.db.bak', '/x/test.db']);
  });

  it('prints a human-readable summary on the non-json path', async () => {
    const { deps, stdout, exitCodes } = makeDeps({ wipeResult: Result.ok(['/x/test.db.bak', '/x/test.db']) });

    await runDissolveCommand(baseOptions({ json: false }), deps);

    expect(exitCodes).toEqual([0]);
    expect(stdout.captured).toContain('/x/test.db.bak');
    expect(stdout.captured).toContain('/x/test.db');
  });
});
