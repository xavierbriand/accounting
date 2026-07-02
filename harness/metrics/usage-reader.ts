import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  parseUsageRecords,
  aggregateByModel,
  formatUsageReport,
  loadPriceMap,
  attributeToStory,
  formatStoryReport,
} from './lib/usage-reader.js';
import { validateInputPath } from './validate-path.js';

const USAGE_TEXT = `Usage:
  metrics:usage -- <path-to-session-jsonl>
  metrics:story -- <story-id>
`;

function loadPriceMapFromRepo(repoRoot: string): ReturnType<typeof loadPriceMap> {
  const pricesPath = path.join(repoRoot, 'harness', 'metrics', 'prices.json');
  if (!fs.existsSync(pricesPath)) {
    return null;
  }
  return loadPriceMap(fs.readFileSync(pricesPath, 'utf8'));
}

function runUsage(rawPath: string): void {
  const validation = validateInputPath(rawPath);
  if (!validation.ok) {
    process.stderr.write(`${validation.error}\n`);
    process.exit(2);
  }

  const jsonl = fs.readFileSync(validation.resolved, 'utf8');
  const { records, skipped } = parseUsageRecords(jsonl);
  const totals = aggregateByModel(records);
  process.stdout.write(formatUsageReport(totals, skipped) + '\n');
}

function getStoryCommitWindow(
  repoRoot: string,
  storyId: string,
): { windowStart: string; windowEnd: string } | null {
  const escaped = storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = `(\\[story-${escaped}\\]|(^|[^A-Za-z0-9.-])story-${escaped}([^A-Za-z0-9-]|$)|(^|[^A-Za-z0-9.-])Story ${escaped}([^A-Za-z0-9.]|$))`;
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['log', '--all', '--format=%cI', '--extended-regexp', `--grep=${pattern}`, '-i'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
  } catch {
    return null;
  }
  const timestamps = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort();
  if (timestamps.length === 0) {
    return null;
  }
  return { windowStart: timestamps[0], windowEnd: timestamps[timestamps.length - 1] };
}

function findSessionFiles(): string[] {
  const projectsRoot = path.join(process.env['HOME'] ?? '', '.claude', 'projects');
  if (!fs.existsSync(projectsRoot)) {
    return [];
  }
  const files: string[] = [];
  for (const projectDir of fs.readdirSync(projectsRoot)) {
    const fullDir = path.join(projectsRoot, projectDir);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    for (const entry of fs.readdirSync(fullDir)) {
      if (entry.endsWith('.jsonl')) {
        files.push(path.join(fullDir, entry));
      }
    }
  }
  return files;
}

function runStory(storyId: string): void {
  const repoRoot = process.cwd();
  const window = getStoryCommitWindow(repoRoot, storyId);

  if (window === null) {
    const report = formatStoryReport({
      storyId,
      attributed: [],
      unattributedSessionIds: [],
      priceMap: null,
    });
    const outPath = path.join(repoRoot, 'docs', 'metrics', `story-${storyId}.md`);
    fs.writeFileSync(
      outPath,
      report + '\nno commit window resolved — no usage source available for attribution.\n',
      'utf8',
    );
    process.stderr.write(`no commits found for story id "${storyId}"; wrote empty report\n`);
    return;
  }

  const sessionFiles = findSessionFiles();
  const allRecords = [];
  let totalSkipped = 0;
  for (const file of sessionFiles) {
    const validation = validateInputPath(file);
    if (!validation.ok) continue;
    const { records, skipped } = parseUsageRecords(fs.readFileSync(validation.resolved, 'utf8'));
    allRecords.push(...records);
    totalSkipped += skipped;
  }

  const { attributed, unattributed } = attributeToStory(allRecords, window);
  const priceMap = loadPriceMapFromRepo(repoRoot);
  const unattributedSessionIds = [...new Set(unattributed.map((r) => r.sessionId))];

  const report = formatStoryReport({ storyId, attributed, unattributedSessionIds, priceMap });
  const outDir = path.join(repoRoot, 'docs', 'metrics');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `story-${storyId}.md`), report, 'utf8');
  process.stderr.write(
    `wrote docs/metrics/story-${storyId}.md ` +
      `(${attributed.length} attributed records, ${unattributed.length} unattributed, ${totalSkipped} skipped)\n`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const isStoryMode = args[0] === '--story';

  if (isStoryMode) {
    const storyId = args[1];
    const rest = args.slice(2);
    if (storyId === undefined || storyId.startsWith('--') || rest.length > 0) {
      process.stderr.write(USAGE_TEXT);
      process.exit(2);
    }
    runStory(storyId);
    return;
  }

  const unknownFlags = args.filter((a) => a.startsWith('--'));
  if (unknownFlags.length > 0 || args.length !== 1) {
    process.stderr.write(USAGE_TEXT);
    process.exit(2);
  }
  runUsage(args[0]);
}

main();
