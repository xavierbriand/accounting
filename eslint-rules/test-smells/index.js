import noIgnoredTest from './no-ignored-test.js';
import noRedundantPrint from './no-redundant-print.js';
import noRedundantAssertion from './no-redundant-assertion.js';
import assertionRoulette from './assertion-roulette.js';
import noSleepyTest from './no-sleepy-test.js';
import noMysteryGuestDb from './no-mystery-guest-db.js';
import duplicateAssert from './duplicate-assert.js';
import conditionalTestLogic from './conditional-test-logic.js';

export default {
  rules: {
    'no-ignored-test': noIgnoredTest,
    'no-redundant-print': noRedundantPrint,
    'no-redundant-assertion': noRedundantAssertion,
    'assertion-roulette': assertionRoulette,
    'no-sleepy-test': noSleepyTest,
    'no-mystery-guest-db': noMysteryGuestDb,
    'duplicate-assert': duplicateAssert,
    'conditional-test-logic': conditionalTestLogic,
  },
};
