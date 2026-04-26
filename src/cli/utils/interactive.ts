import { select, confirm } from '@inquirer/prompts';
import { Result } from '@core/shared/result.js';

const RESERVED_TOKENS = ['uncategorized', 'asset', 'income', 'expense', 'liability'];

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

export type SelectCategoryResult =
  | { action: 'keep' }
  | { action: 'change'; category: string }
  | { action: 'abort' };

export interface InteractivePrompter {
  selectCategory(
    description: string,
    currentCategory: string,
    availableCategories: readonly string[],
  ): Promise<SelectCategoryResult>;

  confirmBatch(count: number): Promise<boolean>;
}

export const inquirerPrompter: InteractivePrompter = {
  async selectCategory(description, currentCategory, availableCategories) {
    const keepLabel = `Keep: ${currentCategory}`;
    const choices = [
      { name: keepLabel, value: keepLabel },
      ...availableCategories
        .filter((c) => c !== currentCategory)
        .map((c) => ({ name: `Change to: ${c}`, value: c })),
      { name: 'Abort', value: '__abort__' },
    ];

    const answer = await select({
      message: `${description} → ${currentCategory} (auto). Confirm or change?`,
      choices,
    });

    if (answer === '__abort__') return { action: 'abort' };
    if (answer === keepLabel) return { action: 'keep' };
    return { action: 'change', category: answer };
  },

  async confirmBatch(count) {
    return confirm({
      message: `Commit these ${count} transactions?`,
      default: false,
    });
  },
};
