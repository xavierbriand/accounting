import { describe, it, expect } from 'vitest';
import { checkLoopFreshness } from '../lib/loop-freshness.js';

describe('checkLoopFreshness', () => {
  // fails if: the set difference inverts (e.g. flags plan ids present in the
  // csv, or misses ones absent) — guards F7's core invariant.
  it('reports one finding per plan id absent from the csv', () => {
    const findings = checkLoopFreshness(['aa', 'xx'], ['aa'], 'yy');
    expect(findings).toEqual([{ kind: 'loop-csv-stale', storyId: 'xx' }]);
  });

  // fails if: self-exclusion breaks and the current story's own
  // not-yet-generated row nags every PR about itself.
  it('excludes the current story id even when absent from the csv', () => {
    const findings = checkLoopFreshness(['aa', 'xx'], ['aa'], 'xx');
    expect(findings).toEqual([]);
  });

  // fails if: currentStoryId is null (unresolved) and that null somehow
  // matches a plan id, suppressing a legitimate finding.
  it('reports every absent id when currentStoryId is null', () => {
    const findings = checkLoopFreshness(['aa', 'xx'], [], null);
    expect(findings).toEqual([
      { kind: 'loop-csv-stale', storyId: 'aa' },
      { kind: 'loop-csv-stale', storyId: 'xx' },
    ]);
  });

  // fails if: every plan id present in the csv still produces findings.
  it('reports nothing when every plan id is present in the csv', () => {
    expect(checkLoopFreshness(['aa', 'bb'], ['aa', 'bb'], null)).toEqual([]);
  });
});
