// fails if: local/no-redundant-print stops flagging console.* calls left in test code
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-redundant-print'];
const ruleTester = createRuleTester();

ruleTester.run('no-redundant-print', rule, {
  valid: [
    { code: "it('adds two numbers', () => { expect(1 + 1).toBe(2); });" },
    // console as a spy/mock target (property access / argument), not a call — must not be flagged
    { code: "it('logs once', () => { vi.spyOn(console, 'log'); doThing(); expect(console.log).toHaveBeenCalledOnce(); });" },
  ],
  invalid: [
    {
      code: "it('debugs', () => { console.log('debugging'); expect(1).toBe(1); });",
      errors: [{ messageId: 'redundantPrint', data: { method: 'log' } }],
    },
    {
      code: "it('debugs', () => { console.debug('x'); expect(1).toBe(1); });",
      errors: [{ messageId: 'redundantPrint', data: { method: 'debug' } }],
    },
    {
      code: "it('debugs', () => { console.warn('x'); expect(1).toBe(1); });",
      errors: [{ messageId: 'redundantPrint', data: { method: 'warn' } }],
    },
  ],
});
