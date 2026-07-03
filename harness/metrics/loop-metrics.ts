import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  buildLoopRow,
  formatCsv,
  formatTop3Report,
  formatSkipReport,
  hasRetroLoopMetrics,
  type CommitLogEntry,
  type LoopRow,
  type SkipEntry,
} from './lib/loop-metrics.js';
import { sumShippedDiffLoc } from '../lib/process-artifacts.js';

function getPlanStoryIds(repoRoot: string): string[] {
  const plansDir = path.join(repoRoot, 'docs', 'plans');
  return fs
    .readdirSync(plansDir)
    .filter((f) => f.startsWith('story-') && f.endsWith('.md'))
    .map((f) => f.slice('story-'.length, -'.md'.length))
    .sort();
}

function getCommitLog(repoRoot: string): CommitLogEntry[] {
  const output = execFileSync('git', ['log', '--format=%H|%s', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const sep = line.indexOf('|');
      return { sha: line.slice(0, sep), subject: line.slice(sep + 1) };
    });
}

function diffLocForSha(repoRoot: string, sha: string): number | null {
  try {
    const output = execFileSync('git', ['show', '--numstat', '--format=', sha], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return sumShippedDiffLoc(output);
  } catch {
    return null;
  }
}

function planLocFor(repoRoot: string, storyId: string): number {
  const planPath = path.join(repoRoot, 'docs', 'plans', `story-${storyId}.md`);
  const content = fs.readFileSync(planPath, 'utf8');
  if (content.length === 0) {
    return 0;
  }
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

function retroLoopMetricsFor(repoRoot: string, storyId: string): boolean {
  const retroPath = path.join(repoRoot, 'docs', 'retrospectives', `story-${storyId}.md`);
  if (!fs.existsSync(retroPath)) {
    return false;
  }
  return hasRetroLoopMetrics(fs.readFileSync(retroPath, 'utf8'));
}

function main(): void {
  const repoRoot = process.cwd();
  const storyIds = getPlanStoryIds(repoRoot);
  const commitLog = getCommitLog(repoRoot);

  const rows: LoopRow[] = [];
  const skips: SkipEntry[] = [];

  for (const storyId of storyIds) {
    const planLoc = planLocFor(repoRoot, storyId);
    const retroLoopMetrics = retroLoopMetricsFor(repoRoot, storyId);

    const { row, skipReason } = buildLoopRow({
      storyId,
      planLoc,
      commitLog,
      retroLoopMetrics,
      diffStatLookup: (sha) => diffLocForSha(repoRoot, sha),
    });

    rows.push(row);
    if (skipReason !== null) {
      skips.push({ storyId, reason: skipReason });
    }
  }

  const outDir = path.join(repoRoot, 'docs', 'metrics');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'loop.csv'), formatCsv(rows), 'utf8');

  process.stderr.write(formatTop3Report(rows) + '\n');
  process.stderr.write(formatSkipReport(skips) + '\n');
}

main();
