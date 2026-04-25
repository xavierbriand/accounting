import fs from 'fs';
import path from 'path';
import { Result } from '@core/shared/result.js';

export function validateDbPath(rawPath: string): Result<string> {
  const resolved = path.resolve(rawPath);
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      return Result.fail(
        `refusing to open dbPath: ${rawPath} is a symbolic link. ` +
        `Point --db-path at a regular file or let one be created fresh.`,
      );
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      return Result.fail(`failed to stat dbPath '${rawPath}': ${String(err)}`);
    }
    // ENOENT is acceptable — getDb will create the file.
  }
  return Result.ok(resolved);
}
