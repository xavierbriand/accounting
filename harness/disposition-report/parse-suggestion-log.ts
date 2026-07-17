export type NormalizedTag = 'adopted' | 'deferred' | 'rejected' | 'acknowledged' | 'unparsed';

export type SuggestionLogRow = {
  story: string;
  phase: 'p2' | 'p4' | 'unattributed';
  tag: NormalizedTag;
  rules: readonly string[];
  finding: string;
};

const STORY_HEADING = /^#\s*(?:Epic\s+\S+,\s*)?Story\s+([A-Za-z0-9.-]+)/m;

function extractStoryId(markdown: string): string {
  const match = STORY_HEADING.exec(markdown);
  return match ? match[1] : 'unknown';
}

type HeadingEntry = { index: number; text: string };

const H2_HEADING = /^##[ \t]+(.+)$/gm;

function findH2Headings(markdown: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const pattern = new RegExp(H2_HEADING.source, H2_HEADING.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    headings.push({ index: match.index, text: match[1].trim() });
  }
  return headings;
}

// The Suggestion log section, plus any *immediately following* level-2
// sections whose heading names a Phase-4 review pass (the
// `## Phase-4 review & dispositions` dialect keeps that table in a sibling
// section rather than nesting it — attribute.ts's phase split needs both).
function extractSuggestionLogRegion(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const headings = findH2Headings(normalized);
  const startIdx = headings.findIndex((h) => /^suggestion log\b/i.test(h.text));
  if (startIdx === -1) {
    return '';
  }

  let endIdx = startIdx + 1;
  while (endIdx < headings.length && /phase[\s-]?4/i.test(headings[endIdx].text)) {
    endIdx += 1;
  }
  const regionEnd = endIdx < headings.length ? headings[endIdx].index : normalized.length;
  return normalized.slice(headings[startIdx].index, regionEnd);
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|');
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('-') && /^[\s|:-]+$/.test(trimmed);
}

type HeaderRoles = { findingIdx: number; tagIdx: number };

function indexOfHeader(header: string[], name: string): number {
  return header.findIndex((cell) => cell.trim().toLowerCase() === name);
}

function classifyHeader(header: string[]): HeaderRoles {
  const findingIdx = header.findIndex((cell) => {
    const lower = cell.trim().toLowerCase();
    return lower.startsWith('finding') || lower.startsWith('suggestion');
  });
  const tagIdx =
    indexOfHeader(header, 'tag') !== -1
      ? indexOfHeader(header, 'tag')
      : indexOfHeader(header, 'resolution') !== -1
        ? indexOfHeader(header, 'resolution')
        : indexOfHeader(header, 'disposition');
  return { findingIdx, tagIdx };
}

const TAG_PATTERNS: ReadonlyArray<{ pattern: RegExp; tag: NormalizedTag }> = [
  { pattern: /fix-now/i, tag: 'adopted' },
  { pattern: /adopt/i, tag: 'adopted' },
  { pattern: /defer/i, tag: 'deferred' },
  { pattern: /reject/i, tag: 'rejected' },
  { pattern: /acknowledge/i, tag: 'acknowledged' },
  { pattern: /no[\s-]?action/i, tag: 'acknowledged' },
  { pattern: /\bn\/a\b/i, tag: 'acknowledged' },
  { pattern: /complian/i, tag: 'acknowledged' },
];

// First tag wins (leftmost match across all patterns) — a combined cell like
// "ADOPT (partial)" or "ADOPT + DEFER" counts as adopted, per the plan's
// tag-normalization rule.
export function normalizeTag(raw: string): NormalizedTag {
  const cleaned = raw.replace(/[*_`]/g, '');
  let best: { index: number; tag: NormalizedTag } | null = null;
  for (const { pattern, tag } of TAG_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, tag };
    }
  }
  return best ? best.tag : 'unparsed';
}

function buildRow(story: string, header: HeaderRoles, cells: string[]): SuggestionLogRow {
  const finding =
    header.findingIdx >= 0 && header.findingIdx < cells.length
      ? cells[header.findingIdx]
      : cells.join(' ');
  const tagText = header.tagIdx >= 0 && header.tagIdx < cells.length ? cells[header.tagIdx] : '';
  const tag = tagText.trim().length > 0 ? normalizeTag(tagText) : 'unparsed';
  // phase/rules are populated by attribute.ts's heuristics (slice 2); this
  // parser is tag/dialect-focused and defaults both honestly rather than
  // guessing.
  return { story, phase: 'p2', tag, rules: [], finding };
}

export function parseSuggestionLog(markdown: string): SuggestionLogRow[] {
  const story = extractStoryId(markdown);
  const region = extractSuggestionLogRegion(markdown);
  if (region.length === 0) {
    return [];
  }

  const lines = region.split('\n');
  const rows: SuggestionLogRow[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!isTableRow(lines[i])) {
      i += 1;
      continue;
    }
    const header = classifyHeader(splitRow(lines[i]));
    i += 1;
    if (i < lines.length && isSeparatorRow(lines[i])) {
      i += 1;
    }
    while (i < lines.length && isTableRow(lines[i])) {
      rows.push(buildRow(story, header, splitRow(lines[i])));
      i += 1;
    }
  }
  return rows;
}
