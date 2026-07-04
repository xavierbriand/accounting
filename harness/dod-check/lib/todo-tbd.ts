export type SourceFile = {
  path: string;
  content: string;
};

export type TodoCommentFinding = {
  kind: 'todo-comment';
  file: string;
  line: number;
};

export type PrTbdFinding = {
  kind: 'pr-tbd';
  section: string;
};

const TODO_COMMENT_MARKER = /(?:\/\/|\/\*|^\s*\*|#)\s*TODO\b/;

export function scanTodoComments(files: SourceFile[]): TodoCommentFinding[] {
  const findings: TodoCommentFinding[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    lines.forEach((line, index) => {
      if (TODO_COMMENT_MARKER.test(line)) {
        findings.push({ kind: 'todo-comment', file: file.path, line: index + 1 });
      }
    });
  }
  return findings;
}

const SECTION_HEADING = /^## (\d+)\. (.+)$/gm;
const TBD_PLACEHOLDER_LINE = /^\s*[*_`]*(?:TBD|Pending(?:\b[^\n]*)?)[*_`]*\s*$/im;
const MERGE_CHECKLIST_SECTION_NUMBER = '10';

export function scanPrBodyTbd(body: string): PrTbdFinding[] {
  const headings: Array<{ number: string; title: string; start: number }> = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(SECTION_HEADING.source, 'gm');
  while ((match = pattern.exec(body)) !== null) {
    headings.push({ number: match[1], title: match[2].trim(), start: match.index + match[0].length });
  }

  const findings: PrTbdFinding[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (heading.number === MERGE_CHECKLIST_SECTION_NUMBER) {
      continue;
    }
    const end = i + 1 < headings.length ? headings[i + 1].start : body.length;
    const region = body.slice(heading.start, end);
    if (TBD_PLACEHOLDER_LINE.test(region)) {
      findings.push({ kind: 'pr-tbd', section: `${heading.number}. ${heading.title}` });
    }
  }
  return findings;
}
