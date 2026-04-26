import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { validateNewCategoryName, inquirerPrompter } from '../../../../src/cli/utils/interactive.js';

// Mock @inquirer/prompts at module level so we can control select/input behaviour
vi.mock('@inquirer/prompts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inquirer/prompts')>();
  return {
    ...original,
    select: vi.fn(),
    input: vi.fn(),
    confirm: vi.fn(),
  };
});

// fails if: validateNewCategoryName accepts empty/whitespace names (guards rule 1),
//           accepts names over 64 chars (guards rule 2),
//           accepts names with path-separator chars (guards rule 3 — the gate
//             against account-path corruption in Expense:AutoInsurance),
//           accepts reserved tokens (guards rule 4 — prevents Expense:Expense),
//           accepts case-variant duplicates (guards rule 5 + canonical-name suggestion)

describe('validateNewCategoryName — rule 1: empty / whitespace-only', () => {
  it('rejects empty string', () => {
    const result = validateNewCategoryName('', []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Category name cannot be empty');
  });

  it('rejects whitespace-only string', () => {
    const result = validateNewCategoryName('   ', []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Category name cannot be empty');
  });

  it('rejects tab-only string', () => {
    const result = validateNewCategoryName('\t', []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Category name cannot be empty');
  });
});

describe('validateNewCategoryName — rule 2: length > 64', () => {
  it('rejects name longer than 64 chars', () => {
    const longName = 'A'.repeat(65);
    const result = validateNewCategoryName(longName, []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('Category name must be 64 characters or fewer');
  });

  it('accepts name exactly 64 chars', () => {
    const name64 = 'A'.repeat(64);
    const result = validateNewCategoryName(name64, []);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe(name64);
  });

  it('trims before checking length — name that trims to 64 should pass', () => {
    const name64 = 'A'.repeat(64);
    const result = validateNewCategoryName('  ' + name64 + '  ', []);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe(name64);
  });
});

describe('validateNewCategoryName — rule 3: path-separator characters', () => {
  it("rejects name containing ':'", () => {
    const result = validateNewCategoryName('Expense:Groceries', []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain(':');
    expect(result.error).toContain('/');
    expect(result.error).toContain('\\');
  });

  it("rejects name containing '/'", () => {
    const result = validateNewCategoryName('Travel/Hotels', []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain(':');
    expect(result.error).toContain('/');
    expect(result.error).toContain('\\');
  });

  it("rejects name containing '\\'", () => {
    const result = validateNewCategoryName('Travel\\Hotels', []);
    expect(result.isFailure).toBe(true);
    expect(result.error).toContain(':');
    expect(result.error).toContain('/');
    expect(result.error).toContain('\\');
  });
});

describe('validateNewCategoryName — rule 4: reserved tokens (case-insensitive, whole-string)', () => {
  const reserved = ['Uncategorized', 'Asset', 'Income', 'Expense', 'Liability'];

  for (const token of reserved) {
    it(`rejects exact token '${token}'`, () => {
      const result = validateNewCategoryName(token, []);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(`'${token}' is reserved`);
    });

    it(`rejects lowercase variant '${token.toLowerCase()}'`, () => {
      const lower = token.toLowerCase();
      const result = validateNewCategoryName(lower, []);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(`'${lower}' is reserved`);
    });

    it(`rejects UPPERCASE variant '${token.toUpperCase()}'`, () => {
      const upper = token.toUpperCase();
      const result = validateNewCategoryName(upper, []);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(`'${upper}' is reserved`);
    });
  }

  it("permits 'uncategorizedExpenses' — partial match does not trigger rule 4", () => {
    const result = validateNewCategoryName('uncategorizedExpenses', []);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe('uncategorizedExpenses');
  });

  it("permits 'MyExpenses' — partial match does not trigger rule 4", () => {
    const result = validateNewCategoryName('MyExpenses', []);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe('MyExpenses');
  });
});

describe('validateNewCategoryName — rule 5: case-insensitive duplicate detection', () => {
  it('rejects case-exact duplicate', () => {
    const result = validateNewCategoryName('Groceries', ['Groceries']);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe("Already exists as 'Groceries'");
  });

  it('rejects case-variant duplicate and suggests canonical name', () => {
    const result = validateNewCategoryName('groceries', ['Groceries']);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe("Already exists as 'Groceries'");
  });

  it('rejects UPPERCASE variant and suggests canonical name', () => {
    const result = validateNewCategoryName('GROCERIES', ['Groceries']);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe("Already exists as 'Groceries'");
  });

  it('suggests the canonical-cased name from existing list', () => {
    const result = validateNewCategoryName('auto insurance', ['Auto Insurance']);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe("Already exists as 'Auto Insurance'");
  });
});

describe('validateNewCategoryName — happy path', () => {
  it('returns trimmed name on success', () => {
    const result = validateNewCategoryName('  AutoInsurance  ', ['Groceries', 'Uncategorized']);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe('AutoInsurance');
  });

  it('accepts a single-word name with empty existing list', () => {
    const result = validateNewCategoryName('AutoInsurance', []);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe('AutoInsurance');
  });

  it('accepts a name with spaces (not a reserved token)', () => {
    const result = validateNewCategoryName('Car Insurance', []);
    expect(result.isSuccess).toBe(true);
    expect(result.value).toBe('Car Insurance');
  });
});

describe('validateNewCategoryName — property test', () => {
  it('names without forbidden chars and not reserved/duplicated always validate after trim', () => {
    const reservedTokens = ['uncategorized', 'asset', 'income', 'expense', 'liability'];
    const existingCategories = ['Groceries', 'Transport'];

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => {
          const trimmed = s.trim();
          if (trimmed.length === 0) return false;
          if (trimmed.length > 64) return false;
          if (/[:/\\]/.test(trimmed)) return false;
          if (reservedTokens.includes(trimmed.toLowerCase())) return false;
          const lowerExisting = existingCategories.map((e) => e.toLowerCase());
          if (lowerExisting.includes(trimmed.toLowerCase())) return false;
          return true;
        }),
        (name) => {
          const result = validateNewCategoryName(name, existingCategories);
          expect(result.isSuccess).toBe(true);
          expect(result.value).toBe(name.trim());
        },
      ),
    );
  });
});

// ---- selectCategory: + Define new category… branch and ESC re-show ----
// fails if: '+ Define new category…' choice is not offered (user can't define a new category),
//           input() is not called when '__new__' is selected (no prompt shown),
//           ExitPromptError from input() does not re-show the menu (ESC aborts ingest),
//           the returned action.category is not the trimmed name (wrong value propagated)

describe('inquirerPrompter.selectCategory — define-new branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers + Define new category… as a choice', async () => {
    const { select } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    // Return a non-new-category value to avoid triggering input
    mockSelect.mockResolvedValueOnce('Keep: Uncategorized');

    await inquirerPrompter.selectCategory('PAYPAL', 'Uncategorized', ['Groceries']);

    expect(mockSelect).toHaveBeenCalledOnce();
    const callArg = mockSelect.mock.calls[0][0] as unknown as { choices: Array<{ name: string; value: string }> };
    const choiceNames = callArg.choices.map((c) => c.name);
    expect(choiceNames).toContain('+ Define new category…');
  });

  it('calls input() when __new__ is chosen and returns { action: change, category: trimmed-name }', async () => {
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__new__');
    mockInput.mockResolvedValueOnce('AutoInsurance');

    const result = await inquirerPrompter.selectCategory('PAYPAL', 'Uncategorized', ['Groceries']);

    expect(mockInput).toHaveBeenCalledOnce();
    expect(result).toEqual({ action: 'change', category: 'AutoInsurance' });
  });

  it('re-shows select when ExitPromptError is thrown by input()', async () => {
    const { ExitPromptError } = await import('@inquirer/core');
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    // First loop: user picks + Define new category…, then ESC in input
    // Second loop: user picks Keep
    mockSelect
      .mockResolvedValueOnce('__new__')
      .mockResolvedValueOnce('Keep: Uncategorized');

    mockInput.mockRejectedValueOnce(new ExitPromptError());

    const result = await inquirerPrompter.selectCategory('PAYPAL', 'Uncategorized', ['Groceries']);

    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ action: 'keep' });
  });
});
