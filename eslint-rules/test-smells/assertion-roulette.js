import { isTestCall } from './_lib/test-call.js';

const DEFAULT_THRESHOLD = 5;

function isExpectCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'expect'
  );
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'warn when a single test has an unusually high number of assertions (Assertion Roulette smell)',
    },
    schema: [
      {
        type: 'object',
        properties: { threshold: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      assertionRoulette:
        'This test has {{ count }} assertions (threshold: {{ threshold }}) — consider splitting it so a failure points at a specific behaviour.',
    },
  },
  create(context) {
    const threshold = context.options[0]?.threshold ?? DEFAULT_THRESHOLD;
    let depth = 0;
    let expectCount = 0;
    let testNode = null;

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          depth++;
          if (depth === 1) {
            expectCount = 0;
            testNode = node;
          }
          return;
        }
        if (depth >= 1 && isExpectCall(node)) {
          expectCount++;
        }
      },
      'CallExpression:exit'(node) {
        if (!isTestCall(node)) return;
        if (depth === 1 && expectCount > threshold) {
          context.report({
            node: testNode,
            messageId: 'assertionRoulette',
            data: { count: expectCount, threshold },
          });
        }
        depth--;
      },
    };
  },
};
