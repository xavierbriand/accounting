// fails if: local/no-swallowed-exception stops flagging a try/catch used as the sole pass/fail signal in an otherwise-unasserted test
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-swallowed-exception'];
const ruleTester = createRuleTester();

ruleTester.run('no-swallowed-exception', rule, {
  valid: [
    { code: "it('x', () => { expect(1).toBe(1); });" },
    // tests/integration/infra/db/sqlite-transaction-repo.test.ts:119-131 shape:
    // the catch itself has no assertion, but the test DOES assert afterward
    // (row count post-rollback) — not the sole pass/fail signal
    {
      code: "it('x', () => { try { db.transaction(() => { throw new Error('x'); })(); } catch { /* expected */ } const entries = db.prepare('SELECT * FROM t').all(); expect(entries).toHaveLength(0); });",
    },
    // tests/unit/infra/fs/read-bpce-csv.test.ts shape: try/finally, no catch
    // clause at all — cleanup only, not an exception-handling smell
    {
      code: "it('x', () => { try { const result = readBpceCsv(filePath); expect(result.isSuccess).toBe(true); } finally { if (existsSync(filePath)) unlinkSync(filePath); } });",
    },
    // the framework's own exception-assertion API — no try/catch at all
    { code: "it('x', () => { expect(() => doThing()).toThrow(); });" },
  ],
  invalid: [
    {
      code: "it('x', () => { try { doThing(); } catch (e) { /* swallowed, nothing else checked */ } });",
      errors: [{ messageId: 'swallowedException' }],
    },
    {
      code: "it('x', () => { try { doThing(); } catch (e) { logError(e); } });",
      errors: [{ messageId: 'swallowedException' }],
    },
  ],
});
