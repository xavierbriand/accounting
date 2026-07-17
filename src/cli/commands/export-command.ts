import fs from 'fs';
import path from 'path';
import type { Writable } from 'stream';
import type { DataExporter } from '@core/ports/data-exporter.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';
import { Result } from '@core/shared/result.js';
import { sanitizeFsError } from '../../infra/fs/sanitize-fs-error.js';
import { formatJsonSuccess, writeJsonErrorIf } from '../utils/json-envelope.js';

export interface ExportCommandOptions {
  readonly out?: string;
  readonly json: boolean;
}

export interface ExportCommandDeps {
  readonly dataExporter: DataExporter;
  readonly domainEventRecorder: DomainEventRecorder;
  readonly clock: () => string;
  readonly cwd: string;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
}

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

function writeFailure(stderr: Writable, json: boolean, message: string): void {
  writeln(stderr, `error: ${message}`);
  writeJsonErrorIf(stderr, json, 'export', { code: 'WRITE_FAILURE', message });
}

// --out is user-controlled; the raw/default value (not the resolved absolute
// path) is cited in failure messages — the resolved path is CLI-internal
// plumbing, not something the user needs echoed back (mirrors
// db-path-validator.ts's rawPath-in-message convention).
function resolveOutDir(rawOut: string | undefined, cwd: string): Result<string, string> {
  const display = rawOut ?? './exports';
  const resolved = path.resolve(cwd, display);

  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch (err) {
    return Result.fail(`cannot create --out directory '${display}': ${sanitizeFsError(err, '<out>')}`);
  }

  try {
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch (err) {
    return Result.fail(`--out directory is not writable '${display}': ${sanitizeFsError(err, '<out>')}`);
  }

  return Result.ok(resolved);
}

export async function runExportCommand(
  options: ExportCommandOptions,
  deps: ExportCommandDeps,
): Promise<void> {
  const { dataExporter, domainEventRecorder, clock, cwd, stdout, stderr, exitCode } = deps;

  const outDirResult = resolveOutDir(options.out, cwd);
  if (outDirResult.isFailure) {
    writeFailure(stderr, options.json, outDirResult.error);
    exitCode(1);
    return;
  }
  const outDir = outDirResult.value;

  const countsResult = dataExporter.counts();
  if (countsResult.isFailure) {
    const message = `could not count what will travel: ${countsResult.error}`;
    writeln(stderr, `error: ${message}`);
    writeJsonErrorIf(stderr, options.json, 'export', { code: 'QUERY_FAILURE', message });
    exitCode(1);
    return;
  }

  const bundleName = `accounting-export-${clock()}`;
  const exported = {
    transactions: countsResult.value.transactions,
    // +1: the DataExported event itself, recorded below but not yet in the
    // count counts() just read — the bundle's own trail will include it
    // (invariant 8, model note § Events).
    events: countsResult.value.events + 1,
  };

  // Record BEFORE writing the bundle: the subsequent DB read that builds
  // domain-events.json then includes this very event (invariant 8). A record
  // failure aborts before any bundle write — a bundle the trail can't explain
  // is worse than no bundle.
  const recordResult = domainEventRecorder.record({ type: 'DataExported', archiveLocation: bundleName, exported });
  if (recordResult.isFailure) {
    writeFailure(stderr, options.json, `could not record the export audit event: ${recordResult.error}`);
    exitCode(1);
    return;
  }

  const writeResult = await dataExporter.writeBundle(outDir, bundleName);
  if (writeResult.isFailure) {
    writeFailure(stderr, options.json, writeResult.error);
    exitCode(1);
    return;
  }

  const { location, manifestHash } = writeResult.value;
  if (options.json) {
    stdout.write(formatJsonSuccess('export', { location, proof: manifestHash, exported }));
  } else {
    writeln(stdout, `Export written to ${location}`);
    writeln(stdout, `Proof (manifest.json SHA-256): ${manifestHash}`);
  }
  exitCode(0);
}
