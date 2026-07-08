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

function isFcNamespaceObject(node) {
  return node.type === 'Identifier' && node.name === 'fc';
}

function isFcPropertyCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    isFcNamespaceObject(node.callee.object) &&
    node.callee.property.type === 'Identifier' &&
    (node.callee.property.name === 'property' || node.callee.property.name === 'asyncProperty')
  );
}

// Does `node` trace back, through a chain of member/call expressions, to
// an `fc.<factory>(...)` call (e.g. fc.string(...).filter(...))?
function rootsAtFcFactoryCall(node) {
  let current = node;
  while (current) {
    if (current.type === 'CallExpression') {
      if (current.callee.type === 'MemberExpression' && isFcNamespaceObject(current.callee.object)) {
        return true;
      }
      current = current.callee.type === 'MemberExpression' ? current.callee.object : null;
    } else if (current.type === 'MemberExpression') {
      current = current.object;
    } else {
      return false;
    }
  }
  return false;
}

function isFcFilterCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'filter' &&
    rootsAtFcFactoryCall(node.callee.object)
  );
}

function isFunctionNode(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

// Walk up from `node` to the nearest enclosing function, then check
// whether that function is passed directly to fc.property/asyncProperty
// (property-skip idiom) or to a .filter(...) chained off an fc.* factory
// call (filter-skip idiom).
function findEnclosingFcCallbackKind(node) {
  let current = node.parent;
  while (current) {
    if (isFunctionNode(current)) {
      const parent = current.parent;
      if (parent && parent.type === 'CallExpression' && parent.arguments.includes(current)) {
        if (isFcPropertyCall(parent)) return 'property';
        if (isFcFilterCall(parent)) return 'filter';
      }
      return null;
    }
    current = current.parent;
  }
  return null;
}

function getSoleReturnStatement(consequent) {
  if (consequent.type === 'ReturnStatement') return consequent;
  if (
    consequent.type === 'BlockStatement' &&
    consequent.body.length === 1 &&
    consequent.body[0].type === 'ReturnStatement'
  ) {
    return consequent.body[0];
  }
  return null;
}

function returnsBareOrLiteral(returnStmt, literalValue) {
  if (!returnStmt.argument) return literalValue === undefined;
  return returnStmt.argument.type === 'Literal' && returnStmt.argument.value === literalValue;
}

// Pattern A: fc.property/asyncProperty precondition skip, or an
// fc.*.filter() precondition — a bare if/no-else whose sole consequent
// statement is `return;`/`return true;` (property-skip) or
// `return false;` (filter-skip).
function isFcPreconditionSkip(node) {
  if (node.type !== 'IfStatement' || node.alternate) return false;
  const returnStmt = getSoleReturnStatement(node.consequent);
  if (!returnStmt) return false;

  const kind = findEnclosingFcCallbackKind(node);
  if (kind === 'property') {
    return returnsBareOrLiteral(returnStmt, undefined) || returnsBareOrLiteral(returnStmt, true);
  }
  if (kind === 'filter') {
    return returnsBareOrLiteral(returnStmt, false);
  }
  return false;
}

function extractNarrowingIdentifier(test) {
  if (
    test.type === 'MemberExpression' &&
    test.object.type === 'Identifier' &&
    test.property.type === 'Identifier' &&
    test.property.name === 'isFailure'
  ) {
    return test.object.name;
  }
  if (test.type === 'UnaryExpression' && test.operator === '!') {
    const arg = test.argument;
    if (
      arg.type === 'MemberExpression' &&
      arg.object.type === 'Identifier' &&
      arg.property.type === 'Identifier' &&
      arg.property.name === 'isSuccess'
    ) {
      return arg.object.name;
    }
    if (arg.type === 'Identifier') return arg.name;
  }
  return null;
}

function containsIdentifierReference(node, name, visitorKeys) {
  if (!node || typeof node.type !== 'string') return false;
  if (node.type === 'Identifier' && node.name === name) return true;
  const keys = visitorKeys[node.type] || [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && containsIdentifierReference(item, name, visitorKeys)) return true;
      }
    } else if (child && containsIdentifierReference(child, name, visitorKeys)) {
      return true;
    }
  }
  return false;
}

// Pattern B: a top-level Result/nullable narrowing guard — a direct
// statement of an fc.property callback's own block (not nested in
// further control flow), testing exactly `<ident>.isFailure` /
// `!<ident>.isSuccess` / `!<ident>`, whose sole consequent is a bare
// `return;`/`return false;` with no side effects, where `<ident>` is
// referenced again later in the same block (confirming it's a narrowing
// guard ahead of a `.value` access, not a free-standing assertion).
function isTopLevelResultNarrowingGuard(node, visitorKeys) {
  if (node.type !== 'IfStatement' || node.alternate) return false;
  if (findEnclosingFcCallbackKind(node) !== 'property') return false;

  const block = node.parent;
  if (!block || block.type !== 'BlockStatement' || !isFunctionNode(block.parent)) return false;

  const returnStmt = getSoleReturnStatement(node.consequent);
  if (!returnStmt) return false;
  if (!returnsBareOrLiteral(returnStmt, undefined) && !returnsBareOrLiteral(returnStmt, false)) return false;

  const ident = extractNarrowingIdentifier(node.test);
  if (!ident) return false;

  const laterStatements = block.body.slice(block.body.indexOf(node) + 1);
  return laterStatements.some((stmt) => containsIdentifierReference(stmt, ident, visitorKeys));
}

// Pattern C: a control-flow statement that is a direct statement of a
// try/finally's finalizer block — resource cleanup, not test logic.
function isDirectlyInsideFinallyBlock(node) {
  const block = node.parent;
  if (!block || block.type !== 'BlockStatement') return false;
  return block.parent?.type === 'TryStatement' && block.parent.finalizer === block;
}

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
    const visitorKeys = (context.sourceCode ?? context.getSourceCode()).visitorKeys;
    let depth = 0;

    function isExcluded(node, statementType) {
      if (isDirectlyInsideFinallyBlock(node)) return true;
      if (statementType !== 'IfStatement') return false;
      return isFcPreconditionSkip(node) || isTopLevelResultNarrowingGuard(node, visitorKeys);
    }

    const conditionalListeners = Object.fromEntries(
      CONDITIONAL_TYPES.map((statementType) => [
        statementType,
        (node) => {
          if (depth >= 1 && !isExcluded(node, statementType)) {
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
