// fails if: local/conditional-test-logic stops flagging control-flow statements inside an it/test body
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['conditional-test-logic'];
const ruleTester = createRuleTester();

ruleTester.run('conditional-test-logic', rule, {
  valid: [
    { code: "it('x', () => { expect(1).toBe(1); });" },
    // .forEach/.map are functional iteration, not a loop STATEMENT
    { code: "it('x', () => { rows.forEach((row) => { expect(row).toBeDefined(); }); });" },
    // Given/When/Then step-definition handlers legitimately branch on
    // Gherkin table/outline data — never scoped by isTestCall
    { code: "Given('a value of {int}', (n) => { if (n > 0) { setup(n); } else { setupZero(); } });" },
    { code: "When('the amount is {string}', (amount) => { switch (amount) { case 'zero': return zero(); default: return nonZero(amount); } });" },
    // conditional/loop statements outside any it/test body — e.g. a plain
    // top-level helper function — are out of this rule's concern
    { code: "function helper(n) { if (n > 0) { return n; } return 0; }" },
  ],
  invalid: [
    {
      code: "it('x', () => { if (cond) { expect(1).toBe(1); } });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'IfStatement' } }],
    },
    {
      code: "it('x', () => { for (let i = 0; i < 3; i++) { expect(i).toBeGreaterThanOrEqual(0); } });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'ForStatement' } }],
    },
    {
      code: "it('x', () => { while (cond) { expect(1).toBe(1); break; } });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'WhileStatement' } }],
    },
    {
      code: "it('x', () => { switch (x) { case 1: expect(1).toBe(1); break; default: expect(0).toBe(0); } });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'SwitchStatement' } }],
    },
  ],
});
