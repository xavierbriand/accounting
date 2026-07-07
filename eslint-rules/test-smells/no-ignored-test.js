const SUPPRESSING_OBJECTS = new Set(['it', 'test', 'describe']);
const SUPPRESSING_PROPERTIES = new Set(['skip', 'todo']);
const SUPPRESSING_IDENTIFIERS = new Set(['xit', 'xdescribe', 'xtest']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow committed .skip/.todo/x-prefixed test suppression (Ignored Test smell)',
    },
    schema: [],
    messages: {
      ignoredTest:
        "Test suppressed via '{{ suppression }}' — remove the skip/todo or delete the test; don't leave suppressed tests committed. (Conditional skips like `.skipIf(...)` are fine.)",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && SUPPRESSING_IDENTIFIERS.has(callee.name)) {
          context.report({ node: callee, messageId: 'ignoredTest', data: { suppression: callee.name } });
          return;
        }
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          SUPPRESSING_OBJECTS.has(callee.object.name) &&
          callee.property.type === 'Identifier' &&
          SUPPRESSING_PROPERTIES.has(callee.property.name)
        ) {
          context.report({
            node: callee,
            messageId: 'ignoredTest',
            data: { suppression: `${callee.object.name}.${callee.property.name}` },
          });
        }
      },
    };
  },
};
