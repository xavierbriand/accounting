// NOTE: Spawns the CLI via tsx (handles @core path alias). No separate build step needed.
/**
 * Integration tests: CLI migrate and ingest refuse a symlinked dbPath.
 *
 * Gherkin coverage:
 *   - "CLI ingest against a symlinked db path is refused"
 *   - "CLI migrate against a symlinked db path is refused"
 *
 * fails if: validateDbPath is not wired into program.ts — without the check,
 *   better-sqlite3 would follow the symlink and write SQLite bytes into an unintended
 *   target file (no stderr refusal, no exit 2). This test proves the guard is in place
 *   at the CLI composition root for both commands.
 *
 * Uses --db-path-override (the recovery flag) to pass a symlinked path explicitly,
 * bypassing the YAML-authoritative path so validateDbPath is exercised directly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeStubYaml } from '../../_helpers/inline-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TSX_BIN = path.join(__dirname, '../../../node_modules/.bin/tsx');
const CLI_SRC = path.join(__dirname, '../../../src/cli/program.ts');
const TSCONFIG = path.join(__dirname, '../../../tsconfig.json');

const FIXTURE_CSV = path.join(__dirname, '../../fixtures/csv/bpce-valid.csv');

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-symlink-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('migrate against symlinked dbPath', () => {
  it('exits 2, stderr contains "refusing to open dbPath" and "symbolic link", no SqliteError or stack trace', () => {
    // fails if: validateDbPath is not called in the migrate action of program.ts —
    //   better-sqlite3 would follow the symlink and open the target, exiting 0 instead of 2,
    //   with no "refusing to open dbPath" message in stderr
    const tmpDir = makeTmpDir();
    const realFile = path.join(tmpDir, 'real.db');
    const linkPath = path.join(tmpDir, 'link.db');
    fs.writeFileSync(realFile, '');
    fs.symlinkSync(realFile, linkPath);
    // Stub YAML so the config load succeeds; --db-path-override passes the symlinked path
    writeStubYaml(tmpDir);

    let error: { status: number | null; stderr: Buffer | string; stdout: Buffer | string } | null = null;

    try {
      execFileSync(TSX_BIN, ['--tsconfig', TSCONFIG, CLI_SRC, 'migrate', '--db-path-override', linkPath], {
        encoding: 'utf8',
        cwd: tmpDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      error = e as { status: number | null; stderr: Buffer | string; stdout: Buffer | string };
    }

    expect(error).not.toBeNull();

    const stderr = error!.stderr.toString();
    expect(error!.status).toBe(2);
    expect(stderr).toContain('refusing to open dbPath');
    expect(stderr).toContain('symbolic link');
    expect(stderr).not.toContain('SqliteError');
    expect(stderr).not.toContain('at new ');
  });
});

describe('ingest against symlinked dbPath', () => {
  it('exits 2, stderr contains "refusing to open dbPath" and "symbolic link", no SqliteError or stack trace', () => {
    // fails if: validateDbPath is not called in the ingest action of program.ts —
    //   the migration guard (assertMigrated) runs after getDb, so without validateDbPath
    //   the process would open the symlink target as a DB, then fail with either
    //   "database not initialised" or a SqliteError — neither contains "refusing to open dbPath"
    const tmpDir = makeTmpDir();
    const realFile = path.join(tmpDir, 'real.db');
    const linkPath = path.join(tmpDir, 'link.db');
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.writeFileSync(realFile, '');
    fs.symlinkSync(realFile, linkPath);
    fs.copyFileSync(FIXTURE_CSV, csvPath);
    // Stub YAML so the config load succeeds; --db-path-override passes the symlinked path
    writeStubYaml(tmpDir);

    let error: { status: number | null; stderr: Buffer | string; stdout: Buffer | string } | null = null;

    try {
      execFileSync(TSX_BIN, ['--tsconfig', TSCONFIG, CLI_SRC, 'ingest', '--file', csvPath, '--db-path-override', linkPath], {
        encoding: 'utf8',
        cwd: tmpDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      error = e as { status: number | null; stderr: Buffer | string; stdout: Buffer | string };
    }

    expect(error).not.toBeNull();

    const stderr = error!.stderr.toString();
    expect(error!.status).toBe(2);
    expect(stderr).toContain('refusing to open dbPath');
    expect(stderr).toContain('symbolic link');
    expect(stderr).not.toContain('SqliteError');
    expect(stderr).not.toContain('at new ');
  });
});
