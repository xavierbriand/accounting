const SELF_COMPARISON_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);
const CALL_LIKE_TYPES = new Set([
  'CallExpression',
  'NewExpression',
  'AwaitExpression',
  'TaggedTemplateExpression',
]);

// Same source text on both sides of a comparison is only a tautology when
// neither side could produce a different value on repeated evaluation.
// expect(hash(x)).toBe(hash(x)) is a legitimate determinism check (hash(x)
// could genuinely differ between calls) — not the same as expect(x).toBe(x).
function containsCallLikeExpression(node, visitorKeys) {
  if (!node || typeof node.type !== 'string') return false;
  if (CALL_LIKE_TYPES.has(node.type)) return true;
  const keys = visitorKeys[node.type] || [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && containsCallLikeExpression(item, visitorKeys)) return true;
      }
    } else if (child && containsCallLikeExpression(child, visitorKeys)) {
      return true;
    }
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow tautological self-comparison assertions (Redundant Assertion smell)',
    },
    schema: [],
    messages: {
      redundantAssertion:
        "'expect({{ text }}).{{ matcher }}({{ text }})' always passes — this is a tautology, not a real assertion.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const visitorKeys = sourceCode.visitorKeys;
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.property.type !== 'Identifier') return;
        const matcherName = callee.property.name;
        if (!SELF_COMPARISON_MATCHERS.has(matcherName)) return;

        const expectCall = callee.object;
        if (expectCall.type !== 'CallExpression') return;
        if (expectCall.callee.type !== 'Identifier' || expectCall.callee.name !== 'expect') return;
        if (expectCall.arguments.length !== 1) return;
        if (node.arguments.length !== 1) return;

        const receiver = expectCall.arguments[0];
        const matcherArg = node.arguments[0];
        const receiverText = sourceCode.getText(receiver);
        const matcherArgText = sourceCode.getText(matcherArg);

        if (receiverText !== matcherArgText) return;
        if (
          containsCallLikeExpression(receiver, visitorKeys) ||
          containsCallLikeExpression(matcherArg, visitorKeys)
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'redundantAssertion',
          data: { text: receiverText, matcher: matcherName },
        });
      },
    };
  },
};
