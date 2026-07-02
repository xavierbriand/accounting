import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'harness', 'dod-check', 'dod-check.ts');

function runDodCheck(cwd: string, extraArgs: string[] = [], env: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  return spawnSync('npx', ['tsx', ENTRYPOINT, ...extraArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function initTempRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-check-e2e-'));
  git(tmpDir, ['init', '-q']);
  git(tmpDir, ['config', 'user.email', 'fixture@example.com']);
  git(tmpDir, ['config', 'user.name', 'Fixture']);
  // Disable commit signing for this hermetic temp repo — the global git
  // config on this machine signs via an SSH agent (1Password), which is
  // unrelated to what this test exercises and can flake independently.
  git(tmpDir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(tmpDir, 'base.txt'), 'base\n');
  git(tmpDir, ['add', 'base.txt']);
  git(tmpDir, ['commit', '-q', '-m', 'chore: base commit']);
  git(tmpDir, ['branch', 'origin/main']);
  return tmpDir;
}

function writePlan(tmpDir: string, storyId: string, planBody: string): void {
  const plansDir = path.join(tmpDir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(path.join(plansDir, `story-${storyId}.md`), planBody, 'utf8');
}

const TEMP_DIRS: string[] = [];

afterEach(() => {
  for (const dir of TEMP_DIRS.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('dod-check integration — commit-subject discipline, draft-aware (Scenario A)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    fs.writeFileSync(path.join(tmpDir, 'missing-id.txt'), 'x\n');
    git(tmpDir, ['add', 'missing-id.txt']);
    git(tmpDir, ['commit', '-q', '-m', 'chore: a commit with no story id reference']);
  });

  // fails if: a subject missing the story id is not flagged, or the
  // envelope finding fails a draft PR (guards commit-subject.ts presence +
  // envelope paths and the entrypoint draft-aware exit).
  it('reports missing-story-id (hard) and an advisory envelope finding while the PR is a draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'true' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing-story-id');
    expect(result.stderr).toContain('chore: a commit with no story id reference');
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).toContain('(advisory — PR is draft)');
  });

  // fails if: the envelope finding does not become a hard failure once the
  // PR is out of draft — guards the draft-aware exit-code gate end-to-end.
  it('the envelope finding becomes a hard failure once the PR is out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).not.toContain('(advisory — PR is draft)');
  });
});

describe('dod-check integration — advisory-only envelope does not fail a draft PR', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
  });

  // fails if: an advisory-only finding (envelope, count=1, outside 6-10)
  // fails a draft PR on its own — guards "does not fail on its own".
  it('a commit count outside 6-10 does not fail while the PR is a draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'true' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).toContain('(advisory — PR is draft)');
  });
});

describe('dod-check integration — TODO/TBD honesty (Scenario B)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    fs.mkdirSync(path.join(tmpDir, 'src', 'core'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'core', 'thing.ts'),
      'export function thing(): void {\n  // TODO: finish this\n}\n',
    );
    git(tmpDir, ['add', 'src/core/thing.ts']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): thing — failing [story-zz]']);
  });

  // fails if: a TODO is missed, or a checklist placeholder is a false
  // positive — guards the todo-comment scanner end-to-end.
  it('reports the TODO with its file and line', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('todo-comment');
    expect(result.stderr).toContain('src/core/thing.ts:2');
  });
});

describe('dod-check integration — Gherkin↔step existence mapping (Scenario C)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    const featuresDir = path.join(tmpDir, 'tests', 'features');
    const stepsDir = path.join(featuresDir, 'steps');
    fs.mkdirSync(stepsDir, { recursive: true });
    fs.writeFileSync(
      path.join(featuresDir, 'widget.feature'),
      [
        'Feature: widget',
        '',
        '  Scenario: unmapped step scenario',
        '    Given a step with no matching def',
        '',
        '  Scenario: clean scenario',
        '    Given a resolvable step',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(stepsDir, 'widget.steps.ts'),
      "import { Given } from 'quickpickle';\nGiven('a resolvable step', function () {});\n",
    );
    git(tmpDir, ['add', 'tests']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): widget — failing [story-zz]']);
  });

  // fails if: an unmapped scenario is silently passed, or a resolvable step
  // is falsely flagged — guards checkGherkinMap end-to-end via the real CLI.
  it('reports the unmapped-scenario finding and exits 1 (hard, always)', () => {
    const result = runDodCheck(tmpDir, ['--check', 'gherkin'], { DOD_PR_DRAFT: 'true' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unmapped-scenario');
    expect(result.stderr).toContain('unmapped step scenario');
    expect(result.stderr).not.toContain('clean scenario');
  });
});

describe('dod-check integration — --json output shape', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    fs.writeFileSync(path.join(tmpDir, 'x.txt'), 'x\n');
    git(tmpDir, ['add', 'x.txt']);
    git(tmpDir, ['commit', '-q', '-m', 'chore: missing id']);
  });

  // fails if: --json emits a shape that deviates from the documented
  // discriminated union (R8 mock-diversity gap).
  it('emits valid JSON whose finding matches the documented missing-story-id shape', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits', '--json'], { DOD_PR_DRAFT: 'true' });
    const parsed = JSON.parse(result.stdout) as { findings: Array<Record<string, unknown>> };
    expect(Array.isArray(parsed.findings)).toBe(true);
    const finding = parsed.findings.find((f) => f['kind'] === 'missing-story-id');
    expect(finding).toBeDefined();
    expect(typeof finding?.['sha']).toBe('string');
    expect(typeof finding?.['subject']).toBe('string');
  });
});
