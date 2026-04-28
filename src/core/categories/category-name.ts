import { Result } from '@core/shared/result.js';

export const RESERVED_TOKENS: readonly string[] = ['uncategorized', 'asset', 'income', 'expense', 'liability'];

export function validateNewCategoryName(
  raw: string,
  existing: readonly string[],
): Result<string, string> {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return Result.fail('Category name cannot be empty');
  }

  if (trimmed.length > 64) {
    return Result.fail('Category name must be 64 characters or fewer');
  }

  if (/[:/\\]/.test(trimmed)) {
    return Result.fail("Category name cannot contain ':', '/' or '\\'");
  }

  if (RESERVED_TOKENS.includes(trimmed.toLowerCase())) {
    return Result.fail(`'${trimmed}' is reserved`);
  }

  const lowerTrimmed = trimmed.toLowerCase();
  const match = existing.find((e) => e.toLowerCase() === lowerTrimmed);
  if (match !== undefined) {
    return Result.fail(`Already exists as '${match}'`);
  }

  return Result.ok(trimmed);
}
