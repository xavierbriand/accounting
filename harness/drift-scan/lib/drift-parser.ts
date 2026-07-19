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

export type MissingSpecVersionFinding = {
  kind: 'missing-spec-version';
  file: string;
};

export type PendingUnstampedFinding = {
  kind: 'pending-unstamped';
  file: string;
  markerKind: 'pending' | 'hole';
};

export type PendingExpiredFinding = {
  kind: 'pending-expired';
  file: string;
  markerKind: 'pending' | 'hole';
  stampedStory: string;
  stampedDate: string;
};

export type DriftFinding =
  | RetroOnlyFinding
  | TableOnlyFinding
  | MissingPathFinding
  | ClaudeStaleTagFinding
  | ClaudeRangeFinding
  | MissingRoleFinding
  | RoleToolsViolationFinding
  | UnlistedControlFinding
  | MissingSpecVersionFinding
  | PendingUnstampedFinding
  | PendingExpiredFinding;

const ADVISORY_KINDS: ReadonlySet<DriftFinding['kind']> = new Set([
  'pending-unstamped',
  'pending-expired',
]);

// Mirrors dod-check's `isAlwaysAdvisory` split (Story h13, drift-scan's first
// advisory-tier check) — advisory findings still print but never gate the
// exit code.
export function isAdvisoryFinding(finding: DriftFinding): boolean {
  return ADVISORY_KINDS.has(finding.kind);
}

export type ComposeDriftResult = {
  retroOnly: Set<string>;
  tableOnly: Set<string>;
};

const R_TAG_PATTERN = /\bR\d+\b/g;

type SectionEightBounds = { start: number; end: number };

function findSectionEightBounds(claudeMd: string): SectionEightBounds | null {
  const sectionStart = claudeMd.indexOf('\n## 8. Rule provenance');
  if (sectionStart === -1) {
    return null;
  }
  const afterHeading = sectionStart + 1;
  const nextSection = claudeMd.indexOf('\n## ', afterHeading + 10);
  const end = nextSection === -1 ? claudeMd.length : nextSection;
  return { start: sectionStart, end };
}

export function extractSectionEightTags(claudeMd: string): Set<string> {
  const bounds = findSectionEightBounds(claudeMd);
  if (bounds === null) {
    return new Set();
  }
  const region = claudeMd.slice(bounds.start, bounds.end);

  const tableRowPattern = /^\|\s*(R\d+)\s*\|/gm;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = tableRowPattern.exec(region)) !== null) {
    tags.add(match[1]);
  }
  return tags;
}

// Excludes § 8 from a Check-G scan of CLAUDE.md itself. § 8's own rows (R21
// in particular) document the pending/hole marker *format* using literal
// example text (`*(pending)*`, `*(hole)*`) — scanning § 8 for live markers
// would treat that documentation as an applied marker forever (Story h13).
export function stripSectionEightRegion(claudeMd: string): string {
  const bounds = findSectionEightBounds(claudeMd);
  if (bounds === null) {
    return claudeMd;
  }
  return claudeMd.slice(0, bounds.start) + claudeMd.slice(bounds.end);
}

export type SectionEightRow = {
  tag: string;
  ruleCell: string;
  tombstoned: boolean;
};

const TOMBSTONE_STRUCK_PREFIX = /^~~/;
const TOMBSTONE_NEVER_MINTED_PREFIX = /^\*Never minted/i;

function isTombstoneRuleCell(ruleCell: string): boolean {
  return TOMBSTONE_STRUCK_PREFIX.test(ruleCell) || TOMBSTONE_NEVER_MINTED_PREFIX.test(ruleCell);
}

// A tombstoned row (struck `~~...~~`, or the R22-style permanent
// "*Never minted*" tombstone) carries its retirement rationale in-row plus
// the linked walk — Check A's retro-reference requirement doesn't apply to
// it (Story h13, resolving the table-only:R22 finding).
export function extractSectionEightRows(claudeMd: string): SectionEightRow[] {
  const bounds = findSectionEightBounds(claudeMd);
  if (bounds === null) {
    return [];
  }
  const region = claudeMd.slice(bounds.start, bounds.end);
  const rowLinePattern = /^\|\s*(R\d+)\s*\|/;
  const rows: SectionEightRow[] = [];
  for (const line of region.split('\n')) {
    if (!rowLinePattern.test(line)) {
      continue;
    }
    const cells = line.split('|').map((cell) => cell.trim());
    const tag = cells[1];
    const ruleCell = cells[2] ?? '';
    rows.push({ tag, ruleCell, tombstoned: isTombstoneRuleCell(ruleCell) });
  }
  return rows;
}

// The asterisk form also tolerates Story h13's stamped variant
// (`*(pending — story-<id>, YYYY-MM-DD)*`, hyphen tolerated for the dash) —
// the underscore/bare-paren forms stay bare-only (legacy, not part of the
// stamped convention). Without this, a marker starts hard-failing Check A
// the moment it gains its expiry stamp, defeating Check G's advisory grace
// period.
const PENDING_MARKER_SUFFIX =
  /\s*(?:\*\(pending(?:\s*[—-]\s*story-[^,)]+,\s*\d{4}-\d{2}-\d{2})?\)\*|_\(pending\)_|\(pending\))/i;

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

// See PENDING_MARKER_SUFFIX above for why the asterisk form tolerates a stamp.
const HOLE_MARKER_SUFFIX =
  /\s*(?:\*\(hole(?:\s*[—-]\s*story-[^,)]+,\s*\d{4}-\d{2}-\d{2})?\)\*|_\(hole\)_|\(hole\))/i;

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
  specVersion?: number;
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

// Same tier as the missing-role check (story-h12, #165's golden-fixture-eval
// precondition — #172's Check E builds on this schema).
export function checkAgentSpecVersions(entries: AgentSpecEntry[]): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const entry of entries) {
    if (entry.specVersion === undefined) {
      findings.push({ kind: 'missing-spec-version', file: entry.file });
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
  for (const line of inventoryContent.split('\n')) {
    if (!line.trimStart().startsWith('|')) {
      continue;
    }
    const pattern = new RegExp(INVENTORY_PATH_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      if (!match[1].split('/').includes('..')) {
        paths.add(match[1]);
      }
    }
  }
  return paths;
}

export type PendingMarker = {
  file: string;
  kind: 'pending' | 'hole';
  stampedStory?: string;
  stampedDate?: string;
};

const PENDING_HOLE_STAMP_PATTERN =
  /\*\((pending|hole)(?:\s*[—-]\s*story-([^,)]+),\s*(\d{4}-\d{2}-\d{2}))?\)\*/gi;

export function extractPendingMarkers(content: string, file: string): PendingMarker[] {
  const markers: PendingMarker[] = [];
  const pattern = new RegExp(PENDING_HOLE_STAMP_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const kind = match[1].toLowerCase() === 'hole' ? 'hole' : 'pending';
    const marker: PendingMarker = { file, kind };
    if (match[2] !== undefined) {
      marker.stampedStory = match[2].trim();
      marker.stampedDate = match[3];
    }
    markers.push(marker);
  }
  return markers;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const POSTDATING_FRAGMENT_EXPIRY_THRESHOLD = 10;

export function checkPendingExpiry(
  markers: PendingMarker[],
  options: { now: Date; statusFragmentDates: Date[] },
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const marker of markers) {
    if (marker.stampedDate === undefined) {
      findings.push({ kind: 'pending-unstamped', file: marker.file, markerKind: marker.kind });
      continue;
    }
    const stampTime = new Date(`${marker.stampedDate}T00:00:00Z`).getTime();
    const ageMs = options.now.getTime() - stampTime;
    const postdatingCount = options.statusFragmentDates.filter(
      (d) => d.getTime() > stampTime,
    ).length;
    const expired = ageMs > NINETY_DAYS_MS || postdatingCount >= POSTDATING_FRAGMENT_EXPIRY_THRESHOLD;
    if (expired) {
      findings.push({
        kind: 'pending-expired',
        file: marker.file,
        markerKind: marker.kind,
        stampedStory: marker.stampedStory ?? 'unknown',
        stampedDate: marker.stampedDate,
      });
    }
  }
  return findings;
}

export function formatJsonReport(findings: DriftFinding[]): string {
  return JSON.stringify({ findings });
}
