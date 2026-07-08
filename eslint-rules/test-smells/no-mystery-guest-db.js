const TARGET_MODULE = 'better-sqlite3';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow importing a real DB driver in a Core unit test (Mystery Guest smell)',
    },
    schema: [],
    messages: {
      mysteryGuestDb:
        "Core unit tests must not open a real '{{ moduleName }}' connection — mock the Port instead (see 'mock all Ports for Core' in docs/engineering-standards.md).",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === TARGET_MODULE) {
          context.report({ node, messageId: 'mysteryGuestDb', data: { moduleName: TARGET_MODULE } });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal' &&
          node.arguments[0].value === TARGET_MODULE
        ) {
          context.report({ node, messageId: 'mysteryGuestDb', data: { moduleName: TARGET_MODULE } });
        }
      },
    };
  },
};
