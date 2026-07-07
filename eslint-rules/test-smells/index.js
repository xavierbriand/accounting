import noIgnoredTest from './no-ignored-test.js';
import noRedundantPrint from './no-redundant-print.js';
import noRedundantAssertion from './no-redundant-assertion.js';

export default {
  rules: {
    'no-ignored-test': noIgnoredTest,
    'no-redundant-print': noRedundantPrint,
    'no-redundant-assertion': noRedundantAssertion,
  },
};
