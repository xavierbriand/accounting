import fs from 'fs';
import crypto from 'crypto';
import type { DissolutionPerformed } from '@core/events/domain-event.js';
import { Result } from '@core/shared/result.js';
import { sanitizeFsError } from './sanitize-fs-error.js';

// The small local file that survives a dissolve (model note § Terms — "Dissolution
// receipt"): DissolutionPerformed plus enough context to say what happened and
// where the history went, once the DB it would normally live in is gone.
export interface DissolutionReceipt {
  readonly schemaVersion: number;
  readonly recordedAt: string;
  readonly event: DissolutionPerformed;
  readonly archivePath: string;
}

const SCHEMA_VERSION = 1;

// Write-temp + fsync + rename, mode 0600 (sensitive-writer parity with
// YamlConfigWriter/FsDataExporter) — durability here is invariant 7's teeth:
// the receipt must survive a crash between write and rename, not just look
// written, since StoreReset runs immediately after this returns.
export function writeDissolutionReceipt(
  receiptPath: string,
  params: { readonly event: DissolutionPerformed; readonly archivePath: string },
): Result<void> {
  const receipt: DissolutionReceipt = {
    schemaVersion: SCHEMA_VERSION,
    recordedAt: new Date().toISOString(),
    event: params.event,
    archivePath: params.archivePath,
  };
  const content = JSON.stringify(receipt);
  const tmpPath = `${receiptPath}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;

  try {
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
    if (process.platform !== 'win32') {
      fs.chmodSync(tmpPath, 0o600);
    }
    const fd = fs.openSync(tmpPath, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, receiptPath);
    return Result.ok();
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
    }
    return Result.fail(sanitizeFsError(err, '<receipt>'));
  }
}
