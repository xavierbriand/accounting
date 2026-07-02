import * as fs from 'node:fs';
import * as path from 'node:path';

export type PathValidationResult =
  | { ok: true; resolved: string }
  | { ok: false; error: string };

export function validateInputPath(rawPath: string): PathValidationResult {
  const resolved = path.resolve(rawPath);
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      return {
        ok: false,
        error: `refusing to read ${rawPath}: resolved path is a symbolic link.`,
      };
    }
    if (!stat.isFile()) {
      return { ok: false, error: `refusing to read ${rawPath}: not a regular file.` };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { ok: false, error: `failed to stat ${rawPath}: ${code ?? String(err)}` };
  }
  return { ok: true, resolved };
}
