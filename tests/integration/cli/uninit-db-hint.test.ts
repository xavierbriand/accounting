/**
 * Integration test: CLI ingest against an uninitialised DB emits a friendly error.
 *
 * Gherkin coverage:
 *   - "Fresh / unmigrated DB exits 2 with a friendly hint"
 *   - "six ledger-opening commands share the unmigrated-DB contract" (story-maint-31)
 *
 * fails if: pre-flight migration check is missing from program.ts (ingest action would
 *   attempt to construct SqliteTransactionRepository, which eagerly prepares statements
 *   and throws a raw SqliteError with a stack trace — visible as "SqliteError" or "at new "
 *   in stderr), or the exit code is wrong (not 2), or the friendly message strings are absent.
 *
 * story-maint-31: the second describe block below pins the same assertMigrated contract
 *   for the other five ledger-opening commands (correct/status/explain/export/dissolve).
 *   fails if any of the six commands' wiring diverges from the shared
 *   resolve → open → assert-migrated → observe path in program.ts (or, after the
 *   extraction, ledger-command.ts's openLedgerCommand) — green-on-landing (R28): the six
 *   blocks are textually identical as of this commit, so this pin lands green against
 *   the still-inline blocks and then guards the ledger-command.ts extraction.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const csvPath = path.join(tmpDir, 'bpce-valid_real.csv');
    fs.copyFileSync(FIXTURE_CSV, csvPath);
    // YAML carries dbPath — no --db-path flag needed after #65 (story-maint-11)
    writeStubYaml(tmpDir);
    // No migrate — DB is intentionally uninitialised

    const result = spawnCli(['ingest', '--file', csvPath], { cwd: tmpDir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('database not initialised');
    expect(result.stderr).toContain("hint: run 'accounting migrate");
    expect(result.stderr).not.toContain('SqliteError');
    expect(result.stderr).not.toContain('at new ');
  });
});

describe('other ledger-opening commands against uninitialised DB (story-maint-31 pin)', () => {
  it.each<[string, string[]]>([
    ['correct', ['correct', 'tx-does-not-exist', '--reason', 'unmigrated pin']],
    ['status', ['status']],
    ['explain', ['explain']],
    ['export', ['export']],
    ['dissolve', ['dissolve', '--bundle', 'does-not-exist', '--confirm']],
  ])('%s exits 2 with the friendly hint against an unmigrated DB', (_name, args) => {
    // fails if: this command's action skips the shared assertMigrated check, or its
    //   wiring diverges (wrong exit code, missing hint text) from the other five —
    //   the exact regression an un-unified per-command copy/paste invites.
    const tmpDir = makeTmpDir();
    writeStubYaml(tmpDir);
    // No migrate — DB is intentionally uninitialised

    const result = spawnCli(args, { cwd: tmpDir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('database not initialised');
    expect(result.stderr).toContain("hint: run 'accounting migrate");
  });
});
