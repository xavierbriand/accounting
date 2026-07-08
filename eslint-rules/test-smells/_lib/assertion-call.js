export function isAssertionCall(node) {
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
