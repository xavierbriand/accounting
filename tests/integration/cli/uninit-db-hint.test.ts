// NOTE: This test spawns the built CLI; CI runs npm run build before tests. Locally, run 'npm run build' once before this test.
/**
 * Integration test: CLI ingest against an uninitialised DB emits a friendly error.
 *
 * Gherkin coverage:
 *   - "Fresh / unmigrated DB exits 2 with a friendly hint"
 *
 * fails if: pre-flight migration check is missing from program.ts (ingest action would
 *   attempt to construct SqliteTransactionRepository, which eagerly prepares statements
 *   and throws a raw SqliteError with a stack trace — visible as "SqliteError" or "at new "
 *   in stderr), or the exit code is wrong (not 2), or the friendly message strings are absent.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLI_PATH = path.join(__dirname, '../../../dist/cli/program.js');

const FIXTURE_CSV = path.join(__dirname, '../../fixtures/csv/bpce-valid.csv');

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-uninit-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('ingest against uninitialised DB', () => {
  it('exits 2, stderr contains friendly hint, no SqliteError or stack trace', () => {
    // fails if: pre-flight migration check is not wired into program.ts ingest action —
    //   without the check, SqliteTransactionRepository constructor throws a raw SqliteError
    //   with a stack trace that would reach the user. This test proves the user-visible fix.
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'uninit.db');
    const csvPath = path.join(tmpDir, 'bpce-valid.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);

    let error: { status: number | null; stderr: Buffer | string; stdout: Buffer | string } | null = null;

    try {
      execFileSync('node', [CLI_PATH, 'ingest', '--file', csvPath, '--db-path', dbPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      error = e as { status: number | null; stderr: Buffer | string; stdout: Buffer | string };
    }

    expect(error).not.toBeNull();

    const stderr = error!.stderr.toString();
    expect(error!.status).toBe(2);
    expect(stderr).toContain('database not initialised');
    expect(stderr).toContain("hint: run 'accounting migrate");
    expect(stderr).not.toContain('SqliteError');
    expect(stderr).not.toContain('at new ');
  });
});
