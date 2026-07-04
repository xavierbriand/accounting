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

export type ClaudeStaleTagFinding = {
  kind: 'claude-stale-tag';
  tag: string;
  file: string;
};

export type ClaudeRangeFinding = {
  kind: 'claude-range';
  range: string;
  file: string;
};

export type MissingRoleFinding = {
  kind: 'missing-role';
  file: string;
  detail: string;
};

export type RoleToolsViolationFinding = {
  kind: 'role-tools-violation';
  file: string;
  tool: string;
};

export type UnlistedControlFinding = {
  kind: 'unlisted-control';
  file: string;
};

export type DriftFinding =
  | RetroOnlyFinding
  | TableOnlyFinding
  | MissingPathFinding
  | ClaudeStaleTagFinding
  | ClaudeRangeFinding
  | MissingRoleFinding
  | RoleToolsViolationFinding
  | UnlistedControlFinding;

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

const RANGE_PATTERN = /\bR\d+(?:\.\.|–|—|-|…)R\d+\b/g;

export function extractEnumeratedRuleRanges(content: string): string[] {
  const ranges: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(RANGE_PATTERN.source, 'g');
  while ((match = pattern.exec(content)) !== null) {
    ranges.push(match[0]);
  }
  return ranges;
}

const HOLE_MARKER_SUFFIX = /\s*(?:\*\(hole\)\*|_\(hole\)_|\(hole\))/i;

export function extractClaudeTagRefs(content: string): Set<string> {
  const holeTags = new Set<string>();
  const holePattern = new RegExp(`(\\bR\\d+\\b)${HOLE_MARKER_SUFFIX.source}`, 'gi');
  let holeMatch: RegExpExecArray | null;
  while ((holeMatch = holePattern.exec(content)) !== null) {
    holeTags.add(holeMatch[1]);
  }

  const tags = new Set<string>();
  const allTagPattern = new RegExp(R_TAG_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = allTagPattern.exec(content)) !== null) {
    const tag = match[0];
    if (!holeTags.has(tag)) {
      tags.add(tag);
    }
  }
  return tags;
}

export function composeClaudeDrift(
  tagRefs: Set<string>,
  sectionEightTags: Set<string>,
): Set<string> {
  const staleTags = new Set<string>();
  for (const tag of tagRefs) {
    if (!sectionEightTags.has(tag)) {
      staleTags.add(tag);
    }
  }
  return staleTags;
}

export type AgentSpecEntry = {
  file: string;
  role: string | undefined;
  tools: string[];
};

const VALID_ROLES: ReadonlySet<string> = new Set(['doer', 'judge', 'advisor']);
const MUTATION_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

export function checkAgentSpecRoles(entries: AgentSpecEntry[]): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const entry of entries) {
    if (entry.role === undefined) {
      findings.push({ kind: 'missing-role', file: entry.file, detail: 'absent' });
    } else if (!VALID_ROLES.has(entry.role)) {
      findings.push({ kind: 'missing-role', file: entry.file, detail: `invalid: ${entry.role}` });
    }

    if (entry.role !== 'doer') {
      for (const tool of entry.tools) {
        if (MUTATION_TOOLS.has(tool)) {
          findings.push({ kind: 'role-tools-violation', file: entry.file, tool });
        }
      }
    }
  }
  return findings;
}

export function checkControlCompleteness(
  files: string[],
  inventoryPaths: Set<string>,
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const file of files) {
    if (!inventoryPaths.has(file)) {
      findings.push({ kind: 'unlisted-control', file });
    }
  }
  return findings;
}

const INVENTORY_PATH_PATTERN = /`(\.claude\/(?:agents|commands)\/[^`\s]+\.md)`/g;

export function extractInventoryControlPaths(inventoryContent: string): Set<string> {
  const paths = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(INVENTORY_PATH_PATTERN.source, 'g');
  while ((match = pattern.exec(inventoryContent)) !== null) {
    paths.add(match[1]);
  }
  return paths;
}

export function formatJsonReport(findings: DriftFinding[]): string {
  return JSON.stringify({ findings });
}
