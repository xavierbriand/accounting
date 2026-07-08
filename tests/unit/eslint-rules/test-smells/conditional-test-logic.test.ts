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

    // Pattern A: fc.property precondition skip (story-maint-25) — bare
    // no-else if whose sole statement is `return;`/`return true;`
    {
      code: "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => { if (n < 0) return true; return f(n) >= 0; })); });",
    },
    {
      code: "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => { if (n < 0) return; expect(f(n)).toBeGreaterThanOrEqual(0); })); });",
    },
    // Pattern A: fc.*.filter() precondition skip — sole statement `return false;`
    {
      code: "it('x', () => { fc.assert(fc.property(fc.string().filter((s) => { if (s.length === 0) return false; return true; }), (s) => { expect(s.length).toBeGreaterThan(0); })); });",
    },
    // Pattern B: top-level Result-narrowing guard, ident re-dereferenced later
    {
      code: "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => { const result = f(n); if (result.isFailure) return true; return result.value >= 0; })); });",
    },
    {
      code: "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => { const result = f(n); if (!result.isSuccess) return false; return result.value >= 0; })); });",
    },
    // Pattern C: cleanup-guard directly inside a finally block
    {
      code: "it('x', () => { try { expect(readFile(p)).toBe('x'); } finally { if (existsSync(p)) unlinkSync(p); } });",
    },
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
    // Rejected lookalike (tests/integration/infra/csv/node-csv-parser.test.ts:260 shape):
    // compound `||` condition — not a single-identifier narrowing guard
    {
      code: "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => { const result = f(n); if (!result.isSuccess || result.value.length !== 1) return false; return true; })); });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'IfStatement' } }],
    },
    // Rejected lookalike (safe-transfer-calculator.test.ts:293 shape): the
    // narrowing guard is nested inside a for-of, not a top-level statement
    {
      code: "it('x', () => { fc.assert(fc.property(fc.array(fc.integer()), (arr) => { for (const n of arr) { const result = f(n); if (result.isFailure) return false; } return true; })); });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'ForOfStatement' } }, { messageId: 'conditionalTestLogic', data: { statementType: 'IfStatement' } }],
    },
    // Rejected lookalike (sqlite-transaction-repo.test.ts:372 shape): a
    // side effect before the return disqualifies it as a pure guard
    {
      code: "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => { const result = f(n); if (result.isFailure) { cleanup(); return false; } return result.value >= 0; })); });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'IfStatement' } }],
    },
    // A genuine if/else inside an fc.property callback is not a bare skip
    {
      code: "it('x', () => { fc.assert(fc.property(fc.boolean(), (flag) => { if (flag) { return f(flag) === 1; } else { return f(flag) === 0; } })); });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'IfStatement' } }],
    },
    // A conditional in a try block (not the finally) is not a cleanup-guard
    {
      code: "it('x', () => { try { if (cond) { expect(1).toBe(1); } } finally { cleanup(); } });",
      errors: [{ messageId: 'conditionalTestLogic', data: { statementType: 'IfStatement' } }],
    },
  ],
});
