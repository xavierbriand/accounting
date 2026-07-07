// fails if: local/no-ignored-test stops flagging .skip/.todo/x-prefixed test suppression left in committed test code
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-ignored-test'];
const ruleTester = createRuleTester();

ruleTester.run('no-ignored-test', rule, {
  valid: [
    { code: "it('adds two numbers', () => { expect(1 + 1).toBe(2); });" },
    { code: "test('adds two numbers', () => { expect(1 + 1).toBe(2); });" },
    // it.skipIf is a conditional, justified runtime skip — not the Ignored Test smell
    { code: "it.skipIf(process.platform === 'win32')('platform-specific', () => { expect(1).toBe(1); });" },
    { code: "it.runIf(process.env.CI)('ci-only', () => { expect(1).toBe(1); });" },
    { code: "it.each([1, 2])('handles %i', (n) => { expect(n).toBeGreaterThan(0); });" },
  ],
  invalid: [
    {
      code: "it.skip('not ready yet', () => { expect(1).toBe(1); });",
      errors: [{ messageId: 'ignoredTest' }],
    },
    {
      code: "test.skip('not ready yet', () => { expect(1).toBe(1); });",
      errors: [{ messageId: 'ignoredTest' }],
    },
    {
      code: "describe.skip('a suite', () => { it('x', () => { expect(1).toBe(1); }); });",
      errors: [{ messageId: 'ignoredTest' }],
    },
    {
      code: "it.todo('write this test later');",
      errors: [{ messageId: 'ignoredTest' }],
    },
    {
      code: "xit('legacy suppression', () => { expect(1).toBe(1); });",
      errors: [{ messageId: 'ignoredTest' }],
    },
    {
      code: "xdescribe('legacy suppression', () => { it('x', () => { expect(1).toBe(1); }); });",
      errors: [{ messageId: 'ignoredTest' }],
    },
  ],
});
