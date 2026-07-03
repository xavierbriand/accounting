import { describe, it, expect } from 'vitest';
import { isAlwaysAdvisory, type DodFinding } from '../dod-check.js';

describe('isAlwaysAdvisory', () => {
  // fails if: a non-story PR's story-id-unresolved finding gates the exit
  // code — guards the Scenario A regression (Dependabot/chore PRs).
  it('is true for story-id-unresolved', () => {
    const finding: DodFinding = { kind: 'story-id-unresolved', reason: 'no story- branch' };
    expect(isAlwaysAdvisory(finding)).toBe(true);
  });

  // fails if: an undeclared envelope rule starts gating the exit code —
  // guards the "not declared" always-advisory path.
  it('is true for commit-envelope when rule is null (not declared)', () => {
    const finding: DodFinding = { kind: 'commit-envelope', count: 8, rule: null, min: null, max: null };
    expect(isAlwaysAdvisory(finding)).toBe(true);
  });

  // fails if: an under-target story (count < min) hard-blocks — guards
  // Scenario B's under-count leg (story-h7 dogfoods this on itself).
  it('is true for commit-envelope when count < min (under-target)', () => {
    const finding: DodFinding = { kind: 'commit-envelope', count: 3, rule: 'R13', min: 6, max: 10 };
    expect(isAlwaysAdvisory(finding)).toBe(true);
  });

  // fails if: an over-target story (count > max) stops being gated at all —
  // guards Scenario B's over-count leg staying in the draft-aware soft gate.
  it('is false for commit-envelope when count > max (over-target)', () => {
    const finding: DodFinding = { kind: 'commit-envelope', count: 12, rule: 'R13', min: 6, max: 10 };
    expect(isAlwaysAdvisory(finding)).toBe(false);
  });

  // fails if: a hard finding (e.g. missing-story-id) is reclassified as
  // always-advisory — guards HARD_KINDS staying untouched.
  it('is false for a hard finding kind (missing-story-id)', () => {
    const finding: DodFinding = { kind: 'missing-story-id', sha: 'abc1234', subject: 'chore: x' };
    expect(isAlwaysAdvisory(finding)).toBe(false);
  });
});
