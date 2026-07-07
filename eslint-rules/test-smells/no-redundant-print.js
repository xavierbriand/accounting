const CONSOLE_METHODS = new Set(['log', 'debug', 'info', 'warn', 'error']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow console output left in test code (Redundant Print smell)',
    },
    schema: [],
    messages: {
      redundantPrint:
        "Remove 'console.{{ method }}(...)' — tests run with little/no human observation; leftover console output is a Redundant Print smell.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'console' &&
          callee.property.type === 'Identifier' &&
          CONSOLE_METHODS.has(callee.property.name)
        ) {
          context.report({
            node: callee,
            messageId: 'redundantPrint',
            data: { method: callee.property.name },
          });
        }
      },
    };
  },
};
