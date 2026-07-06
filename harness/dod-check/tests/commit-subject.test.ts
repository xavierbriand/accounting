import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkCommitSubjects,
  parseEnvelopeRule,
  checkCommitEnvelope,
  countChangeBodyCommits,
  countSlices,
  type CommitLogEntry,
} from '../lib/commit-subject.js';
import { isAlwaysAdvisory } from '../dod-check.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'plans');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

const COMMITS: CommitLogEntry[] = [
  { sha: 'aaa1111', subject: 'test(harness): shared story-id matcher — failing [story-zz]' },
  { sha: 'bbb2222', subject: 'feat(harness): story-id-matcher — green [story-zz]' },
  { sha: 'ccc3333', subject: 'chore(deps): bump something unrelated' },
];

describe('checkCommitSubjects', () => {
  // fails if: a subject missing the story id is not flagged — guards
  // Scenario A's core commit-subject-discipline invariant.
  it('reports missing-story-id for a subject with no story id reference', () => {
    const findings = checkCommitSubjects(COMMITS, 'zz');
    expect(findings).toContainEqual({
      kind: 'missing-story-id',
      sha: 'ccc3333',
      subject: 'chore(deps): bump something unrelated',
    });
  });

  // fails if: subjects that DO carry the story id are falsely flagged —
  // guards against over-reporting.
  it('does not flag subjects that carry the story id', () => {
    const findings = checkCommitSubjects(COMMITS, 'zz');
    expect(findings.some((f) => f.sha === 'aaa1111')).toBe(false);
    expect(findings.some((f) => f.sha === 'bbb2222')).toBe(false);
  });
});

describe('parseEnvelopeRule', () => {
  // fails if: any of the five real corpus heading shapes fails to resolve
  // its envelope rule — guards the "parse across all five shapes" invariant.
  it('parses R13 from a heading with the tag inline: "## Slice plan (R13: target 6–10 commits)"', () => {
    const plan = '## Slice plan (R13: target 6–10 commits)\n\nsome body\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toEqual({ rule: 'R13', min: 6, max: 10 });
  });

  it('parses R14 from a heading with the tag inline: "## Slice plan (R14: ...)"', () => {
    const plan = '## Slice plan (R14: target 5–7 commits)\n\nsome body\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toEqual({ rule: 'R14', min: 5, max: 7 });
  });

  it('parses R16 from a heading with the tag inline: "## Slice plan (R16: ...)"', () => {
    const plan = '## Slice plan (R16: target 4 commits)\n\nsome body\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toEqual({ rule: 'R16', min: 4, max: 4 });
  });

  it('parses R13 from a plain "## Slice plan" heading whose body names R13', () => {
    const plan =
      '## Slice plan\n\nR13 envelope (target 6–10 commits). 9 implementation slices.\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toEqual({ rule: 'R13', min: 6, max: 10 });
  });

  it('parses R16 from a "## Sizing & commits — R16 collapse" heading', () => {
    const plan =
      '## Sizing & commits — R16 collapse\n\nPer R16, target 4 commits.\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toEqual({ rule: 'R16', min: 4, max: 4 });
  });

  it('parses R13 from a "## Slice plan for Sonnet" heading whose body names R13', () => {
    const plan =
      '## Slice plan for Sonnet\n\nR13 target 6–10 commits.\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toEqual({ rule: 'R13', min: 6, max: 10 });
  });

  // fails if: a plan with no R13/R14/R16 token anywhere in the Slice-plan
  // region crashes instead of returning a null resolution — guards the
  // "envelope rule not declared" advisory path.
  it('returns null when no R13/R14/R16 token is present in the Slice-plan region', () => {
    const plan = '## Slice plan\n\nSome plan with no envelope tag.\n\n## Risks\n';
    expect(parseEnvelopeRule(plan)).toBeNull();
  });

  it('returns null when there is no Slice-plan/Sizing heading at all', () => {
    const plan = '## Risks\n\nR13 mentioned only here, out of scope.\n';
    expect(parseEnvelopeRule(plan)).toBeNull();
  });

  // Fixture-file-backed pins of the same five corpus shapes (not just
  // story-h6's own single shape) — guards regression against real plan
  // files, not only inline strings authored alongside the parser.
  describe('fixture corpus — all five real Slice-plan/Sizing heading shapes', () => {
    it('slice-plan-r13-inline-tag.md → R13', () => {
      expect(parseEnvelopeRule(readFixture('slice-plan-r13-inline-tag.md'))).toEqual({
        rule: 'R13',
        min: 6,
        max: 10,
      });
    });

    it('slice-plan-r14-inline-tag.md → R14', () => {
      expect(parseEnvelopeRule(readFixture('slice-plan-r14-inline-tag.md'))).toEqual({
        rule: 'R14',
        min: 5,
        max: 7,
      });
    });

    it('slice-plan-r16-inline-tag.md → R16', () => {
      expect(parseEnvelopeRule(readFixture('slice-plan-r16-inline-tag.md'))).toEqual({
        rule: 'R16',
        min: 4,
        max: 4,
      });
    });

    it('slice-plan-plain-heading-body-tag.md → R13 (tag in body, not heading)', () => {
      expect(parseEnvelopeRule(readFixture('slice-plan-plain-heading-body-tag.md'))).toEqual({
        rule: 'R13',
        min: 6,
        max: 10,
      });
    });

    it('sizing-commits-r16-collapse-heading.md → R16 (Sizing heading variant)', () => {
      expect(parseEnvelopeRule(readFixture('sizing-commits-r16-collapse-heading.md'))).toEqual({
        rule: 'R16',
        min: 4,
        max: 4,
      });
    });

    it('slice-plan-no-envelope-tag.md → null (advisory "not declared" path)', () => {
      expect(parseEnvelopeRule(readFixture('slice-plan-no-envelope-tag.md'))).toBeNull();
    });
  });
});

describe('checkCommitEnvelope', () => {
  // fails if: a commit count outside the declared envelope is not reported
  // — guards Scenario A's envelope-finding path.
  it('reports commit-envelope when the count is outside the declared range', () => {
    const finding = checkCommitEnvelope(11, { rule: 'R13', min: 6, max: 10 });
    expect(finding).toEqual({ kind: 'commit-envelope', count: 11, rule: 'R13', min: 6, max: 10 });
  });

  it('reports nothing when the count is inside the declared range', () => {
    expect(checkCommitEnvelope(8, { rule: 'R13', min: 6, max: 10 })).toBeNull();
  });

  // fails if: an undeclared envelope silently skips reporting instead of
  // surfacing an advisory "not declared" finding.
  it('reports envelope-not-declared when no envelope rule resolved', () => {
    const finding = checkCommitEnvelope(8, null);
    expect(finding).toEqual({ kind: 'commit-envelope', count: 8, rule: null, min: null, max: null });
  });

  // Boundary classification (story-h7): pins min-1 / min / max / max+1 and
  // the tier each maps to via isAlwaysAdvisory, so an off-by-one at either
  // edge is caught immediately rather than discovered via a subprocess
  // integration failure.
  describe('boundary classification — min-1 / min / max / max+1', () => {
    const RULE = { rule: 'R13' as const, min: 6, max: 10 };

    // fails if: count = min-1 stops reporting a finding, or the finding is
    // classified as anything but always-advisory — guards the under-target
    // leg of Scenario B.
    it('count = min-1 (5): reports a finding, classified always-advisory', () => {
      const finding = checkCommitEnvelope(5, RULE);
      expect(finding).toEqual({ kind: 'commit-envelope', count: 5, rule: 'R13', min: 6, max: 10 });
      expect(finding && isAlwaysAdvisory(finding)).toBe(true);
    });

    // fails if: count = min reports a finding at all — guards the inclusive
    // lower boundary of the "inside declared range" no-finding path.
    it('count = min (6): reports no finding', () => {
      expect(checkCommitEnvelope(6, RULE)).toBeNull();
    });

    // fails if: count = max reports a finding at all — guards the inclusive
    // upper boundary of the "inside declared range" no-finding path.
    it('count = max (10): reports no finding', () => {
      expect(checkCommitEnvelope(10, RULE)).toBeNull();
    });

    // fails if: count = max+1 stops reporting a finding, or the finding is
    // classified as always-advisory instead of the soft (draft-aware) gate
    // — guards the over-target leg of Scenario B staying gated.
    it('count = max+1 (11): reports a finding, classified draft-aware (not always-advisory)', () => {
      const finding = checkCommitEnvelope(11, RULE);
      expect(finding).toEqual({ kind: 'commit-envelope', count: 11, rule: 'R13', min: 6, max: 10 });
      expect(finding && isAlwaysAdvisory(finding)).toBe(false);
    });
  });
});

describe('countChangeBodyCommits', () => {
  // fails if: feat/test/fix behaviour-slice commits carrying the story id
  // are not counted — guards the "count behaviour slices only" invariant
  // (F2): a real story's commit set should count its actual TDD slices.
  it('counts feat/test/fix slices that carry the story id', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'a1', subject: 'test(harness): shared story-id matcher — failing [story-h6]' },
      { sha: 'a2', subject: 'feat(harness): story-id-matcher — green [story-h6]' },
      { sha: 'a3', subject: 'fix(harness): edge case [story-h6]' },
    ];
    expect(countChangeBodyCommits(commits, 'h6')).toBe(3);
  });

  // fails if: the preparatory "plan + P1/P2/P3 review" commit is counted —
  // guards F2's exclusion of the P0 prep commit from the envelope.
  it('excludes the preparatory "chore(docs): ... plan + P1/P2/P3 review" commit', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'p0', subject: 'chore(docs): story-h6 plan + P1/P2/P3 review [story-h6]' },
      { sha: 'a1', subject: 'test(harness): shared story-id matcher — failing [story-h6]' },
      { sha: 'a2', subject: 'feat(harness): story-id-matcher — green [story-h6]' },
    ];
    expect(countChangeBodyCommits(commits, 'h6')).toBe(2);
  });

  // fails if: the "chore(retro): ..." bookkeeping commit is counted — guards
  // F2's exclusion of the retro commit, avoiding a false hard-fail once the
  // retro commit lands and pushes the count to 11.
  it('excludes the "chore(retro): ..." commit', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'a1', subject: 'test(harness): shared story-id matcher — failing [story-h6]' },
      { sha: 'a2', subject: 'feat(harness): story-id-matcher — green [story-h6]' },
      { sha: 'r1', subject: 'chore(retro): story-h6 retrospective + status fragment [story-h6]' },
    ];
    expect(countChangeBodyCommits(commits, 'h6')).toBe(2);
  });

  // fails if: commits without the story id in the subject are counted —
  // guards against inflating the envelope with unrelated commits.
  it('ignores commits without the story id in the subject', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'a1', subject: 'test(harness): shared story-id matcher — failing [story-h6]' },
      { sha: 'x1', subject: 'chore(deps): bump something unrelated' },
    ];
    expect(countChangeBodyCommits(commits, 'h6')).toBe(1);
  });

  it('excludes both the prep and retro commits together, counting only the middle slices', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'p0', subject: 'chore(docs): story-h6 plan + P1/P2/P3 review [story-h6]' },
      { sha: 'a1', subject: 'test(harness): shared story-id matcher — failing [story-h6]' },
      { sha: 'a2', subject: 'feat(harness): story-id-matcher — green [story-h6]' },
      { sha: 'a3', subject: 'test(harness): commit-subject + envelope check — failing [story-h6]' },
      { sha: 'a4', subject: 'feat(harness): commit-subject discipline, draft-aware envelope — green [story-h6]' },
      { sha: 'r1', subject: 'chore(retro): story-h6 retrospective + status fragment [story-h6]' },
    ];
    expect(countChangeBodyCommits(commits, 'h6')).toBe(4);
  });
});

describe('countSlices (R28)', () => {
  // fails if: a `test: — failing` red-half is counted as its own slice — R28 collapses
  // each failing/green pair into one slice so the TDD rhythm doesn't double the envelope.
  it('collapses each test-failing + feat-green pair into one slice', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'a1', subject: 'test(ledger): kind + correctsId — failing [story-4.2a]' },
      { sha: 'a2', subject: 'feat(ledger): kind + correctsId — minimal green [story-4.2a]' },
      { sha: 'a3', subject: 'test(ledger): CorrectionService — input guards — failing [story-4.2a]' },
      { sha: 'a4', subject: 'feat(ledger): CorrectionService — input guards — minimal green [story-4.2a]' },
    ];
    expect(countChangeBodyCommits(commits, '4.2a')).toBe(4);
    expect(countSlices(commits, '4.2a')).toBe(2);
  });

  // fails if: a refactor or an R10 green-on-landing test commit is dropped — both are
  // legitimate standalone slices, not red-halves of a pair.
  it('counts refactor and green-on-landing test commits as their own slices', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'a1', subject: 'test(ledger): amount correction — failing [story-4.2a]' },
      { sha: 'a2', subject: 'feat(ledger): amount correction — minimal green [story-4.2a]' },
      { sha: 'a3', subject: 'test(ledger): core invariants as properties — green on landing [story-4.2a]' },
      { sha: 'a4', subject: 'refactor(ledger): dedupe transaction boilerplate [story-4.2a]' },
    ];
    expect(countSlices(commits, '4.2a')).toBe(3);
  });

  // fails if: countSlices diverges from countChangeBodyCommits for a zero-behaviour (R16)
  // story — such a story has no failing/green pairs, so the R16 4-commit target must hold.
  it('equals countChangeBodyCommits when there are no failing/green pairs (R16 unaffected)', () => {
    const commits: CommitLogEntry[] = [
      { sha: 'p0', subject: 'chore(docs): story-x plan + P1/P2/P3 review [story-x]' },
      { sha: 'a1', subject: 'chore(docs): refresh process doc [story-x]' },
      { sha: 'a2', subject: 'refactor(workflow): empty slice — TDD rhythm note [story-x]' },
      { sha: 'r1', subject: 'chore(retro): story-x retrospective [story-x]' },
    ];
    expect(countSlices(commits, 'x')).toBe(countChangeBodyCommits(commits, 'x'));
    expect(countSlices(commits, 'x')).toBe(2);
  });
});
