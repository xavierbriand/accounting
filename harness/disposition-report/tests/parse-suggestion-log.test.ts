import { describe, it, expect } from 'vitest';
import { parseSuggestionLog, normalizeTag } from '../parse-suggestion-log.js';

// Sampled (condensed) from docs/plans/story-4.1.md's real Suggestion log —
// the `| # | Finding | Tag | Resolution |` dialect, bold tags.
const DIALECT_FINDING_TAG_RESOLUTION = `# Story 4.1 — DomainEventRecorder Port & Append-Only Event Store

## Suggestion log

Phase 2 ran \`plan-reviewer\` + \`sibling-overlap\` in parallel.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P3 naming-drift: \`occurred_at\` collides semantically | **ADOPT** | Column renamed \`recorded_at\`. |
| 6 | P2 coherence: B1 non-atomicity is a narrow tension | **DEFER** | [#180](https://github.com/x/y/issues/180) |
| 7 | P3 soft: use \`Result.flatMap\`/\`map\` for the chain | **REJECT** | Breaks house style. |
| 9 | P3: migration SQL field-comment necessity | **ACKNOWLEDGE** | Matches existing style. |

## DoR checklist
`;

// Sampled (condensed) from docs/plans/story-maint-04.md's real Suggestion
// log — the older \`| Phase | Suggestion | Resolution | Link / Reason |\`
// dialect, lowercase tags living in the Resolution column.
const DIALECT_PHASE_SUGGESTION_RESOLUTION = `# Story maint-04 — Validate \`dbPath\` against symlink-based path hijacking

## Suggestion log

Phase 2 (P1 / P2 / P3) run by Opus.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Gherkin scenario 4 covered by the unit test case already? | rejected | Doubles subprocess-test cost. |
| P3 | Should the validation be in Core or Infra? | adopted | Stays in \`src/infra/db/\`. |

## DoR checklist
`;

describe('parseSuggestionLog — dialect coverage', () => {
  // fails if the `| # | Finding | Tag | Resolution |` dialect's header-role
  // detection (Tag column present) picks the wrong column for the tag,
  // silently misreading ADOPT/DEFER/REJECT/ACKNOWLEDGE as free text.
  it('parses the Finding/Tag/Resolution dialect into normalized tags', () => {
    const rows = parseSuggestionLog(DIALECT_FINDING_TAG_RESOLUTION);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.tag)).toEqual(['adopted', 'deferred', 'rejected', 'acknowledged']);
    expect(rows[0].story).toBe('4.1');
    expect(rows[0].finding).toContain('naming-drift');
  });

  // fails if the older dialect (no Tag column; the Resolution column IS the
  // tag) falls back incorrectly, e.g. reading Link/Reason as the tag or
  // treating Resolution as free text because a Tag column is expected.
  it('parses the Phase/Suggestion/Resolution/Link dialect into normalized tags', () => {
    const rows = parseSuggestionLog(DIALECT_PHASE_SUGGESTION_RESOLUTION);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.tag)).toEqual(['rejected', 'adopted']);
    expect(rows[1].finding).toContain('Core or Infra');
  });

  // fails if extractStoryId's heading regex doesn't handle the "Epic N,
  // Story X" heading variant (docs/plans/story-2.2.md's real first line).
  it('extracts the story id from an "Epic N, Story X" heading', () => {
    const markdown = `# Epic 2, Story 2.2 — Idempotency Service

## Suggestion log

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | some finding | ADOPT | done |
`;
    const rows = parseSuggestionLog(markdown);
    expect(rows[0].story).toBe('2.2');
  });

  // fails if extractStoryId's heading regex requires whitespace after
  // "Story" — docs/plans/story-h6.md and story-h7.md's real first lines use
  // "Story-h6:" (hyphen, no space), a third heading variant discovered via
  // the real-tree integration run (disposition-report.integration.test.ts)
  // collapsing both files' rows under a shared "unknown" story bucket.
  it('extracts the story id from a "Story-h6:" (hyphenated, no space) heading', () => {
    const markdown = `# Story-h6: Deterministic DoD checks

## Suggestion log

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | some finding | ADOPT | done |
`;
    const rows = parseSuggestionLog(markdown);
    expect(rows[0].story).toBe('h6');
  });

  // fails if a plan with no "## Suggestion log" heading at all (e.g.
  // docs/plans/story-2.2.md pre-dates the convention) throws instead of
  // returning an empty, honestly-zero row list.
  it('returns an empty array when there is no Suggestion log section', () => {
    const markdown = `# Story x — Untitled\n\n## Context\n\nNo suggestion log here.\n`;
    expect(parseSuggestionLog(markdown)).toEqual([]);
  });
});

describe('normalizeTag — honesty buckets', () => {
  it.each([
    ['ADOPT', 'adopted'],
    ['**ADOPT**', 'adopted'],
    ['Adopted', 'adopted'],
    ['adopt (ride-along)', 'adopted'],
    ['ADOPT (partial)', 'adopted'],
    ['ADOPT (reversal)', 'adopted'],
    ['ADOPT + DEFER', 'adopted'],
    ['FIX-NOW', 'adopted'],
    ['**FIX-NOW**', 'adopted'],
    ['DEFER', 'deferred'],
    ['deferred', 'deferred'],
    ['REJECT', 'rejected'],
    ['rejected', 'rejected'],
    ['ACKNOWLEDGE', 'acknowledged'],
    ['acknowledge', 'acknowledged'],
    ['acknowledged', 'acknowledged'],
    ['(no action)', 'acknowledged'],
    ['no-action', 'acknowledged'],
    ['N/A', 'acknowledged'],
    ['compliant', 'acknowledged'],
  ] as const)('normalizes %s -> %s', (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });

  // fails if an unrecognizable tag (e.g. a stray "verified"/"???" value from
  // a P4-retro-style row, or a malformed/empty cell) is silently dropped
  // instead of landing in the counted `unparsed` bucket — the parser's
  // credibility depends on never losing a row (Gherkin scenario 2: malformed
  // row -> unparsed, never dropped).
  it.each(['verified', '???', '', '—'])('buckets unrecognizable tag %s as unparsed', (raw) => {
    expect(normalizeTag(raw)).toBe('unparsed');
  });

  it('a malformed row (fewer cells than the header) lands in unparsed, never dropped', () => {
    const markdown = `# Story x — Malformed row fixture

## Suggestion log

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | well-formed finding | ADOPT | done |
| 2 | truncated row with no tag or resolution cell |

## DoR checklist
`;
    const rows = parseSuggestionLog(markdown);
    expect(rows).toHaveLength(2);
    expect(rows[1].tag).toBe('unparsed');
    expect(rows[1].finding).toContain('truncated row');
  });
});

describe('parseSuggestionLog — phase attribution + R-rule extraction (attribute.ts wiring)', () => {
  // fails if parseSuggestionLog doesn't wire attribute.ts's heuristics in —
  // rows before a Phase-4 marker are p2, rows after are p4, and R-rule
  // mentions in the finding text are captured (sampled from the
  // story-4.1.md-style `### Phase 4 (...) dispositions` subheading dialect).
  it('splits a single Suggestion log section into p2/p4 rows at a "### Phase 4" subheading', () => {
    const markdown = `# Story x — Phase split fixture

## Suggestion log

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P3 naming-drift per R25 | **ADOPT** | Renamed. |

### Phase 4 (code-reviewer + ddd-modeler Mode B) dispositions

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| P4-1 | stderr error not sanitized | **FIX-NOW** | Wrapped in sanitizeSqlError. |

## DoR checklist
`;
    const rows = parseSuggestionLog(markdown);
    expect(rows).toHaveLength(2);
    expect(rows[0].phase).toBe('p2');
    expect(rows[0].rules).toEqual(['R25']);
    expect(rows[1].phase).toBe('p4');
    expect(rows[1].tag).toBe('adopted');
  });

  // fails if a separate top-level `## Phase-4 review & dispositions` section
  // (story-4.3a.md's real dialect — a sibling section, not a subheading
  // inside Suggestion log) isn't picked up as a continuation at all.
  it('treats an immediately-following "## Phase-4 review & dispositions" section as a continuation', () => {
    const markdown = `# Story x — Sibling-section fixture

## Suggestion log

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | phase-2 finding | adopted | done |

## Phase-4 review & dispositions (2026-07-08)

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | phase-4 finding | acknowledged | confirmed |

## DoR checklist
`;
    const rows = parseSuggestionLog(markdown);
    expect(rows).toHaveLength(2);
    expect(rows[0].phase).toBe('p2');
    expect(rows[1].phase).toBe('p4');
  });

  // fails if the P4-retro id override isn't honored when the row sits in the
  // *same* table as ordinary P1/P2/P3 rows with no heading split at all
  // (story-maint-05.md/story-maint-06.md's real shape).
  it('attributes a P4-retro row id to p4 even with no marker in the section', () => {
    const markdown = `# Story x — P4-retro fixture

## Suggestion log

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | phase-2 finding | adopted | done |
| P4-retro | CI gate green | verified | confirmed |

## DoR checklist
`;
    const rows = parseSuggestionLog(markdown);
    expect(rows[0].phase).toBe('p2');
    expect(rows[1].phase).toBe('p4');
    expect(rows[1].tag).toBe('unparsed');
  });
});
