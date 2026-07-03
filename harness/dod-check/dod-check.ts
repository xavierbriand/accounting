import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  checkCommitSubjects,
  parseEnvelopeRule,
  checkCommitEnvelope,
  countChangeBodyCommits,
  type CommitLogEntry,
  type MissingStoryIdFinding,
  type CommitEnvelopeFinding,
} from './lib/commit-subject.js';
import {
  scanTodoComments,
  scanPrBodyTbd,
  type SourceFile,
  type TodoCommentFinding,
  type PrTbdFinding,
} from './lib/todo-tbd.js';
import {
  parseFeatureScenarios,
  parseStepDefinitions,
  checkGherkinMap,
  type StepDefinitionSource,
  type GherkinMapFinding,
} from './lib/gherkin-map.js';

export type StoryIdUnresolvedFinding = {
  kind: 'story-id-unresolved';
  reason: string;
};

export type DodFinding =
  | MissingStoryIdFinding
  | CommitEnvelopeFinding
  | TodoCommentFinding
  | PrTbdFinding
  | GherkinMapFinding
  | StoryIdUnresolvedFinding;

const HARD_KINDS: ReadonlySet<DodFinding['kind']> = new Set([
  'missing-story-id',
  'todo-comment',
  'unmapped-scenario',
  'orphan-step',
]);

function isHardFinding(finding: DodFinding): boolean {
  return HARD_KINDS.has(finding.kind);
}

export function isAlwaysAdvisory(finding: DodFinding): boolean {
  if (finding.kind === 'story-id-unresolved') return true;
  if (finding.kind === 'commit-envelope') {
    return finding.rule === null || (finding.min !== null && finding.count < finding.min);
  }
  return false;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function resolveStoryId(
  repoRoot: string,
  degraded: string[],
): { storyId: string } | { unresolved: string } {
  let branch: string;
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    degraded.push(`resolveStoryId: git rev-parse failed (${errorMessage(err)})`);
    branch = '';
  }
  const branchMatch = /^story-(.+)$/.exec(branch);
  if (branchMatch) {
    return { storyId: branchMatch[1] };
  }

  let planFiles: string[];
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD', '--', 'docs/plans/*.md'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    planFiles = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch (err) {
    degraded.push(`resolveStoryId: git diff --name-only failed (${errorMessage(err)})`);
    planFiles = [];
  }

  if (planFiles.length === 1) {
    const planMatch = /^docs\/plans\/story-(.+)\.md$/.exec(planFiles[0]);
    if (planMatch) {
      return { storyId: planMatch[1] };
    }
  }

  const reason =
    planFiles.length === 0
      ? 'no story- branch and no plan file added in origin/main...HEAD'
      : `no story- branch and ${planFiles.length} plan files added in origin/main...HEAD (expected exactly 1)`;
  return { unresolved: reason };
}

function getCommitLog(repoRoot: string, degraded: string[]): CommitLogEntry[] {
  let output: string;
  try {
    // --no-merges: a PR-build merge commit ("Merge <sha> into <base>") and any
    // `Merge …` commit never carry the story-id convention and are not behaviour
    // slices — excluding them keeps the subject check and the envelope count honest.
    output = execFileSync(
      'git',
      ['log', '--no-merges', '--format=%H%x1f%s', 'origin/main...HEAD'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
  } catch (err) {
    degraded.push(`getCommitLog: git log failed (${errorMessage(err)})`);
    return [];
  }
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const [sha, subject] = line.split('\x1f');
      return { sha, subject: subject ?? '' };
    });
}

function findPlanFile(repoRoot: string, storyId: string): string | null {
  const candidate = path.join(repoRoot, 'docs', 'plans', `story-${storyId}.md`);
  return fs.existsSync(candidate) ? candidate : null;
}

function runCommitSubjectCheck(repoRoot: string, degraded: string[]): DodFinding[] {
  const resolution = resolveStoryId(repoRoot, degraded);
  if ('unresolved' in resolution) {
    return [{ kind: 'story-id-unresolved', reason: resolution.unresolved }];
  }
  const { storyId } = resolution;
  const commits = getCommitLog(repoRoot, degraded);
  const findings: DodFinding[] = [...checkCommitSubjects(commits, storyId)];

  const planPath = findPlanFile(repoRoot, storyId);
  const envelope = planPath ? parseEnvelopeRule(fs.readFileSync(planPath, 'utf8')) : null;
  const envelopeFinding = checkCommitEnvelope(countChangeBodyCommits(commits, storyId), envelope);
  if (envelopeFinding) {
    findings.push(envelopeFinding);
  }
  return findings;
}

const TRACKED_SOURCE_DIRS = ['src', 'tests', 'harness'];
const TODO_SCAN_EXCLUDE_PATHS = new Set([path.join('harness', 'dod-check', 'lib', 'todo-tbd.ts')]);
const TODO_SCAN_EXCLUDE_DIR_PREFIXES = [
  path.join('harness', 'dod-check', 'tests') + path.sep,
  path.join('harness', 'dod-check', 'fixtures') + path.sep,
];

function isTodoScanExcluded(relPath: string): boolean {
  if (TODO_SCAN_EXCLUDE_PATHS.has(relPath)) return true;
  return TODO_SCAN_EXCLUDE_DIR_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function listTrackedFiles(repoRoot: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['ls-files', ...TRACKED_SOURCE_DIRS],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isTodoScanExcluded(l));
  } catch {
    return [];
  }
}

function runTodoCheck(repoRoot: string): DodFinding[] {
  const files: SourceFile[] = listTrackedFiles(repoRoot).map((relPath) => ({
    path: relPath,
    content: fs.readFileSync(path.join(repoRoot, relPath), 'utf8'),
  }));
  return scanTodoComments(files);
}

type PrBodyResolution = { body: string } | { unavailable: string };

function resolvePrBody(repoRoot: string): PrBodyResolution {
  const bodyFile = process.env['DOD_PR_BODY_FILE'];
  if (bodyFile) {
    try {
      return { body: fs.readFileSync(bodyFile, 'utf8') };
    } catch (err) {
      return { unavailable: `DOD_PR_BODY_FILE read failed (${errorMessage(err)})` };
    }
  }
  const prNumber = process.env['DOD_PR_NUMBER'];
  const args = prNumber ? [prNumber] : [];
  try {
    const body = execFileSync('gh', ['pr', 'view', ...args, '--json', 'body', '-q', '.body'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return { body };
  } catch (err) {
    return { unavailable: errorMessage(err) };
  }
}

function runPrTbdCheck(repoRoot: string, degraded: string[]): DodFinding[] {
  const resolution = resolvePrBody(repoRoot);
  if ('unavailable' in resolution) {
    degraded.push(`resolvePrBody: could not resolve PR body (${resolution.unavailable})`);
    return [];
  }
  return scanPrBodyTbd(resolution.body);
}

const GHERKIN_FENCE_PATTERN = /```gherkin\n([\s\S]*?)```/g;
const GHERKIN_SCENARIO_LINE = /^\s*Scenario(?: Outline)?:\s*(.+)$/gm;

function extractPlanScenarioNames(planContent: string): string[] {
  const names: string[] = [];
  let fenceMatch: RegExpExecArray | null;
  const fencePattern = new RegExp(GHERKIN_FENCE_PATTERN.source, 'g');
  while ((fenceMatch = fencePattern.exec(planContent)) !== null) {
    const block = fenceMatch[1];
    let scenarioMatch: RegExpExecArray | null;
    const scenarioPattern = new RegExp(GHERKIN_SCENARIO_LINE.source, 'gm');
    while ((scenarioMatch = scenarioPattern.exec(block)) !== null) {
      names.push(scenarioMatch[1].trim());
    }
  }
  return names;
}

function runGherkinMapCheck(repoRoot: string, degraded: string[]): DodFinding[] {
  const featuresDir = path.join(repoRoot, 'tests', 'features');
  const stepsDir = path.join(featuresDir, 'steps');
  if (!fs.existsSync(featuresDir)) return [];

  const featureFiles = fs.readdirSync(featuresDir).filter((f) => f.endsWith('.feature'));
  const scenarios = featureFiles.flatMap((f) => {
    const relPath = path.join('tests', 'features', f);
    return parseFeatureScenarios(fs.readFileSync(path.join(featuresDir, f), 'utf8'), relPath);
  });

  const stepFiles = fs.existsSync(stepsDir)
    ? fs.readdirSync(stepsDir).filter((f) => f.endsWith('.ts'))
    : [];
  const stepDefs: StepDefinitionSource[] = stepFiles.flatMap((f) => {
    const relPath = path.join('tests', 'features', 'steps', f);
    return parseStepDefinitions(fs.readFileSync(path.join(stepsDir, f), 'utf8'), relPath);
  });

  const resolution = resolveStoryId(repoRoot, degraded);
  const planScenarioNames =
    'storyId' in resolution
      ? (() => {
          const planPath = findPlanFile(repoRoot, resolution.storyId);
          return planPath ? extractPlanScenarioNames(fs.readFileSync(planPath, 'utf8')) : [];
        })()
      : [];

  return checkGherkinMap(scenarios, stepDefs, planScenarioNames).findings;
}

type DraftResolution = { isDraft: boolean; degraded: string | null };

function parseIsDraft(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function resolveDraftState(repoRoot: string): DraftResolution {
  const envDraft = process.env['DOD_PR_DRAFT'];
  if (envDraft === 'true') return { isDraft: true, degraded: null };
  if (envDraft === 'false') return { isDraft: false, degraded: null };

  try {
    const prNumber = process.env['DOD_PR_NUMBER'];
    const args = prNumber ? [prNumber] : [];
    const output = execFileSync('gh', ['pr', 'view', ...args, '--json', 'isDraft'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const parsed: unknown = JSON.parse(output);
    const isDraftField =
      typeof parsed === 'object' && parsed !== null && 'isDraft' in parsed
        ? (parsed as Record<string, unknown>)['isDraft']
        : undefined;
    const isDraft = parseIsDraft(isDraftField);
    if (isDraft === null) {
      return { isDraft: true, degraded: 'gh pr view returned an unparseable isDraft field' };
    }
    return { isDraft, degraded: null };
  } catch (err) {
    return { isDraft: true, degraded: `gh pr view failed (${errorMessage(err)})` };
  }
}

function draftSuffix(finding: DodFinding, isDraft: boolean): string {
  return !isHardFinding(finding) && !isAlwaysAdvisory(finding) && isDraft
    ? ' (advisory — PR is draft)'
    : '';
}

function formatCommitEnvelopeLine(f: CommitEnvelopeFinding, isDraft: boolean): string {
  if (f.rule === null) {
    return `  commit-envelope: ${f.count} commits, envelope not declared in plan (advisory)`;
  }
  if (f.min !== null && f.count < f.min) {
    return `  commit-envelope: ${f.count} commits, under the ${f.rule} (${f.min}–${f.max}) target (advisory)`;
  }
  return `  commit-envelope: ${f.count} commits, over the ${f.rule} (${f.min}–${f.max}) envelope${draftSuffix(f, isDraft)}`;
}

function formatCommitSubjectLines(findings: DodFinding[], isDraft: boolean): string[] {
  const commitFindings = findings.filter(
    (f): f is MissingStoryIdFinding | CommitEnvelopeFinding | StoryIdUnresolvedFinding =>
      f.kind === 'missing-story-id' || f.kind === 'commit-envelope' || f.kind === 'story-id-unresolved',
  );
  if (commitFindings.length === 0) return [];
  const lines = ['Commit subjects:'];
  for (const f of commitFindings) {
    if (f.kind === 'missing-story-id') {
      lines.push(`  missing-story-id: ${f.sha} "${f.subject}"`);
    } else if (f.kind === 'commit-envelope') {
      lines.push(formatCommitEnvelopeLine(f, isDraft));
    } else {
      lines.push(`  story-id-unresolved: ${f.reason} (advisory)`);
    }
  }
  return lines;
}

function formatTodoTbdLines(findings: DodFinding[], isDraft: boolean): string[] {
  const todoTbdFindings = findings.filter(
    (f): f is TodoCommentFinding | PrTbdFinding => f.kind === 'todo-comment' || f.kind === 'pr-tbd',
  );
  if (todoTbdFindings.length === 0) return [];
  const lines = ['TODO/TBD:'];
  for (const f of todoTbdFindings) {
    if (f.kind === 'todo-comment') {
      lines.push(`  todo-comment: ${f.file}:${f.line}`);
    } else {
      lines.push(`  pr-tbd: section "${f.section}"${draftSuffix(f, isDraft)}`);
    }
  }
  return lines;
}

function formatGherkinLines(findings: DodFinding[]): string[] {
  const gherkinFindings = findings.filter(
    (f): f is GherkinMapFinding => f.kind === 'unmapped-scenario' || f.kind === 'orphan-step',
  );
  if (gherkinFindings.length === 0) return [];
  const lines = ['Gherkin↔step:'];
  for (const f of gherkinFindings) {
    if (f.kind === 'unmapped-scenario') {
      lines.push(`  unmapped-scenario: "${f.scenario}" (${f.file ?? 'plan-only'}) — ${f.reason}`);
    } else {
      lines.push(`  orphan-step: "${f.pattern}" (${f.file})`);
    }
  }
  return lines;
}

function formatHumanReport(findings: DodFinding[], isDraft: boolean): string {
  return [
    ...formatCommitSubjectLines(findings, isDraft),
    ...formatTodoTbdLines(findings, isDraft),
    ...formatGherkinLines(findings),
  ].join('\n');
}

function formatJsonReport(findings: DodFinding[], degraded: string[]): string {
  return JSON.stringify({ findings, degraded });
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const checkIndex = args.indexOf('--check');
  const onlyCheck = checkIndex !== -1 ? args[checkIndex + 1] : null;

  const repoRoot = process.cwd();
  const degraded: string[] = [];

  const checks: Record<string, () => DodFinding[]> = {
    commits: () => runCommitSubjectCheck(repoRoot, degraded),
    'todo-tbd': () => [...runTodoCheck(repoRoot), ...runPrTbdCheck(repoRoot, degraded)],
    gherkin: () => runGherkinMapCheck(repoRoot, degraded),
  };

  const selectedChecks = onlyCheck ? [onlyCheck] : Object.keys(checks);
  const findings = selectedChecks.flatMap((name) => checks[name]?.() ?? []);

  const draft = resolveDraftState(repoRoot);
  if (draft.degraded) {
    degraded.push(`resolveDraftState: ${draft.degraded}`);
  }

  if (json) {
    process.stdout.write(formatJsonReport(findings, degraded) + '\n');
  } else {
    for (const line of degraded) {
      process.stderr.write(`degraded: ${line}\n`);
    }
    if (findings.length > 0) {
      process.stderr.write(formatHumanReport(findings, draft.isDraft) + '\n');
    }
  }

  const hard = findings.filter(isHardFinding);
  const softGate = findings.filter((f) => !isHardFinding(f) && !isAlwaysAdvisory(f));
  const exitCode = hard.length > 0 || (softGate.length > 0 && !draft.isDraft) ? 1 : 0;
  process.exit(exitCode);
}

// Guards against executing the CLI (including process.exit) as a side
// effect of importing this module for unit-testing isAlwaysAdvisory —
// dod-check.ts is otherwise only ever invoked directly via tsx/npx.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
