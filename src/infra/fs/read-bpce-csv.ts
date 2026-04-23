import fs from 'fs';
import path from 'path';
import { Result } from '@core/shared/result.js';

export function readBpceCsv(filePath: string): Result<string> {
  const base = path.basename(filePath);
  try {
    const content = fs.readFileSync(filePath, 'latin1');
    return Result.ok(content);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return Result.fail(`File not found: ${base}`);
    }
    if (code === 'EACCES') {
      return Result.fail(`Permission denied reading file: ${base}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return Result.fail(`Could not read file ${base}: ${msg}`);
  }
}
