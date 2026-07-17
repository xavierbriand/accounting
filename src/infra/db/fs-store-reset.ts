import fs from 'fs';
import { Result } from '@core/shared/result.js';
import type { StoreReset } from '@core/ports/store-reset.js';
import { sanitizeFsError } from '../fs/sanitize-fs-error.js';

interface WipeTarget {
  readonly label: string;
  readonly path: string;
}

function wipeTargets(dbPath: string): readonly WipeTarget[] {
  return [
    { label: 'backup file (.bak)', path: `${dbPath}.bak` },
    { label: 'WAL sibling (-wal)', path: `${dbPath}-wal` },
    { label: 'SHM sibling (-shm)', path: `${dbPath}-shm` },
    { label: 'database file', path: dbPath },
  ];
}

// Pure prediction of what wipe() will remove, shared with dissolve-command so
// the receipt-before-wipe ordering (invariant 7, model note) can record
// wipedStores before StoreReset actually runs — the receipt writer needs a
// value to record and wipe() hasn't executed yet at that point. Single-user
// local CLI (model note § Dissolution half risk row): no concurrent writer
// between this call and wipe()'s own re-check of the same paths moments later.
export function planWipeTargets(dbPath: string): readonly string[] {
  return wipeTargets(dbPath)
    .filter((target) => fs.existsSync(target.path))
    .map((target) => target.path);
}

export class FsStoreReset implements StoreReset {
  constructor(private readonly dbPath: string) {}

  async wipe(): Promise<Result<readonly string[]>> {
    const targets = wipeTargets(this.dbPath);
    const removed: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!fs.existsSync(target.path)) continue;
      try {
        fs.unlinkSync(target.path);
        removed.push(target.path);
      } catch (err) {
        const stillPresent = targets
          .slice(i)
          .filter((t) => fs.existsSync(t.path))
          .map((t) => t.label);
        return Result.fail(
          `wipe failed removing the ${target.label}: ${sanitizeFsError(err, '<store>')}; still present: ${stillPresent.join(', ')}`,
        );
      }
    }

    return Result.ok(removed);
  }
}
