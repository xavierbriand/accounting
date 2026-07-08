// fails if: local/duplicate-assert stops flagging directly-adjacent copy-pasted duplicate assertions
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['duplicate-assert'];
const ruleTester = createRuleTester();

ruleTester.run('duplicate-assert', rule, {
  valid: [
    { code: "it('x', () => { expect(a).toBe(1); expect(b).toBe(2); });" },
    // different receivers with the same literal argument — not a duplicate
    {
      code: "it('x', () => { expect(reversal.entries[0].amount.amount).toBe(2000); expect(original.entries[0].amount.amount).toBe(2000); });",
    },
    // same receiver, different matcher — not a duplicate
    { code: "it('x', () => { expect(a).toBe(1); expect(a).toBeGreaterThan(0); });" },
    // duplicates across two separate tests — not adjacent statements
    {
      code: "it('a', () => { expect(x).toBe(1); }); it('b', () => { expect(x).toBe(1); });",
    },
    // idempotency re-check with a mutating call between the two identical
    // assertions (tests/integration/infra/db/migration-006.test.ts:59-66
    // shape) — the intervening call means this is not a copy-paste duplicate
    {
      code: "it('x', () => { runMigrations(db); expect(db.pragma('user_version', { simple: true })).toBe(6); runMigrations(db); expect(db.pragma('user_version', { simple: true })).toBe(6); });",
    },
  ],
  invalid: [
    {
      code: "it('x', () => { expect(a).toBe(1); expect(a).toBe(1); });",
      errors: [{ messageId: 'duplicateAssert' }],
    },
    {
      code: "it('x', () => { expect(reversal.entries[0].amount.amount).toBe(2000); expect(reversal.entries[0].amount.amount).toBe(2000); });",
      errors: [{ messageId: 'duplicateAssert' }],
    },
  ],
});
