// fails if: local/no-mystery-guest-db stops flagging real better-sqlite3 imports in Core unit tests
import testSmells from '../../../../eslint-rules/test-smells/index.js';
import { createRuleTester } from '../../../_helpers/eslint-rule-tester.js';

const rule = testSmells.rules['no-mystery-guest-db'];
const ruleTester = createRuleTester();

ruleTester.run('no-mystery-guest-db', rule, {
  valid: [
    { code: "it('x', () => { expect(1).toBe(1); });" },
    // Core-purity self-test convention: reads its own sibling .ts source as
    // TEXT to check it doesn't import forbidden modules — the string only
    // ever appears inside a regex-pattern literal, never a real import.
    {
      code: "const pattern = /from ['\"]better-sqlite3['\"]/; it('no file imports better-sqlite3', () => { expect(pattern.test(source)).toBe(false); });",
    },
    // a plain string mention (e.g. in an error message fixture) is not an import either
    { code: "it('x', () => { expect(errorMessage).toContain('better-sqlite3'); });" },
  ],
  invalid: [
    {
      code: "import Database from 'better-sqlite3';\nit('x', () => { expect(1).toBe(1); });",
      errors: [{ messageId: 'mysteryGuestDb' }],
    },
    {
      code: "const Database = require('better-sqlite3');\nit('x', () => { expect(1).toBe(1); });",
      errors: [{ messageId: 'mysteryGuestDb' }],
    },
  ],
});
