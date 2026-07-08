// fails if: local/no-unasserted-test stops flagging tests with zero expect()/assert() calls (subsumes Empty Test)
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-unasserted-test'];
const ruleTester = createRuleTester();

ruleTester.run('no-unasserted-test', rule, {
  valid: [
    { code: "it('x', () => { expect(1).toBe(1); });" },
    { code: "it('x', () => { assert(1 === 1); });" },
    // assertion reachable through a nested callback inside the test body
    { code: "it('x', () => { rows.forEach((row) => { expect(row).toBeDefined(); }); });" },
    // fast-check property assertion via an inner expect()
    { code: "it('x', () => { fc.assert(fc.property(fc.string(), (s) => { expect(s.length).toBeGreaterThanOrEqual(0); return true; })); });" },
    // fast-check's own idiom: the property predicate's boolean RETURN VALUE
    // is the check (no inner expect() needed) — fc.assert(...) itself
    // counts as the assertion (tests/unit/core/ingest/account-names.test.ts
    // shape)
    { code: "it('x', () => { fc.assert(fc.property(fc.string({ minLength: 1 }), (id) => bankAccount(id).startsWith('Assets:Bank:'))); });" },
  ],
  invalid: [
    {
      // Empty Test — zero occurrences in the paper's study, comes free here
      code: "it('does nothing', () => {});",
      errors: [{ messageId: 'noAssertion' }],
    },
    {
      // Unknown Test — has code, but no assertion, so it always passes
      code: "it('exercises the code', () => { doSomething(); });",
      errors: [{ messageId: 'noAssertion' }],
    },
  ],
});
