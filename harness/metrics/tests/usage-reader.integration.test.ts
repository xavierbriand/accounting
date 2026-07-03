import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initTempRepo, writeAndCommit } from './_helpers/temp-git-repo.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'harness', 'metrics', 'usage-reader.ts');
const FIXTURE = path.join(REPO_ROOT, 'harness', 'metrics', 'fixtures', 'session-mixed.jsonl');
const REAL_STORY_H4_PATH = path.join(REPO_ROOT, 'docs', 'metrics', 'story-h4.md');

function run(args: string[], cwd: string = REPO_ROOT): ReturnType<typeof spawnSync> {
  return spawnSync('npx', ['tsx', ENTRYPOINT, ...args], { cwd, encoding: 'utf8' });
}

describe('metrics:usage subprocess smoke', () => {
  // fails if: script-level wiring (tsx invocation, argv parsing, path
  // validation call) breaks even though the in-process lib tests pass.
  // R7 scope note: subprocess smoke covers script wiring only; parse/
  // aggregate correctness is covered in-process (usage-reader.test.ts).
  // (Gherkin scenario B: usage reader honesty.)
  it('matches fixture arithmetic and reports the skipped-record count on stdout', () => {
    const result = run([FIXTURE]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('claude-sonnet-5: input=3000 output=600 cache_creation=500 cache_read=1300');
    expect(result.stdout).toContain('claude-fable-5: input=500 output=100 cache_creation=0 cache_read=0');
    expect(result.stdout).toContain('skipped: 4 unrecognized records');
  });

  // fails if: unrecognized argv tokens are silently accepted instead of
  // rejected with usage text — boundary-hygiene rule (entrypoints reject
  // unrecognized argv tokens with usage text).
  it('rejects invocation with no path argument via usage text and a non-zero exit', () => {
    const result = run([]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });

  // fails if: a valid positional path argument masks an unknown trailing
  // flag — main() previously filtered out every `--`-prefixed token before
  // checking the positional count, so `<valid-path> --extra-unexpected-flag`
  // exited 0 silently. Guards the boundary-hygiene claim ("entrypoints
  // reject unrecognized argv tokens with usage text") end-to-end through
  // the real CLI, not just the no-args case above (Phase-4 finding F5).
  it('rejects a valid path argument accompanied by an unknown flag', () => {
    const result = run([FIXTURE, '--extra-unexpected-flag']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });

  describe('symlink refusal', () => {
    const tempFiles: string[] = [];
    afterEach(() => {
      for (const f of tempFiles.splice(0)) {
        if (fs.existsSync(f)) fs.rmSync(f, { force: true });
      }
    });

    // fails if: a symlinked path is followed instead of refused — guards
    // the local validateDbPath-pattern re-implementation end-to-end
    // through the actual CLI entrypoint, not just the pure helper.
    it('refuses a symlinked path argument', () => {
      const target = path.join(os.tmpdir(), `metrics-e2e-target-${Date.now()}.jsonl`);
      const link = path.join(os.tmpdir(), `metrics-e2e-link-${Date.now()}.jsonl`);
      fs.writeFileSync(target, '');
      fs.symlinkSync(target, link);
      tempFiles.push(target, link);

      const result = run([link]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('symbolic link');
    });
  });
});

describe('metrics:story subprocess smoke', () => {
  const TEMP_DIRS: string[] = [];

  beforeAll(() => {
    // fails if: the real repo's docs/metrics/story-h4.md already exists
    // before this test runs — the regression guard below (no story-h4.md
    // appears) would be meaningless against an already-polluted tree.
    expect(fs.existsSync(REAL_STORY_H4_PATH)).toBe(false);
  });

  afterEach(() => {
    for (const dir of TEMP_DIRS.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // fails if: the entrypoint's cwd argument is ignored/dropped and an
    // untracked docs/metrics/story-h4.md appears in the real repo — guards
    // the second regression #150 reports.
    expect(fs.existsSync(REAL_STORY_H4_PATH)).toBe(false);
  });

  // fails if: attribution-window wiring (git log window resolution, real
  // session-file discovery) breaks even though attributeToStory's pure
  // logic is unit-tested. R7 scope note: subprocess smoke covers script
  // wiring only. (Gherkin scenario C: story attribution declares
  // uncertainty.)
  it('writes <tmpDir>/docs/metrics/story-<id>.md with an attribution note', () => {
    const tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(tmpDir, 'touched.txt', 'x\n', 'chore: fixture commit [story-zz]');

    const result = run(['--story', 'zz'], tmpDir);
    expect(result.status).toBe(0);

    const reportPath = path.join(tmpDir, 'docs', 'metrics', 'story-zz.md');
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = fs.readFileSync(reportPath, 'utf8');
    expect(report).toContain('session count:');
    expect(report).toContain('attribution:');
    expect(report).toContain('unattributed sessions');
  });

  it('rejects --story with no id via usage text and a non-zero exit', () => {
    const result = run(['--story']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });

  // fails if: a valid story id accompanied by a trailing unknown flag is
  // silently accepted — same boundary-hygiene gap as the --story mode
  // (Phase-4 finding F5).
  it('rejects a valid story id accompanied by an unknown trailing flag', () => {
    const result = run(['--story', 'h4', '--extra-unexpected-flag']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });
});
