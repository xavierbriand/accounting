import { isTestCall } from './_lib/test-call.js';

function isSetTimeoutCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'setTimeout'
  );
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'disallow real-timer sleeps used as a wait mechanism in tests (Sleepy Test smell)',
    },
    schema: [],
    messages: {
      sleepyTest:
        "Real-timer '{{ shape }}' makes this test slow/flaky — prefer vi.useFakeTimers(), awaiting the actual condition, or another deterministic mechanism.",
    },
  },
  create(context) {
    let testDepth = 0;

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          testDepth++;
          return;
        }
        if (testDepth === 0 || !isSetTimeoutCall(node)) return;

        const parent = node.parent;

        // Shape 1: await new Promise((resolve) => setTimeout(resolve, ms))
        if (
          parent?.type === 'ArrowFunctionExpression' &&
          parent.body === node &&
          parent.parent?.type === 'NewExpression' &&
          parent.parent.callee.type === 'Identifier' &&
          parent.parent.callee.name === 'Promise'
        ) {
          context.report({
            node,
            messageId: 'sleepyTest',
            data: { shape: 'new Promise(resolve => setTimeout(...))' },
          });
          return;
        }

        // Shape 2: bare setTimeout(...) statement, return value discarded
        if (parent?.type === 'ExpressionStatement' && parent.expression === node) {
          context.report({ node, messageId: 'sleepyTest', data: { shape: 'setTimeout(...)' } });
        }
      },
      'CallExpression:exit'(node) {
        if (isTestCall(node)) testDepth--;
      },
    };
  },
};
