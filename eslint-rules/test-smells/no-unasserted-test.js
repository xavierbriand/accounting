import { isTestCall } from './_lib/test-call.js';

function isAssertionCall(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return callee.name === 'expect' || callee.name === 'assert';
  }
  // fc.assert(fc.property(...)) — fast-check's own assertion idiom; the
  // property predicate's return value is the check, not an inner expect().
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name === 'assert';
  }
  return false;
}

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
