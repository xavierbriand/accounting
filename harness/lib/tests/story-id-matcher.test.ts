import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import { buildStoryIdRegExp, buildStoryIdGitGrepPattern } from '../story-id-matcher.js';

describe('buildStoryIdRegExp', () => {
  // fails if: the bracket-style subject ([story-h1]) is not matched — guards
  // the harness dod-check commit-subject convention (Scenario D).
  it('matches the bracket form [story-<id>]', () => {
    const pattern = buildStoryIdRegExp('h1');
    expect(pattern.test('feat(harness): thing [story-h1]')).toBe(true);
  });

  // fails if: bare "story-<id>" on a word boundary is not matched — guards
  // the pre-bracket commit convention still present in history.
  it('matches the bare form story-<id> on a word boundary', () => {
    const pattern = buildStoryIdRegExp('h1');
    expect(pattern.test('story-h1: drift-scan automation')).toBe(true);
  });

  // fails if: the capitalized "Story <id>" (space) convention used in
  // pre-story-D history is not matched.
  it('matches the capitalized "Story <id>" form', () => {
    const pattern = buildStoryIdRegExp('3.1');
    expect(pattern.test('Story 3.1: Versioned Split Rules')).toBe(true);
  });

  // fails if: a single-letter id like "A" matches unrelated substrings —
  // guards the word-boundary anchoring for short ids.
  it('matches a single-letter story id without false positives', () => {
    const pattern = buildStoryIdRegExp('A');
    expect(pattern.test('story-A: inline new-category creation')).toBe(true);
    expect(pattern.test('chore(docs): maintenance sub-loop notes')).toBe(false);
  });

  // fails if: a compound id like story-h1-x false-matches story-h1 — guards
  // the "no false-match on a longer compound id" invariant.
  it('does not false-match a compound story-<id>-x against story-<id>', () => {
    const pattern = buildStoryIdRegExp('h1');
    expect(pattern.test('story-h1-x: unrelated compound id')).toBe(false);
  });

  // fails if: story-h1 and story-h2 are confused — guards prefix-collision
  // boundary anchoring.
  it('does not confuse story-h1 with story-h2', () => {
    const patternH1 = buildStoryIdRegExp('h1');
    const patternH2 = buildStoryIdRegExp('h2');
    expect(patternH1.test('story-h2: promote drift-scan findings to hard')).toBe(false);
    expect(patternH2.test('story-h2: promote drift-scan findings to hard')).toBe(true);
  });

  it('escapes regex metacharacters in the story id', () => {
    const pattern = buildStoryIdRegExp('3.1');
    expect(pattern.test('story-3.1: something')).toBe(true);
    expect(pattern.test('story-3X1: something')).toBe(false);
  });
});

describe('buildStoryIdGitGrepPattern', () => {
  // fails if: the ERE string doesn't work as an actual git --grep pattern —
  // guards the usage-reader.ts consumer path end-to-end via a real git call.
  it('matches a bracket-form subject via a real git log --extended-regexp --grep', () => {
    const pattern = buildStoryIdGitGrepPattern('h1');
    const output = execFileSync(
      'git',
      ['log', '-1', '--format=%H', '--extended-regexp', `--grep=${pattern}`, '-i', '--all'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(output.trim().length).toBeGreaterThan(0);
  });

  it('escapes regex metacharacters for the ERE grep pattern', () => {
    const pattern = buildStoryIdGitGrepPattern('3.1');
    expect(pattern).toContain('3\\.1');
  });
});

describe('story-id-matcher property tests', () => {
  // Generator scoped to realistic story-id shapes actually used in this
  // repo's history (h1, 3.1, A, maint-18): alphanumeric, optionally
  // dot/hyphen-separated, always ending in an alphanumeric character. Ids
  // ending in a bare separator (e.g. "0.") are not a real convention and
  // are excluded — a trailing non-word char already sits on a \b boundary
  // in JS regex, which is a known property of \b, not a matcher defect.
  const realisticStoryId = fc
    .stringMatching(/^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,7})?[a-zA-Z0-9]$/)
    .filter((s) => s.length > 0);

  // fails if: any generated alphanumeric-with-dot-hyphen story id fails to
  // match its own canonical bracket subject form — the matcher must be
  // reflexive for the whole id space it claims to support.
  it('buildStoryIdRegExp always matches its own canonical bracket subject', () => {
    fc.assert(
      fc.property(realisticStoryId, (storyId) => {
        const pattern = buildStoryIdRegExp(storyId);
        expect(pattern.test(`feat(harness): thing [story-${storyId}]`)).toBe(true);
      }),
    );
  });

  // fails if: appending a suffix character to a generated id causes the
  // original id's pattern to false-match the compound id's bare-form subject.
  it('buildStoryIdRegExp never matches a compound id with an appended suffix', () => {
    fc.assert(
      fc.property(realisticStoryId, fc.stringMatching(/^[a-zA-Z0-9]$/), (storyId, suffix) => {
        const pattern = buildStoryIdRegExp(storyId);
        expect(pattern.test(`story-${storyId}${suffix}: unrelated`)).toBe(false);
      }),
    );
  });
});
