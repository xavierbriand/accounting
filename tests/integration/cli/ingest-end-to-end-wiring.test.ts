/**
 * Integration test: CLI ingest builds real transactions from a BPCE CSV fixture (regresses #60).
 *
 * Gherkin coverage:
 *   - "Real BPCE fixture ingests with all rows built (regresses #60)"
 *
 * fails if: TransactionBuilder is constructed with an empty accounts array in program.ts
 *   (the bug in #60) — every row would be rejected with "Unknown sourceAccount: <id>"
 *   and stderr would show "Found 0 new transactions" + "Build failed" lines instead of
 *   the expected "Found 5 new transactions" with no "Build failed" lines.
 *   The exit-code assertion (2, not 0) also fails under the bug because 0 rows are built,
 *   so there are 0 low-confidence rows, so --non-interactive exits 0 rather than 2.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-e2e-wiring-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('ingest end-to-end wiring against real BPCE CSV', () => {
  it('exits 2, stderr contains "Found 5 new transactions", no "Build failed" lines', () => {
    // fails if: TransactionBuilder receives an empty accounts array (program.ts bug #60) —
    //   every row would produce "Unknown sourceAccount: bpce-valid-account" in stderr,
    //   "Found 0 new transactions" instead of "Found 5 new transactions", and the process
    //   would exit 0 (zero low-confidence rows) instead of 2 (3 low-confidence rows).
    const tmpDir = makeTmpDir();
    const csvPath = path.join(tmpDir, 'bpce-valid_real.csv');

    fs.copyFileSync(FIXTURE_CSV, csvPath);
    writeStubYaml(tmpDir);

    // Seed the DB schema via YAML-authoritative dbPath (no flag needed after #65)
    spawnCli(['migrate'], { cwd: tmpDir });

    const result = spawnCli(
      ['ingest', '--file', csvPath, '--non-interactive', '--json'],
      { cwd: tmpDir },
    );

    // Under the fix: 3 low-confidence rows → --non-interactive exits 2
    // Under the bug: 0 rows built → 0 low-confidence → exits 0 (no throw, no error)
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Found 5 new transactions/);
    expect(result.stderr).not.toMatch(/Build failed/);
  });
});
