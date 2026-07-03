import { describe, it, expect } from 'vitest';
import {
  resolveStoryCommit,
  computeWeightRatio,
  hasRetroLoopMetrics,
  buildLoopRow,
  formatCsv,
  formatTop3Report,
  formatSkipReport,
  type CommitLogEntry,
  type LoopRow,
} from '../lib/loop-metrics.js';

const COMMIT_LOG: CommitLogEntry[] = [
  { sha: 'bdf9198', subject: 'chore(docs): story-maint-18 — story-id uniqueness check in maintenance sub-loop (#142)' },
  { sha: 'c880563', subject: 'story-h2: promote drift-scan table-only findings to hard (exit 1) (#125)' },
  { sha: '12a6c13', subject: 'story-h1: drift-scan automation [Module 1, harness-engineering] (#115)' },
  { sha: 'ec4098e', subject: 'story-3.5: Status CLI Command (#89)' },
  { sha: 'd923eab', subject: 'Story 3.1: Versioned Split Rules (validity-window foundation) (#53)' },
  { sha: '3b087ef', subject: 'story-A: inline new-category creation in ingest prompt (#73) (#78)' },
  { sha: 'f0a524e', subject: 'feat(config): YAML configuration manager + 0600 DB perms (Story 1.4) (#20)' },
];

describe('resolveStoryCommit', () => {
  // fails if: the bracket-style subject (story-h1) is not matched — guards the
  // hyphen-lowercase-colon and bracket naming conventions used post-story-D.
  it('resolves a hyphen-colon subject (story-h1:)', () => {
    const result = resolveStoryCommit(COMMIT_LOG, 'h1');
    expect(result).not.toBeNull();
    expect(result?.sha).toBe('12a6c13');
  });

  // fails if: the "Story 3.1" (space, capitalized) convention used in
  // pre-story-D history is not matched — would silently skip every
  // Epic 1-3 numbered story.
  it('resolves a "Story <id>" (space, capitalized) subject', () => {
    const result = resolveStoryCommit(COMMIT_LOG, '3.1');
    expect(result).not.toBeNull();
    expect(result?.sha).toBe('d923eab');
  });

  // fails if: a bare letter id like "A" matches unrelated substrings
  // (e.g. "maintenance" contains no "a" boundary issue, but a naive
  // substring match on "A" would match almost every commit).
  it('resolves a single-letter story id (story-A:) without false positives', () => {
    const result = resolveStoryCommit(COMMIT_LOG, 'A');
    expect(result).not.toBeNull();
    expect(result?.sha).toBe('3b087ef');
  });

  // fails if: a story id with a prefix-collision (h1 vs h2) resolves to the
  // wrong commit — guards the word-boundary anchoring in the regex.
  it('does not confuse story-h1 with story-h2', () => {
    const result = resolveStoryCommit(COMMIT_LOG, 'h2');
    expect(result?.sha).toBe('c880563');
  });

  // fails if: an unresolvable story id returns a truthy value instead of
  // null — would cause the caller to fabricate a diff_loc instead of
  // routing to the skip-report (guards the "no silent drop" invariant).
  it('returns null when no commit subject references the story id', () => {
    const result = resolveStoryCommit(COMMIT_LOG, 'nonexistent-99');
    expect(result).toBeNull();
  });
});

describe('computeWeightRatio', () => {
  // fails if: integer division truncates instead of producing a float ratio
  // — the Module 5 heuristic ("plan longer than diff") needs a comparable
  // decimal value, not a floored int.
  it('computes plan_loc / diff_loc as a decimal', () => {
    expect(computeWeightRatio(200, 100)).toBe(2);
    expect(computeWeightRatio(50, 200)).toBe(0.25);
  });

  // fails if: division by zero produces Infinity/NaN silently propagated
  // into the CSV instead of being reported — diff_loc of 0 is a real
  // (if unusual) skip case, not a math edge case to paper over.
  it('returns null when diff_loc is zero', () => {
    expect(computeWeightRatio(100, 0)).toBeNull();
  });
});

describe('hasRetroLoopMetrics', () => {
  // fails if: the "## Loop metrics" heading detection is too strict (e.g.
  // requires an exact string match without the parenthetical suffix used
  // in every real retro file: "## Loop metrics (third run)").
  it('detects a "## Loop metrics (...)" heading with a parenthetical suffix', () => {
    expect(hasRetroLoopMetrics('# Story X\n\n## Loop metrics (third run)\n\nbody')).toBe(true);
  });

  it('returns false when no Loop metrics heading exists', () => {
    expect(hasRetroLoopMetrics('# Story X\n\n## Keep\n\nbody')).toBe(false);
  });
});

describe('buildLoopRow', () => {
  // fails if: a story with no resolvable commit is still assigned a
  // fabricated diff_loc/weight_ratio instead of "n/a" plus a skip reason —
  // this is the row-emission path the Gherkin "fails if" note guards.
  it('emits an n/a row with a skip reason when the commit cannot be resolved', () => {
    const row = buildLoopRow({
      storyId: 'nonexistent-99',
      planLoc: 120,
      commitLog: COMMIT_LOG,
      retroLoopMetrics: false,
      diffStatLookup: () => null,
    });
    expect(row.row).toEqual({
      story_id: 'nonexistent-99',
      plan_loc: 120,
      diff_loc: 'n/a',
      weight_ratio: 'n/a',
      retro_loop_metrics: false,
    });
    expect(row.skipReason).toBe('no merge commit resolved for story id "nonexistent-99"');
  });

  // fails if: a resolvable story is nonetheless routed to the skip path,
  // or the weight_ratio field is left as a string when diff_loc > 0.
  it('emits a full numeric row when the commit resolves and diff-stat lookup succeeds', () => {
    const row = buildLoopRow({
      storyId: 'h1',
      planLoc: 200,
      commitLog: COMMIT_LOG,
      retroLoopMetrics: true,
      diffStatLookup: (sha) => (sha === '12a6c13' ? 100 : null),
    });
    expect(row.row).toEqual({
      story_id: 'h1',
      plan_loc: 200,
      diff_loc: 100,
      weight_ratio: 2,
      retro_loop_metrics: true,
    });
    expect(row.skipReason).toBeNull();
  });

  // fails if: diff_loc lookup returning 0 (a real git --shortstat edge case)
  // is treated as "resolved" and divides-by-zero into the CSV silently.
  it('emits a skip reason when diff-stat lookup resolves to zero', () => {
    const row = buildLoopRow({
      storyId: 'h1',
      planLoc: 200,
      commitLog: COMMIT_LOG,
      retroLoopMetrics: false,
      diffStatLookup: () => 0,
    });
    expect(row.row.diff_loc).toBe('n/a');
    expect(row.skipReason).toBe('merge commit for story id "h1" has zero diff_loc');
  });
});

describe('formatCsv', () => {
  // fails if: column order deviates from the plan's documented contract
  // (story_id, plan_loc, diff_loc, weight_ratio, retro_loop_metrics) —
  // downstream consumers (the retro Cost line, C6 annotation) key on order.
  // The `commits` column is dropped (S2) — it was always 1 post-squash.
  it('emits the header followed by one row per LoopRow in documented column order', () => {
    const rows: LoopRow[] = [
      { story_id: 'h1', plan_loc: 200, diff_loc: 100, weight_ratio: 2, retro_loop_metrics: true },
      { story_id: 'nonexistent-99', plan_loc: 120, diff_loc: 'n/a', weight_ratio: 'n/a', retro_loop_metrics: false },
    ];
    const csv = formatCsv(rows);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('story_id,plan_loc,diff_loc,weight_ratio,retro_loop_metrics');
    expect(lines[1]).toBe('h1,200,100,2,true');
    expect(lines[2]).toBe('nonexistent-99,120,n/a,n/a,false');
  });
});

describe('formatTop3Report', () => {
  // fails if: rows with 'n/a' weight_ratio are ranked as if they were
  // numeric (e.g. NaN sorts unpredictably) — the top-3 offenders list must
  // only rank stories with a real, computed weight_ratio.
  it('names the top-3 numeric weight-ratio offenders, highest first', () => {
    const rows: LoopRow[] = [
      { story_id: 'low', plan_loc: 10, diff_loc: 100, weight_ratio: 0.1, retro_loop_metrics: false },
      { story_id: 'high', plan_loc: 300, diff_loc: 10, weight_ratio: 30, retro_loop_metrics: false },
      { story_id: 'mid', plan_loc: 100, diff_loc: 50, weight_ratio: 2, retro_loop_metrics: false },
      { story_id: 'skip', plan_loc: 10, diff_loc: 'n/a', weight_ratio: 'n/a', retro_loop_metrics: false },
      { story_id: 'mid2', plan_loc: 60, diff_loc: 40, weight_ratio: 1.5, retro_loop_metrics: false },
    ];
    const report = formatTop3Report(rows);
    expect(report).toBe(
      'top-3 weight-ratio offenders:\n' +
        '  1. high (weight_ratio=30)\n' +
        '  2. mid (weight_ratio=2)\n' +
        '  3. mid2 (weight_ratio=1.5)',
    );
  });
});

describe('formatSkipReport', () => {
  // fails if: skipped stories are summarized ("N stories skipped") instead
  // of enumerated with reasons — the Gherkin "fails if" note requires every
  // skip to be individually named, never silently truncated.
  it('lists every skip reason individually, never truncated', () => {
    const report = formatSkipReport([
      { storyId: 'nonexistent-99', reason: 'no merge commit resolved for story id "nonexistent-99"' },
      { storyId: 'zero-diff', reason: 'merge commit for story id "zero-diff" has zero diff_loc' },
    ]);
    expect(report).toBe(
      'skipped stories:\n' +
        '  nonexistent-99: no merge commit resolved for story id "nonexistent-99"\n' +
        '  zero-diff: merge commit for story id "zero-diff" has zero diff_loc',
    );
  });

  it('reports no skips explicitly rather than omitting the section', () => {
    expect(formatSkipReport([])).toBe('skipped stories: none');
  });
});
