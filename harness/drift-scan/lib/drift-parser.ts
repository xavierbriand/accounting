export type RetroOnlyFinding = {
  kind: 'retro-only';
  tag: string;
  file: string;
};

export type TableOnlyFinding = {
  kind: 'table-only';
  tag: string;
  file: string;
};

export type MissingPathFinding = {
  kind: 'missing-path';
  path: string;
  file: string;
};

export type DriftFinding = RetroOnlyFinding | TableOnlyFinding | MissingPathFinding;

export type ComposeDriftResult = {
  retroOnly: Set<string>;
  tableOnly: Set<string>;
};

const R_TAG_PATTERN = /\bR\d+\b/g;

export function extractSectionEightTags(claudeMd: string): Set<string> {
  const sectionStart = claudeMd.indexOf('\n## 8. Rule provenance');
  if (sectionStart === -1) {
    return new Set();
  }
  const afterHeading = sectionStart + 1;
  const nextSection = claudeMd.indexOf('\n## ', afterHeading + 10);
  const region =
    nextSection === -1 ? claudeMd.slice(afterHeading) : claudeMd.slice(afterHeading, nextSection);

  const tableRowPattern = /^\|\s*(R\d+)\s*\|/gm;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = tableRowPattern.exec(region)) !== null) {
    tags.add(match[1]);
  }
  return tags;
}

const PENDING_MARKER_SUFFIX = /\s*(?:\*\(pending\)\*|_\(pending\)_|\(pending\))/i;

export function extractRetroTags(retroContent: string): Set<string> {
  const pendingTags = new Set<string>();
  const pendingPattern = new RegExp(
    `(\\bR\\d+\\b)${PENDING_MARKER_SUFFIX.source}`,
    'gi',
  );
  let pendingMatch: RegExpExecArray | null;
  while ((pendingMatch = pendingPattern.exec(retroContent)) !== null) {
    pendingTags.add(pendingMatch[1]);
  }

  const tags = new Set<string>();
  const allTagPattern = new RegExp(R_TAG_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = allTagPattern.exec(retroContent)) !== null) {
    const tag = match[0];
    if (!pendingTags.has(tag)) {
      tags.add(tag);
    }
  }
  return tags;
}

export function composeDrift(
  sectionEightTags: Set<string>,
  retroTags: Set<string>,
): ComposeDriftResult {
  const retroOnly = new Set<string>();
  const tableOnly = new Set<string>();

  for (const tag of retroTags) {
    if (!sectionEightTags.has(tag)) {
      retroOnly.add(tag);
    }
  }
  for (const tag of sectionEightTags) {
    if (!retroTags.has(tag)) {
      tableOnly.add(tag);
    }
  }
  return { retroOnly, tableOnly };
}

export function extractPlanSurfacePaths(planContent: string): string[] {
  const headingPattern = /^## Production-code surface(\s|$|\()/m;
  const headingMatch = headingPattern.exec(planContent);
  if (!headingMatch) {
    return [];
  }
  const regionStart = headingMatch.index + headingMatch[0].length;
  const nextSection = planContent.indexOf('\n## ', regionStart);
  const region =
    nextSection === -1 ? planContent.slice(regionStart) : planContent.slice(regionStart, nextSection);

  const pathPattern = /`((?:src|tests|harness)\/[^`\s.][^`]*\.(?:ts|sql))`/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(region)) !== null) {
    const path = match[1];
    const afterPath = region.slice(match.index + match[0].length, match.index + match[0].length + 30);
    if (/\*\(removed\)\*/.test(afterPath)) {
      continue;
    }
    const renamedMatch = /\*\(renamed → ([^)]+)\)\*/.exec(afterPath);
    if (renamedMatch) {
      paths.push(renamedMatch[1].trim());
    } else {
      paths.push(path);
    }
  }
  return paths;
}

export function formatJsonReport(findings: DriftFinding[]): string {
  return JSON.stringify({ findings });
}
