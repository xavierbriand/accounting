import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { parseSuggestionLog } from './parse-suggestion-log.js';
import { aggregate, formatMarkdownReport, formatJsonReport } from './aggregate.js';

function getPlanFiles(plansDir: string): string[] {
  if (!fs.existsSync(plansDir)) {
    return [];
  }
  return fs
    .readdirSync(plansDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

function resolveOutDir(repoRoot: string, args: string[]): string {
  const outIndex = args.indexOf('--out');
  const outArg = outIndex !== -1 ? args[outIndex + 1] : undefined;
  return outArg ? path.resolve(repoRoot, outArg) : path.join(repoRoot, 'docs', 'metrics');
}

function main(): void {
  const args = process.argv.slice(2);
  const repoRoot = process.cwd();
  const plansDir = path.join(repoRoot, 'docs', 'plans');
  const outDir = resolveOutDir(repoRoot, args);

  const planFiles = getPlanFiles(plansDir);
  const rows = planFiles.flatMap((file) =>
    parseSuggestionLog(fs.readFileSync(path.join(plansDir, file), 'utf8')),
  );
  const report = aggregate(rows);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'dispositions.md'), formatMarkdownReport(report), 'utf8');
  fs.writeFileSync(path.join(outDir, 'dispositions.json'), formatJsonReport(report), 'utf8');

  process.stderr.write(
    `disposition-report: ${report.totalRows} rows across ${report.parsedLogCount} parsed logs (${planFiles.length} plan files scanned)\n`,
  );

  if (report.parsedLogCount === 0) {
    process.stderr.write('disposition-report: zero logs parsed — exiting 1 (self-check)\n');
    process.exit(1);
  }
  process.exit(0);
}

// Guards against executing the CLI as a side effect of importing this module
// for unit-testing helpers — mirrors dod-check.ts / drift-scan.ts.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
