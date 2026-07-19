import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractTrySection, extractTryBullets, checkTryFunnel } from '../lib/try-funnel.js';

const FIXTURE_PATH = path.join(import.meta.dirname, '..', 'fixtures', 'retros', 'try-funnel-mixed.md');

describe('extractTrySection', () => {
  // fails if the parser can't isolate the `## Try` region from its
  // sibling `## Keep` / `## Change` / `## Loop metrics` sections — every
  // downstream bullet-scan and finding would then draw from the wrong
  // section (Story h13 slice 4).
  it('isolates the Try section from a fixture retro, excluding neighbouring sections', () => {
    const content = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const section = extractTrySection(content);
    expect(section).not.toBeNull();
    expect(section).toContain('#164');
    expect(section).toContain('maintenance-sub-loop.md');
    expect(section).not.toContain('Fixture keep item');
    expect(section).not.toContain('Fixture change item');
    expect(section).not.toContain('Loop metrics line');
  });

  it('returns null when the retro has no ## Try heading', () => {
    expect(extractTrySection('# Story\n\n## Keep\n\n- something\n')).toBeNull();
  });
});

describe('extractTryBullets', () => {
  // fails if the bullet-grouping logic drops a continuation line onto the
  // wrong bullet, or splits/merges bullets incorrectly — every downstream
  // finding depends on one bullet = one Try item (Story h13 slice 4).
  it('extracts exactly the four fixture Try bullets', () => {
    const content = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const section = extractTrySection(content);
    const bullets = extractTryBullets(section ?? '');
    expect(bullets).toHaveLength(4);
    expect(bullets[0]).toContain('#164');
    expect(bullets[1]).toContain('maintenance-sub-loop.md');
    expect(bullets[2]).toContain('neither a file citation nor an issue number');
    expect(bullets[3]).toContain('No new § 8 rule minted');
  });

  it('returns an empty array for an empty section', () => {
    expect(extractTryBullets('')).toEqual([]);
  });

  it('joins a multi-line bullet into a single entry', () => {
    const bullets = extractTryBullets('\n- First line of one bullet\n  continued on a second line.\n');
    expect(bullets).toEqual(['First line of one bullet continued on a second line.']);
  });
});

describe('checkTryFunnel', () => {
  // fails if a bullet with only an issue reference (`#164`) is
  // incorrectly flagged — an issue link is a valid funnel form on its own
  // (Gherkin scenario 3, first fixture leg).
  it('does not flag a bullet with an issue reference', () => {
    const findings = checkTryFunnel(['Filed as #164 for later.']);
    expect(findings).toEqual([]);
  });

  // fails if a bullet with only a backtick file citation is incorrectly
  // flagged — a file citation is a valid funnel form on its own (Gherkin
  // scenario 3, second fixture leg).
  it('does not flag a bullet with a backtick file citation', () => {
    const findings = checkTryFunnel(['See `docs/templates/maintenance-sub-loop.md` for detail.']);
    expect(findings).toEqual([]);
  });

  // fails if a bullet with only a markdown link is incorrectly flagged —
  // a markdown link to a repo file is the other documented citation form.
  it('does not flag a bullet with a markdown link citation', () => {
    const findings = checkTryFunnel(['See [the plan](docs/plans/story-h13.md) for detail.']);
    expect(findings).toEqual([]);
  });

  // fails if the check misses the exact failure mode it exists to catch —
  // a bullet with neither form (Gherkin scenario 3, third fixture leg).
  it('flags a bullet with neither a file citation nor an issue reference', () => {
    const findings = checkTryFunnel(['This has neither a file citation nor an issue number.']);
    expect(findings).toEqual([
      {
        kind: 'try-unfunneled',
        bullet: 'This has neither a file citation nor an issue number.',
      },
    ]);
  });

  // fails if the "No new § 8 rule minted" close-out exemption isn't
  // recognized, or is recognized too broadly (over-matching an unrelated
  // bullet) — the recurring close-out phrase family must be exempt without
  // swallowing real un-funneled bullets (Story h13 slice 4).
  it('exempts the "No new § 8 rule minted" close-out phrase family', () => {
    expect(checkTryFunnel(['No new § 8 rule minted.'])).toEqual([]);
    expect(
      checkTryFunnel(['No new § 8 rule minted — the demotions are spec-level and reversible.']),
    ).toEqual([]);
    expect(checkTryFunnel(['No new rule minted — this story consumed existing rules.'])).toEqual([]);
  });

  it('processes the fixture bullets end to end — exactly one unfunneled finding', () => {
    const content = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const bullets = extractTryBullets(extractTrySection(content) ?? '');
    const findings = checkTryFunnel(bullets);
    expect(findings).toHaveLength(1);
    expect(findings[0].bullet).toContain('neither a file citation nor an issue number');
  });
});
