// fails if: local/assertion-roulette stops warning when a test body has an unusually high number of assertions
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['assertion-roulette'];
const ruleTester = createRuleTester();

function itWithAssertions(count: number): string {
  const body = Array.from({ length: count }, (_, i) => `expect(${i}).toBe(${i});`).join(' ');
  return `it('x', () => { ${body} });`;
}

ruleTester.run('assertion-roulette', rule, {
  valid: [
    // default threshold is 5 — exactly at threshold is still fine
    { code: itWithAssertions(5) },
    // Given/When/Then step-definition handlers are not it/test calls — never scoped
    { code: "Given('a wide precondition', () => { expect(1).toBe(1); expect(2).toBe(2); expect(3).toBe(3); expect(4).toBe(4); expect(5).toBe(5); expect(6).toBe(6); });" },
    // custom threshold via options
    { code: itWithAssertions(8), options: [{ threshold: 10 }] },
  ],
  invalid: [
    {
      code: itWithAssertions(6),
      errors: [{ messageId: 'assertionRoulette', data: { count: '6', threshold: '5' } }],
    },
    {
      code: itWithAssertions(3),
      options: [{ threshold: 2 }],
      errors: [{ messageId: 'assertionRoulette', data: { count: '3', threshold: '2' } }],
    },
  ],
});
