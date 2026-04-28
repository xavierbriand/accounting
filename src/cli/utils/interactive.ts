import { select, confirm, input } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import { validateNewCategoryName } from '@core/categories/category-name.js';
export { validateNewCategoryName, RESERVED_TOKENS } from '@core/categories/category-name.js';

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
      { name: '+ Define new category…', value: '__new__' },
      { name: 'Abort', value: '__abort__' },
    ];

    while (true) {
      const answer = await select({
        message: `${description} → ${currentCategory} (auto). Confirm or change?`,
        choices,
      });

      if (answer === '__abort__') return { action: 'abort' };
      if (answer === keepLabel) return { action: 'keep' };

      if (answer === '__new__') {
        try {
          const newName = await input({
            message: 'New category name:',
            validate: (raw: string) => {
              const result = validateNewCategoryName(raw, availableCategories);
              return result.isSuccess ? true : result.error;
            },
          });
          return { action: 'change', category: newName.trim() };
        } catch (err) {
          if (err instanceof ExitPromptError) {
            continue;
          }
          throw err;
        }
      }

      return { action: 'change', category: answer };
    }
  },

  async confirmBatch(count) {
    return confirm({
      message: `Commit these ${count} transactions?`,
      default: false,
    });
  },
};
