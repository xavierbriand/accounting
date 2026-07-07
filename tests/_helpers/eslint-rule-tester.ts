import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import tseslint from 'typescript-eslint';

RuleTester.describe = describe;
RuleTester.it = it;

export function createRuleTester(): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
      ecmaVersion: 2022,
    },
  });
}
