export type Phase = 'p2' | 'p4' | 'unattributed';

const RULE_PATTERN = /\bR\d+\b/g;

function ruleNumber(rule: string): number {
  return Number(rule.slice(1));
}

// Deduplicated, numerically sorted — aggregate.ts's per-rule ranking needs a
// stable list per row regardless of how many times a rule is mentioned in
// one finding.
export function extractRules(text: string): string[] {
  const matches = text.match(RULE_PATTERN) ?? [];
  return [...new Set(matches)].sort((a, b) => ruleNumber(a) - ruleNumber(b));
}

const PHASE4_ID_PATTERN = /^p4[-\s]/i;

export function isPhase4RowId(id: string): boolean {
  return PHASE4_ID_PATTERN.test(id.trim());
}

// Requires heading/emphasis markup around "Phase 4" so ordinary prose
// ("Phase 4 will extend this table later") never false-positives — only a
// `### Phase 4 ...` subheading or a `**Phase 4 ...**` / `**Phase-4 review`
// bold paragraph counts as a marker.
const PHASE4_MARKER_PATTERN = /^[ \t]*(?:#{2,4}[ \t]+Phase[\s-]?4\b|\*\*Phase[\s-]?4\b)/im;

export function findPhase4MarkerOffset(text: string): number {
  const match = PHASE4_MARKER_PATTERN.exec(text);
  return match ? match.index : -1;
}

export type AttributePhaseInput = {
  id: string;
  rowOffset: number | null;
  sectionText: string;
};

// Deterministic per the plan's rule: a P4- row id always wins; otherwise a
// row's position relative to the section's Phase-4 marker decides; a row
// whose position could not be established at all (and carries no P4- id)
// is the one case that stays honestly unattributed rather than guessing.
export function attributePhase(input: AttributePhaseInput): Phase {
  if (isPhase4RowId(input.id)) {
    return 'p4';
  }
  if (input.rowOffset === null) {
    return 'unattributed';
  }
  const markerOffset = findPhase4MarkerOffset(input.sectionText);
  if (markerOffset === -1) {
    return 'p2';
  }
  return input.rowOffset >= markerOffset ? 'p4' : 'p2';
}

const PHASE_LEGS: Record<Phase, readonly string[]> = {
  p2: ['plan-reviewer', 'sibling-overlap'],
  p4: ['code-reviewer', 'ddd-modeler'],
  unattributed: [],
};

// Coarse by design (CLAUDE.md § 6.2's leg pairs, not per-agent precision) —
// a phase maps to the two agents that run at that phase, not to which one
// specifically raised a given finding.
export function legsForPhase(phase: Phase): readonly string[] {
  return PHASE_LEGS[phase];
}
