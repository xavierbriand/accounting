import { isTestCall } from './_lib/test-call.js';
import { isAssertionCall } from './_lib/assertion-call.js';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow tests with no assertions anywhere in their body (Unknown Test / Empty Test smell)',
    },
    schema: [],
    messages: {
      noAssertion:
        'This test has no expect()/assert() call anywhere in its body — it will pass even if it verifies nothing.',
    },
  },
  create(context) {
    let depth = 0;
    let sawAssertion = false;
    let testNode = null;

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          depth++;
          if (depth === 1) {
            sawAssertion = false;
            testNode = node;
          }
          return;
        }
        if (depth >= 1 && isAssertionCall(node)) {
          sawAssertion = true;
        }
      },
      'CallExpression:exit'(node) {
        if (!isTestCall(node)) return;
        if (depth === 1 && !sawAssertion) {
          context.report({ node: testNode, messageId: 'noAssertion' });
        }
        depth--;
      },
    };
  },
};
