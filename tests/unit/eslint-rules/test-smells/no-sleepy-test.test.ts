// fails if: local/no-sleepy-test stops warning on real-timer sleeps used as a wait mechanism in tests
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-sleepy-test'];
const ruleTester = createRuleTester();

ruleTester.run('no-sleepy-test', rule, {
  valid: [
    { code: "it('x', () => { expect(1).toBe(1); });" },
    // fake timers — not a real-timer wait
    { code: "it('x', () => { vi.useFakeTimers(); doThing(); vi.advanceTimersByTime(10); expect(1).toBe(1); });" },
    // setTimeout used outside any test body — out of scope
    { code: "setTimeout(() => { doThing(); }, 10);" },
  ],
  invalid: [
    {
      // the real, confirmed baseline hit: tests/integration/infra/db/node-sqlite-snapshot-service.test.ts:203
      code: "it('mtime advances', async () => { await new Promise((resolve) => setTimeout(resolve, 10)); expect(1).toBe(1); });",
      errors: [{ messageId: 'sleepyTest' }],
    },
    {
      code: "it('x', () => { setTimeout(() => { doThing(); }, 10); expect(1).toBe(1); });",
      errors: [{ messageId: 'sleepyTest' }],
    },
  ],
});
