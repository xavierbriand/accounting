import noIgnoredTest from './no-ignored-test.js';
import noRedundantPrint from './no-redundant-print.js';
import noRedundantAssertion from './no-redundant-assertion.js';
import assertionRoulette from './assertion-roulette.js';
import noSleepyTest from './no-sleepy-test.js';

export default {
  rules: {
    'no-ignored-test': noIgnoredTest,
    'no-redundant-print': noRedundantPrint,
    'no-redundant-assertion': noRedundantAssertion,
    'assertion-roulette': assertionRoulette,
    'no-sleepy-test': noSleepyTest,
  },
};
