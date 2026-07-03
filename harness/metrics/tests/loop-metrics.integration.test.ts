import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initTempRepo, writeAndCommit } from './_helpers/temp-git-repo.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'harness', 'metrics', 'loop-metrics.ts');
const REAL_CSV_PATH = path.join(REPO_ROOT, 'docs', 'metrics', 'loop.csv');

describe('metrics:loop subprocess smoke', () => {
  const TEMP_DIRS: string[] = [];
  let realCsvBefore: string;

  beforeAll(() => {
    realCsvBefore = fs.readFileSync(REAL_CSV_PATH, 'utf8');
  });

  afterAll(() => {
    // fails if: the entrypoint's cwd argument is ignored/dropped and the
    // real repo's docs/metrics/loop.csv is modified again — guards the
    // exact regression #150 reports.
    expect(fs.readFileSync(REAL_CSV_PATH, 'utf8')).toBe(realCsvBefore);
  });

  afterEach(() => {
    for (const dir of TEMP_DIRS.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function buildFixtureRepo(): string {
    const tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    // story-aa: resolvable commit + a retro carrying the Loop metrics heading.
    writeAndCommit(tmpDir, 'docs/plans/story-aa.md', '# Story aa\n\nline2\nline3\nline4\n', 'feat(harness): aa fixture — green [story-aa]');
    writeAndCommit(
      tmpDir,
      'docs/retrospectives/story-aa.md',
      '# Retro aa\n\n## Loop metrics\n\nsome content\n',
      'chore(retro): aa retro [story-aa]',
    );
    // story-bb: plan file present, but no commit anywhere references story-bb — skip case.
    writeAndCommit(tmpDir, 'docs/plans/story-bb.md', '# Story bb\n\nunresolvable\n', 'chore: add bb plan, no story tag');
    return tmpDir;
  }

  // fails if: loop-metrics.ts writes into the real repo tree instead of the
  // cwd it's invoked with (Gherkin Scenario A) — guards script-level cwd/
  // output-path wiring, not the pure lib tested in loop-metrics.test.ts.
  it('writes <tmpDir>/docs/metrics/loop.csv with a header row and one row per fixture story, reporting top-3 + skips on stderr', () => {
    const tmpDir = buildFixtureRepo();

    const result = spawnSync('npx', ['tsx', ENTRYPOINT], { cwd: REPO_ROOT, encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('top-3 weight-ratio offenders:');
    expect(result.stderr).toContain('aa (weight_ratio=1)');
    expect(result.stderr).toContain('skipped stories:');

    const csvPath = path.join(tmpDir, 'docs', 'metrics', 'loop.csv');
    expect(fs.existsSync(csvPath)).toBe(true);
    const csv = fs.readFileSync(csvPath, 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('story_id,plan_loc,diff_loc,commits,weight_ratio,retro_loop_metrics');
    expect(lines).toHaveLength(3);
    expect(lines).toContain('aa,4,4,1,1,true');
    expect(lines[2]).toMatch(/^bb,\d+,n\/a,0,n\/a,false$/);
  });

  // fails if: a story whose commit cannot be resolved is dropped from both
  // the CSV and the skip-report instead of appearing in the CSV as 'n/a'
  // plus a named skip reason — the baseline would then lie by omission
  // (guards loop-metrics.ts's row-emission path end-to-end, isolated from
  // the real repo's history via the fixture built above).
  it('never silently drops an unresolvable story — every skip is named with a reason', () => {
    const tmpDir = buildFixtureRepo();

    const result = spawnSync('npx', ['tsx', ENTRYPOINT], { cwd: REPO_ROOT, encoding: 'utf8' });

    expect(result.stderr).toContain('bb: no merge commit resolved for story id "bb"');

    const csvPath = path.join(tmpDir, 'docs', 'metrics', 'loop.csv');
    const csv = fs.readFileSync(csvPath, 'utf8');
    expect(csv).toMatch(/^bb,\d+,n\/a,/m);
  });
});
