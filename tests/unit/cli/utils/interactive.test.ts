import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { validateNewCategoryName, inquirerPrompter, RESERVED_TOKENS } from '../../../../src/cli/utils/interactive.js';

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
    const existingCategories = ['Groceries', 'Transport'];

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => {
          const trimmed = s.trim();
          if (trimmed.length === 0) return false;
          if (trimmed.length > 64) return false;
          if (/[:/\\]/.test(trimmed)) return false;
          if (RESERVED_TOKENS.includes(trimmed.toLowerCase())) return false;
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

// ---- confirmRememberRule tests ----
// Gherkin scenarios 4-7:
// - offers y/e/n with suggested pattern (Gherkin 4)
// - shows e/n (no [y]) when suggestedPattern is null (Gherkin 5)
// - edit branch validates compile-and-match (Gherkin 6)
// - [n] returns skip (Gherkin 7)
// - ESC at the edit input re-shows the y/e/n menu (Gherkin 8)

import type { RememberRuleResult } from '../../../../src/cli/utils/interactive.js';

describe('inquirerPrompter.confirmRememberRule — y/e/n with suggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails if confirmRememberRule is not exported from interactive.ts', () => {
    // Type-level check: the function must exist on the prompter
    expect(typeof inquirerPrompter.confirmRememberRule).toBe('function');
  });

  it('[y] returns { action: remember, pattern: suggestedPattern }', async () => {
    // Gherkin 4: [y] returns { action: 'remember', pattern: 'courtage' }
    const { select } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    mockSelect.mockResolvedValueOnce('__remember__');

    const result = await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    expect(result).toEqual({ action: 'remember', pattern: 'courtage' } satisfies RememberRuleResult);
    expect(mockSelect).toHaveBeenCalledOnce();
    // Verify the menu shows 3 labelled choices (y/e/n)
    const callArg = mockSelect.mock.calls[0][0] as unknown as { choices: Array<{ name: string; value: string }> };
    const values = callArg.choices.map((c) => c.value);
    expect(values).toContain('__remember__');
    expect(values).toContain('__edit__');
    expect(values).toContain('__skip__');
  });

  it('[n] returns { action: skip }', async () => {
    // Gherkin 7: [n] returns { action: 'skip' }
    const { select } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    mockSelect.mockResolvedValueOnce('__skip__');

    const result = await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    expect(result).toEqual({ action: 'skip' } satisfies RememberRuleResult);
  });

  it('[e] opens input and returns { action: remember, pattern: edited } on valid input', async () => {
    // Gherkin 6: user picks [e], submits "altima" which matches description
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__edit__');
    mockInput.mockResolvedValueOnce('altima');

    const result = await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    expect(mockInput).toHaveBeenCalledOnce();
    expect(result).toEqual({ action: 'remember', pattern: 'altima' } satisfies RememberRuleResult);
  });

  it('[e] validate rejects empty/whitespace pattern', async () => {
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__edit__');
    // Capture the validate function and test it directly
    let capturedValidate: ((v: string) => Promise<string | boolean> | string | boolean) | undefined;
    mockInput.mockImplementationOnce(async (opts: { validate?: (v: string) => Promise<string | boolean> | string | boolean }) => {
      capturedValidate = opts.validate;
      return 'altima';
    });

    await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    expect(capturedValidate!('  ')).toBe('Pattern cannot be empty');
  });

  it('[e] validate rejects pattern over 200 chars (ReDoS guard)', async () => {
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__edit__');
    let capturedValidate: ((v: string) => Promise<string | boolean> | string | boolean) | undefined;
    mockInput.mockImplementationOnce(async (opts: { validate?: (v: string) => Promise<string | boolean> | string | boolean }) => {
      capturedValidate = opts.validate;
      return 'altima';
    });

    await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    expect(capturedValidate!('a'.repeat(201))).toBe('Pattern must be 200 characters or fewer');
  });

  it('[e] validate rejects invalid regex', async () => {
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__edit__');
    let capturedValidate: ((v: string) => Promise<string | boolean> | string | boolean) | undefined;
    mockInput.mockImplementationOnce(async (opts: { validate?: (v: string) => Promise<string | boolean> | string | boolean }) => {
      capturedValidate = opts.validate;
      return 'altima';
    });

    await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    // Invalid regex: unmatched bracket
    expect(capturedValidate!('[invalid')).toContain('Invalid regex');
  });

  it('[e] validate rejects pattern that does not match description (Gherkin 6: altimar ≠ ALTIMA COURTAGE)', async () => {
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__edit__');
    let capturedValidate: ((v: string) => Promise<string | boolean> | string | boolean) | undefined;
    mockInput.mockImplementationOnce(async (opts: { validate?: (v: string) => Promise<string | boolean> | string | boolean }) => {
      capturedValidate = opts.validate;
      return 'altima';
    });

    await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    // "altimar" does not match "ALTIMA COURTAGE" (no trailing 'r')
    expect(capturedValidate!('altimar')).toBe('Pattern does not match the current description');
    // "altima" matches
    expect(capturedValidate!('altima')).toBe(true);
  });

  it('ESC at input re-shows the y/e/n select (Gherkin 8)', async () => {
    const { ExitPromptError } = await import('@inquirer/core');
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    // First loop: user picks edit, then ESC; second loop: user picks skip
    mockSelect
      .mockResolvedValueOnce('__edit__')
      .mockResolvedValueOnce('__skip__');

    mockInput.mockRejectedValueOnce(new ExitPromptError());

    const result = await inquirerPrompter.confirmRememberRule('ALTIMA COURTAGE', 'courtage', 'AutoInsurance');

    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ action: 'skip' } satisfies RememberRuleResult);
  });
});

describe('inquirerPrompter.confirmRememberRule — null suggestion (e/n only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows two-option menu (e/n) when suggestedPattern is null', async () => {
    // Gherkin 5: two-option select when suggestion is null
    const { select } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    mockSelect.mockResolvedValueOnce('__skip__');

    await inquirerPrompter.confirmRememberRule('CB 12345', null, 'SomeCategory');

    expect(mockSelect).toHaveBeenCalledOnce();
    const callArg = mockSelect.mock.calls[0][0] as unknown as { choices: Array<{ name: string; value: string }> };
    const values = callArg.choices.map((c) => c.value);
    // Only e and n — no __remember__
    expect(values).not.toContain('__remember__');
    expect(values).toContain('__edit__');
    expect(values).toContain('__skip__');
  });

  it('[n] when null suggestion returns { action: skip }', async () => {
    const { select } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    mockSelect.mockResolvedValueOnce('__skip__');

    const result = await inquirerPrompter.confirmRememberRule('CB 12345', null, 'SomeCategory');
    expect(result).toEqual({ action: 'skip' } satisfies RememberRuleResult);
  });

  it('[e] when null suggestion opens input and returns remembered pattern', async () => {
    const { select, input } = await import('@inquirer/prompts');
    const mockSelect = vi.mocked(select);
    const mockInput = vi.mocked(input);

    mockSelect.mockResolvedValueOnce('__edit__');
    mockInput.mockResolvedValueOnce('mypattern');

    const result = await inquirerPrompter.confirmRememberRule('CB 12345 mypattern', null, 'SomeCategory');
    expect(result).toEqual({ action: 'remember', pattern: 'mypattern' } satisfies RememberRuleResult);
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
    // The Gherkin scenario requires the menu to re-display with the SAME currentCategory
    // and availableCategories. Choices are computed once outside the while loop
    // (interactive.ts:56–63) and reused — assert the args match across invocations.
    expect(mockSelect.mock.calls[1]).toEqual(mockSelect.mock.calls[0]);
    expect(result).toEqual({ action: 'keep' });
  });
});

// ---- confirmDissolution: typed-phrase gate (story-4.5c) ----
// fails if: typing exactly "DISSOLVE" does not return true, anything else does not
//           return false (a fuzzy match would weaken a destructive-action gate), or
//           the summary text passed in is not surfaced in the prompt message.

describe('inquirerPrompter.confirmDissolution — typed DISSOLVE gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails if confirmDissolution is not exported from interactive.ts', () => {
    expect(typeof inquirerPrompter.confirmDissolution).toBe('function');
  });

  it('returns true when the user types exactly "DISSOLVE"', async () => {
    const { input } = await import('@inquirer/prompts');
    const mockInput = vi.mocked(input);
    mockInput.mockResolvedValueOnce('DISSOLVE');

    const result = await inquirerPrompter.confirmDissolution('Erases: the ledger. Preserves: accounting.yaml.');

    expect(result).toBe(true);
  });

  it('returns false for anything other than "DISSOLVE" (typed refusal)', async () => {
    const { input } = await import('@inquirer/prompts');
    const mockInput = vi.mocked(input);
    mockInput.mockResolvedValueOnce('no thanks');

    const result = await inquirerPrompter.confirmDissolution('Erases: the ledger.');

    expect(result).toBe(false);
  });

  it('returns false for a lowercase "dissolve" (case-sensitive gate)', async () => {
    const { input } = await import('@inquirer/prompts');
    const mockInput = vi.mocked(input);
    mockInput.mockResolvedValueOnce('dissolve');

    const result = await inquirerPrompter.confirmDissolution('Erases: the ledger.');

    expect(result).toBe(false);
  });

  it('surfaces the caller-provided summary in the prompt message', async () => {
    const { input } = await import('@inquirer/prompts');
    const mockInput = vi.mocked(input);
    mockInput.mockResolvedValueOnce('DISSOLVE');

    await inquirerPrompter.confirmDissolution('Erases: the ledger. Preserves: accounting.yaml.');

    const callArg = mockInput.mock.calls[0][0] as unknown as { message: string };
    expect(callArg.message).toContain('Erases: the ledger. Preserves: accounting.yaml.');
  });
});
