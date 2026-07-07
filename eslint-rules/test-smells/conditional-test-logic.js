import { isTestCall } from './_lib/test-call.js';

const CONDITIONAL_TYPES = [
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'disallow control-flow statements inside a test body (Conditional Test Logic smell)',
    },
    schema: [],
    messages: {
      conditionalTestLogic:
        "'{{ statementType }}' inside a test body adds branching a test shouldn't need — extract the variation into separate test cases instead.",
    },
  },
  create(context) {
    let depth = 0;

    const conditionalListeners = Object.fromEntries(
      CONDITIONAL_TYPES.map((statementType) => [
        statementType,
        (node) => {
          if (depth >= 1) {
            context.report({ node, messageId: 'conditionalTestLogic', data: { statementType } });
          }
        },
      ]),
    );

    return {
      CallExpression(node) {
        if (isTestCall(node)) depth++;
      },
      'CallExpression:exit'(node) {
        if (isTestCall(node)) depth--;
      },
      ...conditionalListeners,
    };
  },
};
