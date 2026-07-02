import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkCommitSubjects,
  parseEnvelopeRule,
  checkCommitEnvelope,
  type CommitLogEntry,
} from '../lib/commit-subject.js';

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
});
