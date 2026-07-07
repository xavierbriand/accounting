const TEST_CALLEE_NAMES = new Set(['it', 'test']);

// Recognizes it(...), it.only(...), it.skip(...), it.each([...])(...),
// it.skipIf(cond)(...), test.concurrent.each([...])(...), and similar
// chained/curried shapes — anything ultimately rooted at an `it`/`test`
// identifier. Deliberately does NOT match Given/When/Then (quickpickle BDD
// step definitions), so rules scoped by this helper never need to exclude
// tests/features/steps/** by glob.
function isTestCallee(node) {
  if (node.type === 'Identifier') {
    return TEST_CALLEE_NAMES.has(node.name);
  }
  if (node.type === 'MemberExpression') {
    return isTestCallee(node.object);
  }
  if (node.type === 'CallExpression') {
    return isTestCallee(node.callee);
  }
  return false;
}

export function isTestCall(node) {
  return node.type === 'CallExpression' && isTestCallee(node.callee);
}
