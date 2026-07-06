import { buildStoryIdRegExp } from '../../lib/story-id-matcher.js';

export type CommitLogEntry = {
  sha: string;
  subject: string;
};

export type MissingStoryIdFinding = {
  kind: 'missing-story-id';
  sha: string;
  subject: string;
};

export type EnvelopeRule = {
  rule: 'R13' | 'R14' | 'R16';
  min: number;
  max: number;
};

export type CommitEnvelopeFinding = {
  kind: 'commit-envelope';
  count: number;
  rule: EnvelopeRule['rule'] | null;
  min: number | null;
  max: number | null;
};

export function checkCommitSubjects(
  commits: CommitLogEntry[],
  storyId: string,
): MissingStoryIdFinding[] {
  const pattern = buildStoryIdRegExp(storyId);
  const findings: MissingStoryIdFinding[] = [];
  for (const commit of commits) {
    if (!pattern.test(commit.subject)) {
      findings.push({ kind: 'missing-story-id', sha: commit.sha, subject: commit.subject });
    }
  }
  return findings;
}

const SLICE_PLAN_HEADING = /^## (?:Slice plan\b|Sizing (?:&|and) commits\b)[^\n]*/m;
const ENVELOPE_TOKEN_PATTERN = /\bR13\b|\bR14\b|\bR16\b/;

const ENVELOPE_RANGES: Record<EnvelopeRule['rule'], { min: number; max: number }> = {
  R13: { min: 6, max: 10 },
  R14: { min: 5, max: 7 },
  R16: { min: 4, max: 4 },
};

export function parseEnvelopeRule(planContent: string): EnvelopeRule | null {
  const headingMatch = SLICE_PLAN_HEADING.exec(planContent);
  if (!headingMatch) {
    return null;
  }
  const regionStart = headingMatch.index;
  const nextSection = planContent.indexOf('\n## ', regionStart + headingMatch[0].length);
  const region =
    nextSection === -1 ? planContent.slice(regionStart) : planContent.slice(regionStart, nextSection);

  const tokenMatch = ENVELOPE_TOKEN_PATTERN.exec(region);
  if (!tokenMatch) {
    return null;
  }
  const rule = tokenMatch[0] as EnvelopeRule['rule'];
  const range = ENVELOPE_RANGES[rule];
  return { rule, min: range.min, max: range.max };
}

const PREP_COMMIT_SUBJECT = /^chore\(docs\):.*\bplan \+ P1\/P2\/P3 review\b/;
const RETRO_COMMIT_SUBJECT = /^chore\(retro\)/;

export function countChangeBodyCommits(commits: CommitLogEntry[], storyId: string): number {
  const pattern = buildStoryIdRegExp(storyId);
  return commits.filter(
    (commit) =>
      pattern.test(commit.subject) &&
      !PREP_COMMIT_SUBJECT.test(commit.subject) &&
      !RETRO_COMMIT_SUBJECT.test(commit.subject),
  ).length;
}

// A red-half commit: a `test(...)` subject whose status marker is `failing`, optionally
// followed by a story-id tag (`[story-x]` / `(Story x)`). Anchoring `failing` to the end
// (modulo the tag) avoids false-matching a scenario that merely contains the word "failing".
const FAILING_TEST_SUBJECT = /^test\b[\s\S]*\bfailing\b\s*(?:[[(][^\n]*)?$/i;

// R28 (story-4.2a): the envelope counts *slices*, not raw commits. The TDD rhythm (§6.4)
// splits each behaviour into a `test: … — failing` + `feat: … — minimal green` pair;
// collapsing the red half into its green partner yields one slice per behaviour. `refactor:`
// commits and R10 green-on-landing `test:` commits stand as their own slices. For a
// zero-behaviour-change (R16) story — which has no failing/green pairs — this equals
// countChangeBodyCommits, so the R16 "4 change-body commits" target is unaffected.
export function countSlices(commits: CommitLogEntry[], storyId: string): number {
  const pattern = buildStoryIdRegExp(storyId);
  return commits.filter(
    (commit) =>
      pattern.test(commit.subject) &&
      !PREP_COMMIT_SUBJECT.test(commit.subject) &&
      !RETRO_COMMIT_SUBJECT.test(commit.subject) &&
      !FAILING_TEST_SUBJECT.test(commit.subject),
  ).length;
}

export function checkCommitEnvelope(
  count: number,
  envelope: EnvelopeRule | null,
): CommitEnvelopeFinding | null {
  if (envelope === null) {
    return { kind: 'commit-envelope', count, rule: null, min: null, max: null };
  }
  if (count < envelope.min || count > envelope.max) {
    return { kind: 'commit-envelope', count, rule: envelope.rule, min: envelope.min, max: envelope.max };
  }
  return null;
}
