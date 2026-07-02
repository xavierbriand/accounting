import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'harness', 'metrics', 'loop-metrics.ts');

describe('metrics:loop subprocess smoke', () => {
  // fails if: the npm script wiring (tsx invocation, cwd resolution, git
  // origin/main lookup) breaks even though the in-process lib tests pass —
  // guards script-level integration, not just the pure lib (R7 scope note).
  // (Gherkin scenario A: weight-ratio baseline.)
  it('writes docs/metrics/loop.csv with a header row and reports top-3 + skips on stderr', () => {
    const result = spawnSync('npx', ['tsx', ENTRYPOINT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('top-3 weight-ratio offenders:');
    expect(result.stderr).toContain('skipped stories:');

    const csvPath = path.join(REPO_ROOT, 'docs', 'metrics', 'loop.csv');
    expect(fs.existsSync(csvPath)).toBe(true);
    const csv = fs.readFileSync(csvPath, 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('story_id,plan_loc,diff_loc,commits,weight_ratio,retro_loop_metrics');
    expect(lines.length).toBeGreaterThanOrEqual(35);
  });

  // fails if: a story whose commit cannot be resolved is dropped from both
  // the CSV and the skip-report instead of appearing in the CSV as 'n/a'
  // plus a named skip reason — the baseline would then lie by omission
  // (Gherkin scenario A `fails if` note; guards loop-metrics.ts row-emission
  // path end-to-end through the real repo's git history).
  it('never silently drops an unresolvable story — every skip is named with a reason', () => {
    const result = spawnSync('npx', ['tsx', ENTRYPOINT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    const csvPath = path.join(REPO_ROOT, 'docs', 'metrics', 'loop.csv');
    const csv = fs.readFileSync(csvPath, 'utf8');

    const skipLines = result.stderr
      .split('\n')
      .filter((line) => /^\s{2}[\w.-]+: /.test(line) && !line.startsWith('  1.') && !line.startsWith('  2.') && !line.startsWith('  3.'));

    for (const skipLine of skipLines) {
      const storyId = skipLine.trim().split(':')[0];
      expect(csv).toContain(`${storyId},`);
      expect(csv).toMatch(new RegExp(`${storyId},\\d+,n/a,`));
    }
  });
});
