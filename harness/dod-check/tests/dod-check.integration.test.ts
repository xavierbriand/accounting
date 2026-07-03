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

describe('dod-check integration — merge commits are excluded from the subject scan', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    // A side branch whose commit carries the id, merged with an id-less merge
    // subject — mimics the synthetic merge commit GitHub checks out for a
    // pull_request build ("Merge <sha> into <base>").
    git(tmpDir, ['checkout', '-q', '-b', 'side']);
    fs.writeFileSync(path.join(tmpDir, 'side.txt'), 's\n');
    git(tmpDir, ['add', 'side.txt']);
    git(tmpDir, ['commit', '-q', '-m', 'feat(harness): side work — green [story-zz]']);
    git(tmpDir, ['checkout', '-q', 'story-zz']);
    git(tmpDir, ['merge', '--no-ff', '-q', '-m', 'Merge pull request #1 from fork/feature', 'side']);
  });

  // fails if: getCommitLog stops passing --no-merges — the id-less merge
  // subject would be flagged missing-story-id (hard), which is exactly the
  // false positive a GitHub pull_request build hits on its merge commit.
  it('does not flag an id-less merge commit as missing-story-id', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'true' });
    expect(result.stderr).not.toContain('missing-story-id');
    expect(result.stderr).not.toContain('Merge pull request');
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

describe('dod-check integration — under-min vs over-max envelope labels are distinguishable (Scenario B)', () => {
  function commitStoryZzCommits(tmpDir: string, extraCount: number): void {
    for (let i = 0; i < extraCount; i++) {
      fs.writeFileSync(path.join(tmpDir, `extra-${i}.txt`), `${i}\n`);
      git(tmpDir, ['add', `extra-${i}.txt`]);
      git(tmpDir, ['commit', '-q', '-m', `feat(harness): extra slice ${i} — green [story-zz]`]);
    }
  }

  // fails if: an under-min count (3, below R13's min of 6) renders the old
  // combined "envelope R13 (6-10)" wording instead of the distinguishable
  // "under the R13 (6-10) target (advisory)" label, or gates the exit code
  // once out of draft — guards Scenario B's under-count leg end-to-end.
  it('under-min (3 commits) is labelled "under ... target (advisory)" and exits 0 out of draft', () => {
    const tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    commitStoryZzCommits(tmpDir, 1); // 2 story commits total: under R13's min of 6

    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).toMatch(/under the R13 \(6–10\) target \(advisory\)/);
    expect(result.stderr).not.toContain('(advisory — PR is draft)');
  });

  // fails if: an over-max count (12, above R13's max of 10) renders the old
  // combined wording instead of "over the R13 (6-10) envelope", or stops
  // gating the exit code once out of draft — guards Scenario B's
  // over-count leg staying hard.
  it('over-max (12 commits) is labelled "over ... envelope" and exits 1 out of draft', () => {
    const tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    commitStoryZzCommits(tmpDir, 11); // 12 story commits total: over R13's max of 10

    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).toMatch(/over the R13 \(6–10\) envelope/);
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

describe('dod-check integration — pr-tbd via DOD_PR_BODY_FILE seam (F5)', () => {
  let tmpDir: string;
  let bodyFile: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);

    bodyFile = path.join(tmpDir, 'pr-body-fixture.md');
    fs.writeFileSync(
      bodyFile,
      [
        '## 1. Story',
        '',
        'filled in',
        '',
        '## 2. Intent',
        '',
        'TBD',
        '',
        '## 10. Merge checklist',
        '',
        '- [ ] lint / build / test green on CI',
      ].join('\n'),
      'utf8',
    );
  });

  // fails if: the pr-tbd check is not exercised at the subprocess tier via
  // DOD_PR_BODY_FILE, or a standalone TBD placeholder in a non-checklist
  // section fails to fail the process once out of draft — guards F5's seam
  // end-to-end (Scenario B's TBD leg was previously unit-only).
  it('advisory pr-tbd → exit 0 while the PR is a draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'true',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('pr-tbd');
    expect(result.stderr).toContain('(advisory — PR is draft)');
  });

  it('hard pr-tbd → exit 1 once the PR is out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('pr-tbd');
    expect(result.stderr).not.toContain('(advisory — PR is draft)');
  });
});

describe('dod-check integration — degradation reporting (F4)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
  });

  // fails if: a gh/git failure in resolvePrBody is swallowed with no
  // reported degradation line — guards F4's "never silent" contract for the
  // pr-tbd resolution path. This temp repo has no git remote, so `gh pr
  // view` fails with "no git remotes found".
  it('reports a degradation line when resolvePrBody cannot reach gh', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], { DOD_PR_DRAFT: 'true' });
    expect(result.stderr).toContain('degraded:');
    expect(result.stderr.toLowerCase()).toContain('pr body');
  });

  // fails if: --json mode drops the degradation report instead of
  // surfacing it as a `degraded` field alongside `findings` — guards F4's
  // JSON-mode surface.
  it('includes a degraded array in --json output alongside findings', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd', '--json'], { DOD_PR_DRAFT: 'true' });
    const parsed = JSON.parse(result.stdout) as { findings: unknown[]; degraded: string[] };
    expect(Array.isArray(parsed.degraded)).toBe(true);
    expect(parsed.degraded.some((d) => d.toLowerCase().includes('pr body'))).toBe(true);
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

describe('dod-check integration — --json covers every DodFinding kind (F6, R8)', () => {
  let tmpDir: string;
  let bodyFile: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(
      tmpDir,
      'zz',
      [
        '## Slice plan (R13: target 6-10 commits)',
        '',
        '```gherkin',
        'Scenario: a plan-only scenario absent from features',
        '  Given nothing relevant',
        '```',
      ].join('\n'),
    );
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);

    fs.mkdirSync(path.join(tmpDir, 'src', 'core'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'core', 'thing.ts'),
      'export function thing(): void {\n  // TODO: finish this\n}\n',
    );
    git(tmpDir, ['add', 'src/core/thing.ts']);
    git(tmpDir, ['commit', '-q', '-m', 'chore: a commit with no story id reference']);

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
      "import { Given } from 'quickpickle';\nGiven('a resolvable step', function () {});\nGiven('a step nobody calls', function () {});\n",
    );
    git(tmpDir, ['add', 'tests']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): widget — failing [story-zz]']);

    bodyFile = path.join(tmpDir, 'pr-body-fixture.md');
    fs.writeFileSync(
      bodyFile,
      ['## 1. Story', '', 'TBD', '', '## 10. Merge checklist', '', '- [ ] done'].join('\n'),
      'utf8',
    );
  });

  // fails if: any DodFinding kind is missing from the --json findings array,
  // or a finding's kind-specific fields deviate from the discriminated
  // union — guards R8 mock-diversity across the full finding-kind set
  // (missing-story-id, commit-envelope, todo-comment, pr-tbd,
  // unmapped-scenario, orphan-step).
  it('emits every non-story-id-unresolved DodFinding kind with its documented shape', () => {
    const result = runDodCheck(tmpDir, ['--json'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    const parsed = JSON.parse(result.stdout) as { findings: Array<Record<string, unknown>>; degraded: string[] };
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(Array.isArray(parsed.degraded)).toBe(true);

    const byKind = (kind: string): Record<string, unknown> | undefined =>
      parsed.findings.find((f) => f['kind'] === kind);

    const missingStoryId = byKind('missing-story-id');
    expect(missingStoryId).toBeDefined();
    expect(typeof missingStoryId?.['sha']).toBe('string');
    expect(typeof missingStoryId?.['subject']).toBe('string');

    const commitEnvelope = byKind('commit-envelope');
    expect(commitEnvelope).toBeDefined();
    expect(typeof commitEnvelope?.['count']).toBe('number');

    const todoComment = byKind('todo-comment');
    expect(todoComment).toBeDefined();
    expect(typeof todoComment?.['file']).toBe('string');
    expect(typeof todoComment?.['line']).toBe('number');

    const prTbd = byKind('pr-tbd');
    expect(prTbd).toBeDefined();
    expect(typeof prTbd?.['section']).toBe('string');

    const unmappedScenario = byKind('unmapped-scenario');
    expect(unmappedScenario).toBeDefined();
    expect(typeof unmappedScenario?.['scenario']).toBe('string');
    expect(typeof unmappedScenario?.['reason']).toBe('string');

    const orphanStep = byKind('orphan-step');
    expect(orphanStep).toBeDefined();
    expect(typeof orphanStep?.['pattern']).toBe('string');
    expect(typeof orphanStep?.['file']).toBe('string');
  });
});

describe('dod-check integration — --json covers story-id-unresolved (F6, R8)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'not-a-story-branch']);
  });

  // fails if: story-id-unresolved is absent from the --json shape assertions
  // — guards the last DodFinding kind (R8), distinct from the others because
  // it short-circuits the commit-subject check rather than co-occurring.
  it('emits story-id-unresolved with its documented shape when no story- branch and no plan file resolve', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits', '--json'], { DOD_PR_DRAFT: 'true' });
    const parsed = JSON.parse(result.stdout) as { findings: Array<Record<string, unknown>> };
    const finding = parsed.findings.find((f) => f['kind'] === 'story-id-unresolved');
    expect(finding).toBeDefined();
    expect(typeof finding?.['reason']).toBe('string');
  });
});
