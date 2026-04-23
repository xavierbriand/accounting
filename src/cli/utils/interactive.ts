import { select, confirm } from '@inquirer/prompts';

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
      message: `Commit these ${count} transactions? (nothing will be written yet — Story 2.5 adds DB writes)`,
      default: false,
    });
  },
};
