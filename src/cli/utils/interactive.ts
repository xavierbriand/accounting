import { select, confirm, input } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import { validateNewCategoryName } from '@core/categories/category-name.js';
export { validateNewCategoryName, RESERVED_TOKENS } from '@core/categories/category-name.js';

export type SelectCategoryResult =
  | { action: 'keep' }
  | { action: 'change'; category: string }
  | { action: 'abort' };

export type RememberRuleResult =
  | { action: 'skip' }
  | { action: 'remember'; pattern: string };

export interface InteractivePrompter {
  selectCategory(
    description: string,
    currentCategory: string,
    availableCategories: readonly string[],
  ): Promise<SelectCategoryResult>;

  confirmBatch(count: number): Promise<boolean>;

  confirmRememberRule(
    description: string,
    suggestedPattern: string | null,
    category: string,
  ): Promise<RememberRuleResult>;

  confirmDissolution(summary: string): Promise<boolean>;
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

  async confirmRememberRule(description, suggestedPattern, category) {
    const choices =
      suggestedPattern !== null
        ? [
            { name: `[y] yes, append /${suggestedPattern}/i → ${category} to accounting.yaml`, value: '__remember__' },
            { name: '[e] edit the regex first', value: '__edit__' },
            { name: '[n] no, just use it for this transaction', value: '__skip__' },
          ]
        : [
            { name: '[e] enter a pattern manually', value: '__edit__' },
            { name: '[n] no, just use it for this transaction', value: '__skip__' },
          ];

    const message =
      suggestedPattern !== null
        ? `Always tag descriptions matching /${suggestedPattern}/i as ${category}?`
        : `No pattern suggestion for this description. Remember as a rule?`;

    while (true) {
      const answer = await select({ message, choices });

      if (answer === '__skip__') return { action: 'skip' };
      if (answer === '__remember__') return { action: 'remember', pattern: suggestedPattern as string };

      // answer === '__edit__'
      try {
        const edited = await input({
          message: 'Enter a regex pattern (no /…/ delimiters; /i flag is applied automatically):',
          validate: (raw: string) => {
            const trimmed = raw.trim();
            if (trimmed.length === 0) return 'Pattern cannot be empty';
            if (trimmed.length > 200) return 'Pattern must be 200 characters or fewer';
            try {
              const compiled = new RegExp(trimmed, 'i');
              if (!compiled.test(description)) return 'Pattern does not match the current description';
            } catch {
              return 'Invalid regex: the pattern does not compile';
            }
            return true;
          },
        });
        return { action: 'remember', pattern: edited.trim() };
      } catch (err) {
        if (err instanceof ExitPromptError) {
          continue;
        }
        throw err;
      }
    }
  },

  // Exact case-sensitive match on the typed phrase — a destructive-action gate,
  // not a fuzzy confirm. Anything other than "DISSOLVE" (including ESC/ctrl-c,
  // which input() surfaces as a resolved empty-ish value or a rejection) is a
  // decline; dissolve-command treats a rejection here as "prompt unavailable"
  // (NEEDS_REVIEW), distinct from a completed prompt that simply answered no.
  async confirmDissolution(summary) {
    const answer = await input({
      message: `${summary}\nType DISSOLVE to confirm (anything else cancels):`,
    });
    return answer.trim() === 'DISSOLVE';
  },
};
