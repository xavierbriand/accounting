// fails if: local/no-redundant-assertion stops flagging tautological self-comparison assertions
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-redundant-assertion'];
const ruleTester = createRuleTester();

ruleTester.run('no-redundant-assertion', rule, {
  valid: [
    // real assertion of a real value against a different literal — must not be flagged
    { code: "it('x', () => { expect(reversal.entries[0].amount.amount).toBe(2000); });" },
    { code: "it('x', () => { expect(result.isSuccess).toBe(true); });" },
    { code: "it('x', () => { expect(a).toEqual(b); });" },
    // determinism/idempotence check — calling a function twice can genuinely
    // differ (e.g. a non-deterministic hash), so this is not a tautology
    { code: "it('x', () => { expect(nodeHashFn(canonical)).toBe(nodeHashFn(canonical)); });" },
  ],
  invalid: [
    {
      code: "it('x', () => { expect(true).toBe(true); });",
      errors: [{ messageId: 'redundantAssertion' }],
    },
    {
      code: "it('x', () => { expect(2000).toBe(2000); });",
      errors: [{ messageId: 'redundantAssertion' }],
    },
    {
      code: "it('x', () => { expect(value).toEqual(value); });",
      errors: [{ messageId: 'redundantAssertion' }],
    },
    {
      code: "it('x', () => { expect(value).toStrictEqual(value); });",
      errors: [{ messageId: 'redundantAssertion' }],
    },
  ],
});
