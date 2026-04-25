// NOTE: This test spawns the CLI via tsx (handles @core path alias). No separate build step needed.
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
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TSX_BIN = path.join(__dirname, '../../../node_modules/.bin/tsx');
const CLI_SRC = path.join(__dirname, '../../../src/cli/program.ts');
// tsconfig.json must be resolved from the project root; tsx searches for it relative
// to cwd, so when cwd=<tmp> we pass it explicitly to keep @core/* alias working.
const TSCONFIG = path.join(__dirname, '../../../tsconfig.json');

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

const STUB_CONFIG = `\
dbPath: ./test.db
defaultCurrency: EUR
timezone: Europe/Paris
accounts:
  - id: bpce-valid-account
    type: bank
    filenamePrefix: "bpce-valid_"
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alex, ratio: 0.5 }
      - { partner: Sam, ratio: 0.5 }
buffers: []
`;

describe('ingest end-to-end wiring against real BPCE CSV', () => {
  it('exits 2, stderr contains "Found 5 new transactions", no "Build failed" lines', () => {
    // fails if: TransactionBuilder receives an empty accounts array (program.ts bug #60) —
    //   every row would produce "Unknown sourceAccount: bpce-valid-account" in stderr,
    //   "Found 0 new transactions" instead of "Found 5 new transactions", and the process
    //   would exit 0 (zero low-confidence rows) instead of 2 (3 low-confidence rows).
    const tmpDir = makeTmpDir();
    const csvPath = path.join(tmpDir, 'bpce-valid_real.csv');
    const dbPath = path.join(tmpDir, 'test.db');

    fs.copyFileSync(FIXTURE_CSV, csvPath);
    fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), STUB_CONFIG, 'utf8');

    // Seed the DB schema
    execFileSync(TSX_BIN, ['--tsconfig', TSCONFIG, CLI_SRC, 'migrate', '--db-path', dbPath], {
      encoding: 'utf8',
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let error: { status: number | null; stderr: string; stdout: string } | null = null;

    try {
      execFileSync(
        TSX_BIN,
        ['--tsconfig', TSCONFIG, CLI_SRC, 'ingest', '--file', csvPath, '--non-interactive', '--json', '--db-path', dbPath],
        {
          encoding: 'utf8',
          cwd: tmpDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (e) {
      error = e as { status: number | null; stderr: string; stdout: string };
    }

    // Under the fix: 3 low-confidence rows → --non-interactive exits 2
    // Under the bug: 0 rows built → 0 low-confidence → exits 0 (no throw, no error)
    expect(error).not.toBeNull();

    const stderr = error!.stderr.toString();
    expect(error!.status).toBe(2);
    expect(stderr).toMatch(/Found 5 new transactions/);
    expect(stderr).not.toMatch(/Build failed/);
  });
});
