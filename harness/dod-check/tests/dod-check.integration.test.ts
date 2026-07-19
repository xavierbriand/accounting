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

function writeRetro(tmpDir: string, storyId: string, retroBody: string): void {
  const retroDir = path.join(tmpDir, 'docs', 'retrospectives');
  fs.mkdirSync(retroDir, { recursive: true });
  fs.writeFileSync(path.join(retroDir, `story-${storyId}.md`), retroBody, 'utf8');
}

const TEMP_DIRS: string[] = [];

afterEach(() => {
  for (const dir of TEMP_DIRS.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('dod-check integration — missing-story-id is hard (Scenario A / C)', () => {
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

  // fails if: a subject missing the story id is not flagged as hard, or the
  // co-occurring under-min envelope is not rendered as always-advisory
  // (guards HARD_KINDS + the under-min always-advisory label).
  it('flags missing-story-id (hard, exit 1); the under-min envelope is always-advisory', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'true' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing-story-id');
    expect(result.stderr).toContain('chore: a commit with no story id reference');
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).toMatch(/under the R13 \(6–10\) target \(advisory\)/);
  });

  // fails if: missing-story-id stops being hard out of draft, or the under-min
  // envelope wrongly acquires the draft-aware suffix (it is always-advisory).
  it('missing-story-id stays hard out of draft; the under-min envelope carries no draft suffix', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing-story-id');
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

describe('dod-check integration — under-min envelope is always-advisory (exits 0 even out of draft)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
  });

  // fails if: an under-min commit count (1 < 6) gates the exit code out of
  // draft — the regression that would self-block small stories like h7 itself
  // (guards the isAlwaysAdvisory count<min branch + the exit partition).
  it('an under-min commit count is (advisory) and exits 0 out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('commit-envelope');
    expect(result.stderr).toMatch(/under the R13 \(6–10\) target \(advisory\)/);
  });
});

describe('dod-check integration — a non-story PR does not hard-fail (Scenario A, #151 regression)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    // A Dependabot/chore-shaped branch: no story- name, no plan file added.
    git(tmpDir, ['checkout', '-q', '-b', 'chore-loop-csv']);
    fs.writeFileSync(path.join(tmpDir, 'change.txt'), 'x\n');
    git(tmpDir, ['add', 'change.txt']);
    git(tmpDir, ['commit', '-q', '-m', 'chore(metrics): regenerate loop.csv']);
  });

  // fails if: story-id-unresolved gates the exit code out of draft — the #151
  // regression that hard-failed every Dependabot/chore PR (guards
  // isAlwaysAdvisory's story-id-unresolved branch + the exit partition).
  it('reports story-id-unresolved as (advisory) and exits 0 out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('story-id-unresolved');
    expect(result.stderr).toContain('(advisory)');
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

  // fails if: a plan with no declared envelope rule (no `## Slice plan` heading)
  // gates the exit code out of draft — guards Scenario C's not-declared leg as
  // always-advisory end-to-end (rule===null branch of isAlwaysAdvisory).
  it('a not-declared envelope is "not declared in plan (advisory)" and exits 0 out of draft', () => {
    const tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    // Plan present, but no `## Slice plan` heading → no envelope rule declared.
    writePlan(tmpDir, 'zz', '# Story zz\n\nNo slice-plan heading here.\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'commits'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/envelope not declared in plan \(advisory\)/);
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

describe('dod-check integration — pr-tbd catches the "Pending" placeholder variant (#152 regression)', () => {
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
        '## 8. Sonnet learnings',
        '',
        '_Pending Phase 3/5_',
        '',
        '## 10. Merge checklist',
        '',
        '- [ ] lint / build / test green on CI',
      ].join('\n'),
      'utf8',
    );
  });

  // fails if: the widened TBD_PLACEHOLDER_LINE regex misses a standalone
  // "_Pending Phase 3/5_" placeholder at the subprocess tier — guards the
  // #152 regression end-to-end via the real CLI and DOD_PR_BODY_FILE seam.
  it('hard pr-tbd fires for "_Pending Phase 3/5_" once the PR is out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('pr-tbd');
    expect(result.stderr).toContain('8. Sonnet learnings');
  });

  it('advisory pr-tbd for "_Pending Phase 3/5_" while the PR is a draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'true',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('pr-tbd');
    expect(result.stderr).toContain('(advisory — PR is draft)');
  });
});

describe('dod-check integration — merge-checklist-unticked draft-aware (#149 regression, scenario 3)', () => {
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
        '## 10. Merge checklist',
        '',
        '- [ ] `lint` / `build` / `test` green on CI',
        '- [ ] Retrospective file committed',
        '- [ ] PR out of draft',
        '- [ ] User approval',
      ].join('\n'),
      'utf8',
    );
  });

  // fails if: an unticked substantive § 10 row does not fire
  // merge-checklist-unticked, or the check fails to gate the exit code once
  // the PR is ready-for-review — guards the #149 regression end-to-end.
  it('fires and exits 1 once the PR is out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('merge-checklist-unticked');
  });

  // fails if: the same finding wrongly gates the exit code while the PR is
  // still a draft, or drops the draft-aware suffix — guards draft-awareness.
  it('is advisory and exits 0 while the PR is a draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'true',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('merge-checklist-unticked');
    expect(result.stderr).toContain('(advisory — PR is draft)');
  });
});

describe('dod-check integration — merge-checklist § 10 fully ticked except construction rows (scenario 4)', () => {
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
        '## 10. Merge checklist',
        '',
        '- [x] `lint` / `build` / `test` green on CI',
        '- [ ] PR out of draft',
        '- [x] Retrospective file committed',
        '- [x] All suggestion-log items resolved',
        '- [x] All phase-4 retro-checks pass',
        '- [ ] User approval',
      ].join('\n'),
      'utf8',
    );
  });

  // fails if: the exclusion of the two construction-unticked rows breaks and
  // a ready PR whose only unticked rows are "PR out of draft" / "User
  // approval" false-hard-fails — guards the exact regression a draft-aware
  // hard gate would otherwise cause (h7's "never ship a hard gate cold").
  it('reports no merge-checklist-unticked finding and exits 0 once the PR is out of draft', () => {
    const result = runDodCheck(tmpDir, ['--check', 'todo-tbd'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('merge-checklist-unticked');
  });
});

describe('dod-check integration — phase-evidence-missing advisory check (ddd-1/#153 regression, scenario 5)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
  });

  // fails if: a ticked § 10 phase-4 box with zero § 7 P4 rows fails to fire,
  // or the finding gates the exit code — guards the ddd-1/#153 regression
  // (phase-4 ticked with no code-reviewer run evidenced) end-to-end, while
  // staying always-advisory.
  it('fires (advisory) and exits 0 when no § 7 P4 row evidences the ticked phase-4 claim', () => {
    const bodyFile = path.join(tmpDir, 'pr-body-fixture.md');
    fs.writeFileSync(
      bodyFile,
      [
        '## 7. Suggestion log',
        '',
        '| Phase | Suggestion | Resolution | Link / Reason |',
        '| --- | --- | --- | --- |',
        '| P1 | some finding | adopted | - |',
        '',
        '## 10. Merge checklist',
        '',
        '- [x] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
      ].join('\n'),
      'utf8',
    );

    const result = runDodCheck(tmpDir, ['--check', 'phase-evidence'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('phase-evidence-missing');
    expect(result.stderr).toContain('(advisory)');
  });

  // fails if: a § 7 row carrying `| P4 |` in the Phase column is not
  // recognized as evidence, wrongly still firing the finding.
  it('reports nothing when a § 7 P4 suggestion-log row is present', () => {
    const bodyFile = path.join(tmpDir, 'pr-body-fixture.md');
    fs.writeFileSync(
      bodyFile,
      [
        '## 7. Suggestion log',
        '',
        '| Phase | Suggestion | Resolution | Link / Reason |',
        '| --- | --- | --- | --- |',
        '| P4 | code-reviewer finding | fix-now | - |',
        '',
        '## 10. Merge checklist',
        '',
        '- [x] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
      ].join('\n'),
      'utf8',
    );

    const result = runDodCheck(tmpDir, ['--check', 'phase-evidence'], {
      DOD_PR_DRAFT: 'false',
      DOD_PR_BODY_FILE: bodyFile,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('phase-evidence-missing');
  });
});

describe('dod-check integration — loop-csv-stale advisory freshness check (F7, scenario 6)', () => {
  let tmpDir: string;

  function writeLoopCsv(dir: string, rows: string[]): void {
    const metricsDir = path.join(dir, 'docs', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.writeFileSync(
      path.join(metricsDir, 'loop.csv'),
      ['story_id,plan_loc,diff_loc,weight_ratio,retro_loop_metrics', ...rows].join('\n') + '\n',
      'utf8',
    );
  }

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
  });

  // fails if: the set difference inverts or self-exclusion breaks — guards
  // F7 end-to-end: a stale plan id (not the current story) is flagged, and
  // the current story's own not-yet-generated row is not.
  it('flags a plan id missing from loop.csv while excluding the current story id', () => {
    git(tmpDir, ['checkout', '-q', '-b', 'story-yy']);
    writePlan(tmpDir, 'yy', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    writePlan(tmpDir, 'xx', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    writeLoopCsv(tmpDir, ['aa,10,10,1.0,true']);
    git(tmpDir, ['add', 'docs/plans/story-yy.md', 'docs/plans/story-xx.md', 'docs/metrics/loop.csv']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-yy]']);

    const result = runDodCheck(tmpDir, ['--check', 'loop-freshness'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('loop-csv-stale');
    expect(result.stderr).toContain('story-xx');
    expect(result.stderr).not.toContain('story-yy has no docs/metrics/loop.csv row');
  });

  // fails if: a temp repo without docs/metrics/loop.csv throws instead of
  // degrading gracefully — guards the "never error" contract for the csv read.
  it('degrades gracefully (no throw) when docs/metrics/loop.csv is absent', () => {
    git(tmpDir, ['checkout', '-q', '-b', 'story-yy']);
    writePlan(tmpDir, 'yy', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    git(tmpDir, ['add', 'docs/plans/story-yy.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-yy]']);

    const result = runDodCheck(tmpDir, ['--check', 'loop-freshness'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('degraded:');
    expect(result.stderr.toLowerCase()).toContain('loop.csv');
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

    // A second plan file (story-xx) with no docs/metrics/loop.csv row, plus a
    // loop.csv that only covers a third, unrelated id — feeds loop-csv-stale.
    writePlan(tmpDir, 'xx', '## Slice plan (R13: target 6-10 commits)\n\nbody\n');
    const metricsDir = path.join(tmpDir, 'docs', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.writeFileSync(
      path.join(metricsDir, 'loop.csv'),
      ['story_id,plan_loc,diff_loc,weight_ratio,retro_loop_metrics', 'aa,10,10,1.0,true'].join('\n') +
        '\n',
      'utf8',
    );
    git(tmpDir, ['add', 'docs/plans/story-xx.md', 'docs/metrics/loop.csv']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): loop-csv fixture — failing [story-zz]']);

    bodyFile = path.join(tmpDir, 'pr-body-fixture.md');
    fs.writeFileSync(
      bodyFile,
      [
        '## 1. Story',
        '',
        'TBD',
        '',
        '## 7. Suggestion log',
        '',
        '| Phase | Suggestion | Resolution | Link / Reason |',
        '| --- | --- | --- | --- |',
        '| P1 | some finding | adopted | - |',
        '',
        '## 10. Merge checklist',
        '',
        '- [ ] done',
        '- [x] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
      ].join('\n'),
      'utf8',
    );
  });

  // fails if: any DodFinding kind is missing from the --json findings array,
  // or a finding's kind-specific fields deviate from the discriminated
  // union — guards R8 mock-diversity across this fixture's finding-kind set
  // (missing-story-id, commit-envelope, todo-comment, pr-tbd,
  // unmapped-scenario, orphan-step, merge-checklist-unticked,
  // phase-evidence-missing, loop-csv-stale). The three remaining kinds are
  // covered elsewhere: `weight-ratio-heavy`'s --json shape is asserted by the
  // S3 "large-plan/tiny-diff" test below, `try-unfunneled`'s by the dedicated
  // Try-funnel describe block (Story h13), and `story-id-unresolved`'s shape
  // by the dedicated describe block further down — together the four
  // blocks cover the full DodFinding union.
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
    // declared-rule (over-max) fixture: rule/min/max carry the range in the JSON shape.
    expect(typeof commitEnvelope?.['rule']).toBe('string');
    expect(typeof commitEnvelope?.['min']).toBe('number');
    expect(typeof commitEnvelope?.['max']).toBe('number');

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

    const mergeChecklistUnticked = byKind('merge-checklist-unticked');
    expect(mergeChecklistUnticked).toBeDefined();
    expect(typeof mergeChecklistUnticked?.['uncheckedCount']).toBe('number');

    const phaseEvidenceMissing = byKind('phase-evidence-missing');
    expect(phaseEvidenceMissing).toBeDefined();
    expect(typeof phaseEvidenceMissing?.['claim']).toBe('string');

    const loopCsvStale = byKind('loop-csv-stale');
    expect(loopCsvStale).toBeDefined();
    expect(typeof loopCsvStale?.['storyId']).toBe('string');
  });
});

describe('dod-check integration — weight-ratio-heavy advisory finding (S3/S4)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
  });

  // fails if: the finding is dropped from isAlwaysAdvisory (exit would flip
  // to 1 out of draft) or runWeightRatioCheck is unregistered — guards S3
  // end-to-end via the real CLI.
  it('emits weight-ratio-heavy as advisory (exit 0) when plan LOC exceeds shipped diff LOC', () => {
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    // Large plan (many lines), tiny shipped diff (one src line changed).
    const planLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    writePlan(tmpDir, 'zz', `## Slice plan (R13: target 6-10 commits)\n\n${planLines}\n`);
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'thing.ts'), 'export const x = 1;\n');
    git(tmpDir, ['add', 'src/thing.ts']);
    git(tmpDir, ['commit', '-q', '-m', 'feat(harness): thing — green [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'weight-ratio'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('weight-ratio-heavy');
    expect(result.stderr).toContain('advisory');
  });

  // fails if: the --json shape for weight-ratio-heavy deviates from the
  // documented discriminated union ({ kind, planLoc, shippedLoc, ratio }) —
  // this is the --json coverage for the one DodFinding kind the "every kind"
  // fixture above cannot produce (R8 mock-diversity completeness).
  it('emits weight-ratio-heavy with its documented shape via --json', () => {
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    const planLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    writePlan(tmpDir, 'zz', `## Slice plan (R13: target 6-10 commits)\n\n${planLines}\n`);
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'thing.ts'), 'export const x = 1;\n');
    git(tmpDir, ['add', 'src/thing.ts']);
    git(tmpDir, ['commit', '-q', '-m', 'feat(harness): thing — green [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'weight-ratio', '--json'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { findings: Array<Record<string, unknown>> };
    const finding = parsed.findings.find((f) => f['kind'] === 'weight-ratio-heavy');
    expect(finding).toBeDefined();
    expect(typeof finding?.['planLoc']).toBe('number');
    expect(typeof finding?.['shippedLoc']).toBe('number');
    expect(typeof finding?.['ratio']).toBe('number');
  });

  // fails if: the ratio > 1.0 guard is inverted or dropped — guards S4 end
  // to end: a plan ≤ shipped emits no finding.
  it('emits no finding when plan LOC is less than or equal to shipped diff LOC', () => {
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
    writePlan(tmpDir, 'zz', '## Slice plan (R13: target 6-10 commits)\n\nshort plan\n');
    git(tmpDir, ['add', 'docs/plans/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): plan — failing [story-zz]']);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    const bigContent = Array.from({ length: 50 }, (_, i) => `export const v${i} = ${i};`).join('\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'thing.ts'), bigContent + '\n');
    git(tmpDir, ['add', 'src/thing.ts']);
    git(tmpDir, ['commit', '-q', '-m', 'feat(harness): thing — green [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'weight-ratio'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('weight-ratio-heavy');
  });
});

describe('dod-check integration — try-unfunneled advisory finding (Story h13, Gherkin scenario 3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = initTempRepo();
    TEMP_DIRS.push(tmpDir);
    git(tmpDir, ['checkout', '-q', '-b', 'story-zz']);
  });

  const MIXED_TRY_RETRO = [
    '# Story zz retro',
    '',
    '## Try',
    '',
    '- Filed as #164 for the next maintenance sub-loop.',
    '- See `docs/templates/maintenance-sub-loop.md` for the drain-step wording.',
    '- This bullet has neither a file citation nor an issue number.',
    '',
    '## Loop metrics',
    '',
    'nothing relevant',
  ].join('\n');

  // fails if: the citation-form recognition (backtick path, markdown link,
  // `#N`) is too narrow and false-positives the two funneled bullets, or the
  // check never fires at all — guards the check end to end via the real CLI.
  it('flags exactly the un-funneled bullet, advisory (exit 0) regardless of draft state', () => {
    writeRetro(tmpDir, 'zz', MIXED_TRY_RETRO);
    git(tmpDir, ['add', 'docs/retrospectives/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): retro fixture — failing [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'try-funnel'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('try-unfunneled');
    expect(result.stderr).toContain('neither a file citation nor an issue number');
    expect(result.stderr).not.toContain('Filed as #164');
    expect(result.stderr).not.toContain('maintenance-sub-loop.md" for the drain');
    expect(result.stderr).toContain('(advisory)');
  });

  // fails if: the "No new § 8 rule minted" close-out exemption regresses —
  // this story's own retro must not flag its own close-out line once merged.
  it('exempts the "No new § 8 rule minted" close-out phrase', () => {
    writeRetro(
      tmpDir,
      'zz',
      ['# Story zz retro', '', '## Try', '', '- No new § 8 rule minted this retro.', ''].join('\n'),
    );
    git(tmpDir, ['add', 'docs/retrospectives/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): retro fixture — failing [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'try-funnel'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('try-unfunneled');
  });

  // fails if: the check throws or misfires when the story's own retro file
  // doesn't exist yet (the common case while a story is still in flight) —
  // guards the "never crash" degrade-gracefully contract the sibling checks
  // already honour (findPlanFile / getLoopCsvStoryIds).
  it('degrades gracefully (no finding, no throw) when the retro file does not exist yet', () => {
    fs.writeFileSync(path.join(tmpDir, 'x.txt'), 'x\n');
    git(tmpDir, ['add', 'x.txt']);
    git(tmpDir, ['commit', '-q', '-m', 'chore: no retro yet [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'try-funnel'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('try-unfunneled');
  });

  // fails if: the --json shape for try-unfunneled deviates from the
  // documented discriminated union ({ kind, bullet }) — this is the --json
  // coverage the "every kind" fixture above defers to this dedicated block.
  it('emits try-unfunneled with its documented shape via --json', () => {
    writeRetro(tmpDir, 'zz', MIXED_TRY_RETRO);
    git(tmpDir, ['add', 'docs/retrospectives/story-zz.md']);
    git(tmpDir, ['commit', '-q', '-m', 'test(harness): retro fixture — failing [story-zz]']);

    const result = runDodCheck(tmpDir, ['--check', 'try-funnel', '--json'], { DOD_PR_DRAFT: 'false' });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { findings: Array<Record<string, unknown>> };
    const finding = parsed.findings.find((f) => f['kind'] === 'try-unfunneled');
    expect(finding).toBeDefined();
    expect(typeof finding?.['bullet']).toBe('string');
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
