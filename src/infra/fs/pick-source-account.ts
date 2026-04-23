import path from 'path';
import type { AccountConfig } from '@core/config/app-config.js';
import { Result } from '@core/shared/result.js';

export function pickSourceAccount(
  filePath: string,
  accounts: readonly AccountConfig[],
): Result<AccountConfig> {
  const base = path.basename(filePath);

  const matches = accounts.filter((a) => base.startsWith(a.filenamePrefix));

  if (matches.length === 0) {
    return Result.fail(
      `no account configured for this filename — ` +
        `add an entry to \`accounts:\` in accounting.yaml (file: ${base})`,
    );
  }

  const maxLen = Math.max(...matches.map((a) => a.filenamePrefix.length));
  const longestMatches = matches.filter((a) => a.filenamePrefix.length === maxLen);

  if (longestMatches.length > 1) {
    return Result.fail(
      `ambiguous filename — multiple account prefixes match (file: ${base})`,
    );
  }

  return Result.ok(longestMatches[0]);
}
