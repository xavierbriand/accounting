function getExpectAssertionShape(node) {
  // node is expect(receiver).matcher(...args)
  if (node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return null;
  if (callee.property.type !== 'Identifier') return null;

  const expectCall = callee.object;
  if (expectCall.type !== 'CallExpression') return null;
  if (expectCall.callee.type !== 'Identifier' || expectCall.callee.name !== 'expect') return null;
  if (expectCall.arguments.length !== 1) return null;

  return { receiver: expectCall.arguments[0], matcher: callee.property.name, args: node.arguments };
}

function getAssertionFromStatement(statement) {
  if (!statement || statement.type !== 'ExpressionStatement') return null;
  return getExpectAssertionShape(statement.expression);
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'disallow copy-pasted duplicate assertions within one test (Duplicate Assert smell)',
    },
    schema: [],
    messages: {
      duplicateAssert:
        "This assertion duplicates the immediately preceding 'expect({{ receiver }}).{{ matcher }}({{ args }})' — remove the duplicate or vary what it checks. (Re-asserting the same condition after an intervening statement — e.g. an idempotency re-check — is not this smell.)",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function signatureOf(shape) {
      const receiverText = sourceCode.getText(shape.receiver);
      const argsText = shape.args.map((arg) => sourceCode.getText(arg)).join(', ');
      return { signature: `${receiverText}::${shape.matcher}::${argsText}`, receiverText, argsText };
    }

    return {
      BlockStatement(node) {
        for (let i = 1; i < node.body.length; i++) {
          const prevShape = getAssertionFromStatement(node.body[i - 1]);
          const currShape = getAssertionFromStatement(node.body[i]);
          if (!prevShape || !currShape) continue;

          const prevSig = signatureOf(prevShape);
          const currSig = signatureOf(currShape);
          if (prevSig.signature !== currSig.signature) continue;

          context.report({
            node: node.body[i],
            messageId: 'duplicateAssert',
            data: {
              receiver: currSig.receiverText,
              matcher: currShape.matcher,
              args: currSig.argsText,
            },
          });
        }
      },
    };
  },
};
