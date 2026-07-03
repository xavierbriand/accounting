import { describe, it, expect } from 'vitest';
import { isProcessArtifactPath, sumShippedDiffLoc, PROCESS_ARTIFACT_PREFIXES } from '../process-artifacts.js';

describe('isProcessArtifactPath', () => {
  // fails if: a plan/retro/status-fragment path is not recognized as a
  // process artifact — would leak ceremony LOC back into the "shipped" total.
  it('is true for docs/plans/, docs/retrospectives/, and docs/status.d/ paths', () => {
    expect(isProcessArtifactPath('docs/plans/story-h8.md')).toBe(true);
    expect(isProcessArtifactPath('docs/retrospectives/story-h8.md')).toBe(true);
    expect(isProcessArtifactPath('docs/status.d/2026-07-03-story-h8.md')).toBe(true);
  });

  // fails if: a shipped src/harness path is misclassified as a process
  // artifact — would zero out genuinely-shipped diff_loc.
  it('is false for src/ and harness/ paths', () => {
    expect(isProcessArtifactPath('src/core/money.ts')).toBe(false);
    expect(isProcessArtifactPath('harness/lib/process-artifacts.ts')).toBe(false);
  });

  // fails if: a path merely containing the prefix substring elsewhere (not
  // at the start) is misclassified — guards prefix anchoring, not substring
  // matching.
  it('is false for a path that only contains the prefix substring mid-path', () => {
    expect(isProcessArtifactPath('src/docs/plans/not-real.ts')).toBe(false);
  });

  it('exposes the prefix list used for classification', () => {
    expect(PROCESS_ARTIFACT_PREFIXES).toEqual(['docs/plans/', 'docs/retrospectives/', 'docs/status.d/']);
  });
});

describe('sumShippedDiffLoc', () => {
  // fails if: the path-field ([2]) filter in sumShippedDiffLoc is removed —
  // the process lines would inflate the total (S1 Gherkin scenario).
  it('sums only non-process paths from mixed numstat output', () => {
    const numstat = [
      '10\t5\tsrc/core/money.ts',
      '100\t50\tdocs/plans/story-x.md',
      '3\t2\tharness/lib/process-artifacts.ts',
    ].join('\n');
    expect(sumShippedDiffLoc(numstat)).toBe(10 + 5 + 3 + 2);
  });

  // fails if: binary (`-`) numstat rows crash the sum instead of being
  // tolerated — keeps the existing Number.isFinite tolerance.
  it('tolerates binary (-) numstat rows without crashing', () => {
    const numstat = ['-\t-\tsrc/core/logo.png', '4\t1\tsrc/core/money.ts'].join('\n');
    expect(sumShippedDiffLoc(numstat)).toBe(5);
  });

  it('returns 0 for empty numstat output', () => {
    expect(sumShippedDiffLoc('')).toBe(0);
  });

  // fails if: retro/status-fragment paths are not excluded alongside plans —
  // guards all three prefixes, not just docs/plans/.
  it('excludes retrospectives and status fragments alongside plans', () => {
    const numstat = [
      '10\t0\tdocs/retrospectives/story-x.md',
      '20\t0\tdocs/status.d/2026-07-03-story-x.md',
      '1\t1\tharness/metrics/loop-metrics.ts',
    ].join('\n');
    expect(sumShippedDiffLoc(numstat)).toBe(2);
  });
});
