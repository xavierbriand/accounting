import { describe, it, expect } from 'vitest';
import {
  extractRules,
  isPhase4RowId,
  findPhase4MarkerOffset,
  attributePhase,
  legsForPhase,
} from '../attribute.js';

describe('extractRules', () => {
  // fails if the /\bR\d+\b/g extraction misses a rule mention, duplicates
  // one mentioned twice in the same finding, or returns them in a
  // non-deterministic order (aggregate.ts's per-rule ranking depends on a
  // stable, deduplicated rule list per row).
  it('extracts unique R-rule mentions, sorted numerically', () => {
    expect(extractRules('R6/R8 boilerplate rows, also R6 again and R12')).toEqual([
      'R6',
      'R8',
      'R12',
    ]);
  });

  it('returns an empty array when the finding text names no rule', () => {
    expect(extractRules('PII risk for echoed category names not addressed')).toEqual([]);
  });

  it('does not match a bare number without the R prefix', () => {
    expect(extractRules('affects 12 files, see issue #180')).toEqual([]);
  });
});

describe('isPhase4RowId', () => {
  it.each(['P4-1', 'p4-1', 'P4-retro', 'P4 1'])('treats %s as a Phase-4 row id', (id) => {
    expect(isPhase4RowId(id)).toBe(true);
  });

  it.each(['P1', 'P2 (sibling-overlap)', '1', '—', 'P4'])(
    'does not treat %s as a Phase-4 row id',
    (id) => {
      expect(isPhase4RowId(id)).toBe(false);
    },
  );
});

describe('findPhase4MarkerOffset', () => {
  // fails if the marker regex requires literal "**Phase-4 review" and misses
  // the "### Phase 4 (...) dispositions" subheading dialect (story-4.1.md)
  // or the "**Phase 4 (...)**" bold-paragraph dialect (story-maint-22.md).
  it('finds a "### Phase 4" subheading marker', () => {
    const text = 'before text\n### Phase 4 (code-reviewer + ddd-modeler Mode B) dispositions\nafter';
    const offset = findPhase4MarkerOffset(text);
    expect(offset).toBeGreaterThan(text.indexOf('before'));
    expect(offset).toBeLessThan(text.indexOf('after'));
  });

  it('finds a bold "**Phase 4" paragraph marker', () => {
    const text = 'before\n**Phase 4 (code-reviewer + sibling-overlap, Reduced lane) — run.**\nafter';
    const offset = findPhase4MarkerOffset(text);
    expect(offset).toBeGreaterThan(text.indexOf('before'));
    expect(offset).toBeLessThan(text.indexOf('after'));
  });

  it('finds a bold "**Phase-4 review" marker', () => {
    const text = 'before\n**Phase-4 review (2026-07-17):** findings.\nafter';
    expect(findPhase4MarkerOffset(text)).toBeGreaterThan(-1);
  });

  it('does not false-positive on plain prose mentioning "Phase 4"', () => {
    const text = 'Phase 2 entries below. Phase 4 (retro-check) extends this table later.';
    expect(findPhase4MarkerOffset(text)).toBe(-1);
  });

  it('returns -1 when there is no marker at all', () => {
    expect(findPhase4MarkerOffset('nothing relevant here')).toBe(-1);
  });
});

describe('attributePhase', () => {
  // fails if the P4- id override is skipped when the row sits inside a
  // single un-split table (story-maint-05.md's real shape: P4-retro rows
  // appended to the same table as P1/P2/P3 rows, no heading between them).
  it('attributes p4 from a P4- row id even with no marker in the section', () => {
    const phase = attributePhase({ id: 'P4-retro', rowOffset: 5, sectionText: 'no marker here' });
    expect(phase).toBe('p4');
  });

  it('attributes p2 when there is no marker and no P4- id', () => {
    const phase = attributePhase({ id: 'P1', rowOffset: 5, sectionText: 'no marker here' });
    expect(phase).toBe('p2');
  });

  it('attributes p2 for a row positioned before the Phase-4 marker', () => {
    const sectionText = 'row-here\n**Phase 4 marker**\nP4-row-here';
    const rowOffset = sectionText.indexOf('row-here');
    expect(attributePhase({ id: '1', rowOffset, sectionText })).toBe('p2');
  });

  it('attributes p4 for a row positioned after the Phase-4 marker', () => {
    const sectionText = 'row-here\n**Phase 4 marker**\nlater-row';
    const rowOffset = sectionText.indexOf('later-row');
    expect(attributePhase({ id: '1', rowOffset, sectionText })).toBe('p4');
  });

  // fails if the defensive fallback for a row whose position could not be
  // established (rowOffset unknown) silently guesses p2 instead of
  // surfacing the honest unattributed bucket — the report's credibility
  // depends on this branch (Gherkin: ambiguous attribution -> unattributed).
  it('attributes unattributed when the row position is unknown and it carries no P4- id', () => {
    const phase = attributePhase({ id: '1', rowOffset: null, sectionText: 'no marker here' });
    expect(phase).toBe('unattributed');
  });
});

describe('legsForPhase', () => {
  it('maps p2 to plan-reviewer + sibling-overlap', () => {
    expect(legsForPhase('p2')).toEqual(['plan-reviewer', 'sibling-overlap']);
  });

  it('maps p4 to code-reviewer + ddd-modeler', () => {
    expect(legsForPhase('p4')).toEqual(['code-reviewer', 'ddd-modeler']);
  });

  it('maps unattributed to an empty leg list', () => {
    expect(legsForPhase('unattributed')).toEqual([]);
  });
});
