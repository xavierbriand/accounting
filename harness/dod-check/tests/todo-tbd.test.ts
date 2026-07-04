import { describe, it, expect } from 'vitest';
import { scanTodoComments, scanPrBodyTbd, type SourceFile } from '../lib/todo-tbd.js';

describe('scanTodoComments', () => {
  // fails if: a TODO comment is missed — guards Scenario B's core invariant
  // ("the TODO is reported with its file and line").
  it('reports a TODO comment with its file and line number', () => {
    const files: SourceFile[] = [
      {
        path: 'src/core/shared/money.ts',
        content: 'export function add(a: number, b: number): number {\n  // TODO: handle overflow\n  return a + b;\n}\n',
      },
    ];
    const findings = scanTodoComments(files);
    expect(findings).toContainEqual({
      kind: 'todo-comment',
      file: 'src/core/shared/money.ts',
      line: 2,
    });
  });

  it('finds multiple TODOs across multiple files, each with its own line', () => {
    const files: SourceFile[] = [
      { path: 'a.ts', content: 'const x = 1;\n// TODO fix this\n' },
      { path: 'b.ts', content: '// TODO another\nconst y = 2;\n// TODO yet another\n' },
    ];
    const findings = scanTodoComments(files);
    expect(findings).toEqual([
      { kind: 'todo-comment', file: 'a.ts', line: 2 },
      { kind: 'todo-comment', file: 'b.ts', line: 1 },
      { kind: 'todo-comment', file: 'b.ts', line: 3 },
    ]);
  });

  it('reports nothing for files with no TODO marker', () => {
    const files: SourceFile[] = [{ path: 'clean.ts', content: 'const z = 3;\n' }];
    expect(scanTodoComments(files)).toEqual([]);
  });

  // fails if: a word merely containing "TODO" as a substring (e.g. a
  // variable "todoList") is falsely flagged — guards against noisy
  // over-reporting the plan doesn't ask for.
  it('does not flag "TODO" as a substring of a longer identifier', () => {
    const files: SourceFile[] = [{ path: 'x.ts', content: 'const todoListLength = 3;\n' }];
    expect(scanTodoComments(files)).toEqual([]);
  });

  // fails if: a markdown bold-emphasis marker ("**TODO / TBD**", prose
  // discussing the scanner itself) is mistaken for a code-comment
  // continuation marker ("* TODO: ..." inside a /* */ block) — guards a
  // real self-referential false positive discovered when dod-check scanned
  // its own README.
  it('does not flag "TODO" following a markdown bold-emphasis marker', () => {
    const files: SourceFile[] = [
      { path: 'README.md', content: '- **TODO / TBD** — describes the scanner, not an open item.\n' },
    ];
    expect(scanTodoComments(files)).toEqual([]);
  });

  // fails if: a genuine JSDoc-style block-comment continuation line
  // ("   * TODO: ...") is missed once the bold-marker false positive above
  // is excluded — guards that the fix didn't overcorrect.
  it('still flags a genuine block-comment continuation TODO ("   * TODO: ...")', () => {
    const files: SourceFile[] = [
      { path: 'x.ts', content: '/**\n * TODO: revisit this helper\n */\n' },
    ];
    expect(scanTodoComments(files)).toEqual([{ kind: 'todo-comment', file: 'x.ts', line: 2 }]);
  });
});

describe('scanPrBodyTbd', () => {
  // fails if: a TBD left in an earlier PR-template section is missed —
  // guards Scenario B's "TBD in section 2" invariant.
  it('reports pr-tbd when TBD appears in a body section other than section 10', () => {
    const body = [
      '## 1. Story',
      '',
      'some story text',
      '',
      '## 2. Intent',
      '',
      'TBD',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] lint/build/test green',
    ].join('\n');
    const findings = scanPrBodyTbd(body);
    expect(findings).toEqual([{ kind: 'pr-tbd', section: '2. Intent' }]);
  });

  // fails if: a checklist placeholder inside section 10 is a false
  // positive — guards Scenario B's explicit false-positive exclusion.
  it('does not flag TBD-looking text inside the section-10 merge checklist', () => {
    const body = [
      '## 1. Story',
      '',
      'filled in',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] lint / build / test green on CI',
      '- [ ] User approval TBD until ticked',
    ].join('\n');
    expect(scanPrBodyTbd(body)).toEqual([]);
  });

  it('reports nothing when no section carries a TBD marker', () => {
    const body = ['## 1. Story', '', 'filled in', '', '## 2. Intent', '', 'also filled in'].join('\n');
    expect(scanPrBodyTbd(body)).toEqual([]);
  });

  it('reports every offending section, not just the first', () => {
    const body = [
      '## 1. Story',
      '',
      'TBD',
      '',
      '## 2. Intent',
      '',
      'TBD',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] TBD placeholder ignored',
    ].join('\n');
    expect(scanPrBodyTbd(body)).toEqual([
      { kind: 'pr-tbd', section: '1. Story' },
      { kind: 'pr-tbd', section: '2. Intent' },
    ]);
  });

  // fails if: an inline mention of "TBD" in ordinary prose (e.g. a PR body
  // describing this very TBD scanner) is flagged as an unfilled section —
  // guards against self-referential false positives (this PR's own body
  // discusses "TBD" as a concept in sections 2/5 without leaving a
  // placeholder).
  it('does not flag a PR body with an inline mention of "TBD" in section 2 (not a placeholder)', () => {
    const body = [
      '## 1. Story',
      '',
      'filled in',
      '',
      '## 2. Intent',
      '',
      'This story adds a scanner that detects TBD placeholders left in PR bodies.',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] lint / build / test green on CI',
    ].join('\n');
    expect(scanPrBodyTbd(body)).toEqual([]);
  });

  // fails if: a standalone TBD placeholder wrapped in markdown emphasis or
  // backticks (e.g. "**TBD**", "`TBD`") is missed — guards the placeholder
  // form actually used in the PR template.
  it('reports pr-tbd for a standalone TBD placeholder wrapped in markdown emphasis', () => {
    const body = ['## 1. Story', '', '**TBD**', '', '## 10. Merge checklist', '', '- [ ] done'].join(
      '\n',
    );
    expect(scanPrBodyTbd(body)).toEqual([{ kind: 'pr-tbd', section: '1. Story' }]);
  });

  // fails if: the widened TBD_PLACEHOLDER_LINE regex misses a standalone
  // "Pending..." placeholder — guards the #152 regression (§ 8/§ 9 shipped
  // as a permanent "_Pending Phase 3/5_" line).
  it('reports pr-tbd for a standalone "Pending Phase 3/5" placeholder wrapped in emphasis', () => {
    const body = [
      '## 8. Sonnet learnings',
      '',
      '_Pending Phase 3/5_',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] done',
    ].join('\n');
    expect(scanPrBodyTbd(body)).toEqual([{ kind: 'pr-tbd', section: '8. Sonnet learnings' }]);
  });

  // fails if: the full-line anchor is dropped and mid-sentence prose
  // containing "pending" is falsely flagged — guards against the widened
  // regex over-triggering on ordinary English.
  it('does not flag mid-sentence prose containing "pending"', () => {
    const body = [
      '## 4. Selected solution',
      '',
      'The design is pending review.',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] done',
    ].join('\n');
    expect(scanPrBodyTbd(body)).toEqual([]);
  });
});
