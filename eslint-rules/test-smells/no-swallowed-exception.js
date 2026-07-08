import { isTestCall } from './_lib/test-call.js';
import { isAssertionCall } from './_lib/assertion-call.js';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'flag a try/catch used as the sole pass/fail mechanism in a test with no other assertions (Exception Handling smell)',
    },
    schema: [],
    messages: {
      swallowedException:
        "This try/catch is the only pass/fail signal in a test with no expect()/assert() calls anywhere — use the framework's exception-assertion API (e.g. expect(() => ...).toThrow() / .rejects.toThrow()) instead of relying on whether an exception was thrown.",
    },
  },
  create(context) {
    let depth = 0;
    let assertionCount = 0;
    let candidateTryStatements = [];

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          depth++;
          if (depth === 1) {
            assertionCount = 0;
            candidateTryStatements = [];
          }
          return;
        }
        if (depth >= 1 && isAssertionCall(node)) {
          assertionCount++;
        }
      },
      'CallExpression:exit'(node) {
        if (!isTestCall(node)) return;
        if (depth === 1 && assertionCount === 0) {
          for (const tryNode of candidateTryStatements) {
            context.report({ node: tryNode, messageId: 'swallowedException' });
          }
        }
        depth--;
      },
      TryStatement(node) {
        if (depth === 0) return;
        if (!node.handler) return; // try/finally only, no catch clause — cleanup, not this smell
        candidateTryStatements.push(node);
      },
    };
  },
};
