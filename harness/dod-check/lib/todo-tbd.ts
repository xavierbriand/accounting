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

export type MergeChecklistFinding = {
  kind: 'merge-checklist-unticked';
  uncheckedCount: number;
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

type SectionHeading = { number: string; title: string; start: number };

function parseSectionHeadings(body: string): SectionHeading[] {
  const headings: SectionHeading[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(SECTION_HEADING.source, 'gm');
  while ((match = pattern.exec(body)) !== null) {
    headings.push({ number: match[1], title: match[2].trim(), start: match.index + match[0].length });
  }
  return headings;
}

export function extractSectionRegion(body: string, sectionNumber: string): string | null {
  const headings = parseSectionHeadings(body);
  const index = headings.findIndex((heading) => heading.number === sectionNumber);
  if (index === -1) {
    return null;
  }
  const heading = headings[index];
  const end = index + 1 < headings.length ? headings[index + 1].start : body.length;
  return body.slice(heading.start, end);
}

export function scanPrBodyTbd(body: string): PrTbdFinding[] {
  const headings = parseSectionHeadings(body);

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

const CHECKLIST_ROW = /^\s*[-*] \[ \]\s*(.*)$/gm;
const MERGE_CHECKLIST_EXCLUDED_ROW = /out of draft|user approval/i;

export function scanMergeChecklist(body: string): MergeChecklistFinding[] {
  const region = extractSectionRegion(body, MERGE_CHECKLIST_SECTION_NUMBER);
  if (region === null) {
    return [];
  }
  const pattern = new RegExp(CHECKLIST_ROW.source, 'gm');
  let uncheckedCount = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(region)) !== null) {
    if (!MERGE_CHECKLIST_EXCLUDED_ROW.test(match[1])) {
      uncheckedCount++;
    }
  }
  return uncheckedCount > 0 ? [{ kind: 'merge-checklist-unticked', uncheckedCount }] : [];
}
