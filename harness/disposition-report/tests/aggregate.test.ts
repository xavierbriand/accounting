import { describe, it, expect } from 'vitest';
import { aggregate, formatMarkdownReport, formatJsonReport } from '../aggregate.js';
import type { SuggestionLogRow } from '../parse-suggestion-log.js';

function row(partial: Partial<SuggestionLogRow>): SuggestionLogRow {
  return {
    story: 'x',
    phase: 'p2',
    tag: 'adopted',
    rules: [],
    finding: 'a finding',
    ...partial,
  };
}

describe('aggregate', () => {
  // fails if a tag bucket is missing from byTag (Scenario 1: every table row
  // lands in exactly one tag bucket) or a count is wrong.
  it('totals rows per normalized tag, including zero-count buckets', () => {
    const report = aggregate([
      row({ tag: 'adopted' }),
      row({ tag: 'adopted' }),
      row({ tag: 'rejected' }),
      row({ tag: 'unparsed' }),
    ]);
    expect(report.totalRows).toBe(4);
    expect(report.byTag).toEqual({
      adopted: 2,
      deferred: 0,
      rejected: 1,
      acknowledged: 0,
      unparsed: 1,
    });
  });

  // fails if parsedLogCount counts rows instead of distinct stories, or
  // double-counts a story with multiple rows.
  it('counts parsed logs as the number of distinct stories contributing at least one row', () => {
    const report = aggregate([
      row({ story: 'a', tag: 'adopted' }),
      row({ story: 'a', tag: 'rejected' }),
      row({ story: 'b', tag: 'adopted' }),
    ]);
    expect(report.parsedLogCount).toBe(2);
  });

  // fails if a phase bucket (p2/p4/unattributed) is dropped when its count
  // is zero, or if legsForPhase's mapping isn't threaded through.
  it('reports per-phase totals with legs, including a zero-count unattributed bucket', () => {
    const report = aggregate([row({ phase: 'p2' }), row({ phase: 'p4', tag: 'acknowledged' })]);
    const byPhase = Object.fromEntries(report.byPhase.map((p) => [p.phase, p]));
    expect(byPhase.p2.total).toBe(1);
    expect(byPhase.p2.legs).toEqual(['plan-reviewer', 'sibling-overlap']);
    expect(byPhase.p4.total).toBe(1);
    expect(byPhase.p4.legs).toEqual(['code-reviewer', 'ddd-modeler']);
    expect(byPhase.unattributed.total).toBe(0);
  });

  // fails if the per-rule acknowledge-only rate miscounts, or ranking order
  // is unstable/non-deterministic (n attached per the plan's honesty
  // requirement).
  it('ranks rules by acknowledge-only rate, with n attached', () => {
    const report = aggregate([
      row({ tag: 'acknowledged', rules: ['R6'] }),
      row({ tag: 'acknowledged', rules: ['R6'] }),
      row({ tag: 'adopted', rules: ['R6'] }),
      row({ tag: 'acknowledged', rules: ['R8'] }),
      row({ tag: 'adopted', rules: ['R8'] }),
    ]);
    expect(report.byRule).toEqual([
      { rule: 'R6', total: 3, acknowledged: 2, acknowledgeRate: 2 / 3 },
      { rule: 'R8', total: 2, acknowledged: 1, acknowledgeRate: 0.5 },
    ]);
  });

  it('groups rows per story with per-tag totals, sorted by story id', () => {
    const report = aggregate([
      row({ story: 'h2', tag: 'adopted' }),
      row({ story: '4.1', tag: 'rejected' }),
      row({ story: '4.1', tag: 'adopted' }),
    ]);
    expect(report.byStory.map((s) => s.story)).toEqual(['4.1', 'h2']);
    expect(report.byStory[0].total).toBe(2);
    expect(report.byStory[0].byTag.adopted).toBe(1);
    expect(report.byStory[0].byTag.rejected).toBe(1);
  });

  it('handles an empty row list without throwing, reporting zero everywhere', () => {
    const report = aggregate([]);
    expect(report.totalRows).toBe(0);
    expect(report.parsedLogCount).toBe(0);
    expect(report.byRule).toEqual([]);
    expect(report.byStory).toEqual([]);
  });
});

describe('formatMarkdownReport / formatJsonReport — determinism', () => {
  const rows = [
    row({ story: 'h2', tag: 'adopted', rules: ['R6'] }),
    row({ story: '4.1', tag: 'acknowledged', rules: ['R6'], phase: 'p4' }),
  ];

  // fails if either writer embeds a timestamp or otherwise non-deterministic
  // value, or if the two writers disagree on totals (Scenario 1: totals in
  // .md and .json agree).
  it('produces byte-identical output on repeated calls with the same input', () => {
    const report = aggregate(rows);
    expect(formatMarkdownReport(report)).toBe(formatMarkdownReport(aggregate(rows)));
    expect(formatJsonReport(report)).toBe(formatJsonReport(aggregate(rows)));
  });

  it('the markdown report and the JSON report agree on totalRows', () => {
    const report = aggregate(rows);
    const md = formatMarkdownReport(report);
    const parsed = JSON.parse(formatJsonReport(report)) as { totalRows: number };
    expect(md).toContain(String(report.totalRows));
    expect(parsed.totalRows).toBe(report.totalRows);
  });

  it('JSON output round-trips the full report shape', () => {
    const report = aggregate(rows);
    const parsed = JSON.parse(formatJsonReport(report));
    expect(parsed).toEqual(report);
  });
});
