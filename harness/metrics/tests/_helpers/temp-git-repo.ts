import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// Commits land directly on a local branch literally named `origin/main` so
// `git log origin/main` (loop-metrics.ts's getCommitLog) sees them without a
// real remote — mirrors dod-check.integration.test.ts's temp-repo pattern,
// but checked out immediately since our fixtures commit straight to it
// rather than a separate story branch.
export function initTempRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-e2e-'));
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
  git(tmpDir, ['checkout', '-q', '-b', 'origin/main']);
  return tmpDir;
}

export function writeAndCommit(tmpDir: string, relPath: string, content: string, subject: string): void {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  git(tmpDir, ['add', relPath]);
  git(tmpDir, ['commit', '-q', '-m', subject]);
}

// Shared afterEach cleanup for the TEMP_DIRS-array pattern both integration
// test files use — removes each dir and clears the list.
export function cleanupTempDirs(dirs: string[]): void {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
