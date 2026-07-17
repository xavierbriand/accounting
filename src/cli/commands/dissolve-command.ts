import fs from 'fs';
import path from 'path';
import type { Writable } from 'stream';
import type { DataExporter } from '@core/ports/data-exporter.js';
import type { StoreReset } from '@core/ports/store-reset.js';
import type { DissolutionPerformed } from '@core/events/domain-event.js';
import { Result } from '@core/shared/result.js';
import type { VerifiedBundle } from '../../infra/export/bundle-verifier.js';
import { sanitizeSqlError } from '../utils/sanitize-sql-error.js';
import type { InteractivePrompter } from '../utils/interactive.js';
import { formatJsonSuccess, writeJsonErrorIf, type JsonErrorCode } from '../utils/json-envelope.js';

export interface DissolveCommandOptions {
  readonly bundle: string;
  readonly confirm: boolean;
  readonly json: boolean;
}

export interface DissolveCommandDeps {
  readonly dataExporter: DataExporter;
  readonly storeReset: StoreReset;
  readonly verifyBundle: (bundleDir: string) => Promise<Result<VerifiedBundle>>;
  readonly writeReceipt: (
    receiptPath: string,
    params: { readonly event: DissolutionPerformed; readonly archivePath: string },
  ) => Result<void>;
  readonly planWipeTargets: (dbPath: string) => readonly string[];
  readonly prompt: InteractivePrompter;
  readonly closeDb: () => void;
  readonly dbPath: string;
  readonly configPath: string;
  readonly cwd: string;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
}

const RECEIPT_FILENAME = 'dissolution-receipt.json';

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

// --bundle is a read path (unlike export's create-if-missing --out): must
// already exist, must be a directory, symlinked dirs refused (TOCTOU/layout-
// swap hardening, per-file parity deferred with #88). The raw value — not the
// resolved path — is cited in failure messages (db-path-validator.ts/
// export-command.ts's resolveOutDir convention).
function resolveBundleDir(raw: string, cwd: string): Result<string, string> {
  const resolved = path.resolve(cwd, raw);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    return Result.fail(`--bundle directory not found: '${raw}'`);
  }
  if (stat.isSymbolicLink()) {
    return Result.fail(`refusing a symlinked --bundle directory: '${raw}'`);
  }
  if (!stat.isDirectory()) {
    return Result.fail(`--bundle path is not a directory: '${raw}'`);
  }
  return Result.ok(resolved);
}

// The refusal shape (prose to stderr + optional --json envelope + exit code)
// repeats at every gate below — one helper instead of six near-identical
// four-line blocks (60-LOC-plus-duplication signal, story-4.5c slice 6).
function fail(
  deps: Pick<DissolveCommandDeps, 'stderr' | 'exitCode'>,
  json: boolean,
  code: JsonErrorCode,
  message: string,
  exit: number,
): void {
  writeln(deps.stderr, `error: ${message}`);
  writeJsonErrorIf(deps.stderr, json, 'dissolve', { code, message });
  deps.exitCode(exit);
}

function buildConfirmationSummary(bundleDir: string): string {
  return (
    'This will permanently erase the ledger database (transactions, audit trail, snapshots).\n' +
    'Preserved: accounting.yaml and a dissolution receipt.\n' +
    `Export-proof verified against: ${bundleDir}`
  );
}

export async function runDissolveCommand(
  options: DissolveCommandOptions,
  deps: DissolveCommandDeps,
): Promise<void> {
  const {
    dataExporter, storeReset, verifyBundle, writeReceipt, planWipeTargets,
    prompt, closeDb, dbPath, configPath, cwd, stdout, stderr, exitCode,
  } = deps;

  const bundleDirResult = resolveBundleDir(options.bundle, cwd);
  if (bundleDirResult.isFailure) {
    fail(deps, options.json, 'INVALID_ARGUMENT', bundleDirResult.error, 2);
    return;
  }
  const bundleDir = bundleDirResult.value;

  const verifyResult = await verifyBundle(bundleDir);
  if (verifyResult.isFailure) {
    fail(deps, options.json, 'INVALID_ARGUMENT', `export-proof verification failed: ${verifyResult.error}`, 2);
    return;
  }
  const verified = verifyResult.value;

  const countsResult = dataExporter.counts();
  if (countsResult.isFailure) {
    fail(deps, options.json, 'QUERY_FAILURE', `could not read the current ledger counts: ${sanitizeSqlError(countsResult.error)}`, 1);
    return;
  }
  const liveCounts = countsResult.value;

  // Strict staleness (invariant 6 amendment): an export-proof authorizes wiping
  // exactly the data it describes. Append-only stores make count equality tail
  // equality, so a live/manifest count mismatch — or a bundle whose own last
  // event isn't its DataExported sanity marker — means the archive is missing
  // data the wipe would otherwise destroy. No --allow-stale escape.
  const stale =
    verified.counts.transactions !== liveCounts.transactions ||
    verified.counts.events !== liveCounts.events ||
    verified.lastEvent === null ||
    verified.lastEvent.type !== 'DataExported';
  if (stale) {
    fail(deps, options.json, 'INVALID_ARGUMENT', "the household's data changed since this export-proof was minted — run `accounting export` again", 2);
    return;
  }

  if (!options.confirm) {
    if (options.json) {
      fail(deps, true, 'NEEDS_REVIEW', 'confirmation required; re-run with --confirm', 2);
      return;
    }
    try {
      const confirmed = await prompt.confirmDissolution(buildConfirmationSummary(bundleDir));
      if (!confirmed) {
        writeln(stdout, 'Dissolution cancelled — nothing was touched.');
        exitCode(0);
        return;
      }
    } catch {
      // Prompt unavailable (non-TTY, closed stdin, etc.) — distinct from a
      // completed prompt that answered no. Prose-only: this branch is
      // unreachable under --json (handled above), matching the contract's
      // "interactive-only failure paths stay prose-only" convention.
      writeln(stderr, 'error: confirmation prompt unavailable; re-run with --confirm');
      exitCode(2);
      return;
    }
  }

  const archiveLocation = path.basename(bundleDir);
  // Predicted, not observed — receipt-before-wipe (invariant 7) means this is
  // written before StoreReset ever runs. Single-user local CLI: the same
  // existence check wipe() re-does moments later observes the same fs state.
  const wipedStores = planWipeTargets(dbPath);
  const event: DissolutionPerformed = {
    type: 'DissolutionPerformed',
    archiveLocation,
    manifestHash: verified.manifestHash,
    wipedStores,
  };
  const receiptPath = path.join(path.dirname(configPath), RECEIPT_FILENAME);

  const receiptResult = writeReceipt(receiptPath, { event, archivePath: bundleDir });
  if (receiptResult.isFailure) {
    fail(deps, options.json, 'WRITE_FAILURE', `could not write the dissolution receipt: ${receiptResult.error} — nothing has been deleted`, 1);
    return;
  }

  closeDb();

  const wipeResult = await storeReset.wipe();
  if (wipeResult.isFailure) {
    fail(deps, options.json, 'WRITE_FAILURE', `the dissolution receipt was written, but the wipe failed: ${wipeResult.error} — re-run to finish`, 1);
    return;
  }

  const actuallyWiped = wipeResult.value;
  if (options.json) {
    stdout.write(formatJsonSuccess('dissolve', { receiptPath, archiveLocation, wipedStores: actuallyWiped }));
  } else {
    writeln(stdout, `Dissolution complete. Erased: ${actuallyWiped.join(', ')}`);
    writeln(stdout, `Preserved: ${configPath}, ${receiptPath}`);
  }
  exitCode(0);
}
