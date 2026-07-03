import { buildStoryIdRegExp } from '../../lib/story-id-matcher.js';

export type CommitLogEntry = {
  sha: string;
  subject: string;
};

export type LoopRow = {
  story_id: string;
  plan_loc: number;
  diff_loc: number | 'n/a';
  commits: number;
  weight_ratio: number | 'n/a';
  retro_loop_metrics: boolean;
};

export type SkipEntry = {
  storyId: string;
  reason: string;
};

export function resolveStoryCommit(
  commitLog: CommitLogEntry[],
  storyId: string,
): CommitLogEntry | null {
  const pattern = buildStoryIdRegExp(storyId);
  for (const entry of commitLog) {
    if (pattern.test(entry.subject)) {
      return entry;
    }
  }
  return null;
}

export function countStoryCommits(commitLog: CommitLogEntry[], storyId: string): number {
  const pattern = buildStoryIdRegExp(storyId);
  return commitLog.filter((entry) => pattern.test(entry.subject)).length;
}

export function computeWeightRatio(planLoc: number, diffLoc: number): number | null {
  if (diffLoc === 0) {
    return null;
  }
  return planLoc / diffLoc;
}

const LOOP_METRICS_HEADING = /^## Loop metrics\b/m;

export function hasRetroLoopMetrics(retroContent: string): boolean {
  return LOOP_METRICS_HEADING.test(retroContent);
}

export type BuildLoopRowInput = {
  storyId: string;
  planLoc: number;
  commitLog: CommitLogEntry[];
  commits: number;
  retroLoopMetrics: boolean;
  diffStatLookup: (sha: string) => number | null;
};

export type BuildLoopRowResult = {
  row: LoopRow;
  skipReason: string | null;
};

export function buildLoopRow(input: BuildLoopRowInput): BuildLoopRowResult {
  const { storyId, planLoc, commitLog, commits, retroLoopMetrics, diffStatLookup } = input;
  const resolved = resolveStoryCommit(commitLog, storyId);

  if (resolved === null) {
    return {
      row: {
        story_id: storyId,
        plan_loc: planLoc,
        diff_loc: 'n/a',
        commits,
        weight_ratio: 'n/a',
        retro_loop_metrics: retroLoopMetrics,
      },
      skipReason: `no merge commit resolved for story id "${storyId}"`,
    };
  }

  const diffLoc = diffStatLookup(resolved.sha);
  if (diffLoc === null || diffLoc === 0) {
    return {
      row: {
        story_id: storyId,
        plan_loc: planLoc,
        diff_loc: 'n/a',
        commits,
        weight_ratio: 'n/a',
        retro_loop_metrics: retroLoopMetrics,
      },
      skipReason: `merge commit for story id "${storyId}" has zero diff_loc`,
    };
  }

  const weightRatio = computeWeightRatio(planLoc, diffLoc) ?? 'n/a';
  return {
    row: {
      story_id: storyId,
      plan_loc: planLoc,
      diff_loc: diffLoc,
      commits,
      weight_ratio: weightRatio,
      retro_loop_metrics: retroLoopMetrics,
    },
    skipReason: null,
  };
}

const CSV_COLUMNS: Array<keyof LoopRow> = [
  'story_id',
  'plan_loc',
  'diff_loc',
  'commits',
  'weight_ratio',
  'retro_loop_metrics',
];

export function formatCsv(rows: LoopRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((col) => String(row[col])).join(','));
  }
  return lines.join('\n') + '\n';
}

export function formatTop3Report(rows: LoopRow[]): string {
  const numeric = rows.filter(
    (row): row is LoopRow & { weight_ratio: number } => typeof row.weight_ratio === 'number',
  );
  const top3 = [...numeric].sort((a, b) => b.weight_ratio - a.weight_ratio).slice(0, 3);
  const lines = ['top-3 weight-ratio offenders:'];
  top3.forEach((row, index) => {
    lines.push(`  ${index + 1}. ${row.story_id} (weight_ratio=${row.weight_ratio})`);
  });
  return lines.join('\n');
}

export function formatSkipReport(skips: SkipEntry[]): string {
  if (skips.length === 0) {
    return 'skipped stories: none';
  }
  const lines = ['skipped stories:'];
  for (const skip of skips) {
    lines.push(`  ${skip.storyId}: ${skip.reason}`);
  }
  return lines.join('\n');
}
