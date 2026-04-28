/**
 * Integration test: CLI ingest builds real transactions from a BPCE CSV fixture (regresses #60).
 *
 * Gherkin coverage:
 *   - "Real BPCE fixture ingests with all rows built (regresses #60)"
 *
 * fails if (a) TransactionBuilder is constructed with an empty accounts array in program.ts
 *   (the original #60 bug — every row would be rejected with "Unknown sourceAccount: <id>"
 *   and stderr would show "Found 0 new transactions" + "Build failed" lines), OR
 *   (b) the autoTagRules wiring at program.ts:104 is reverted to passing undefined
 *   (Story B): writeStubYaml injects two rules (Insurance/mutuelle, Subscriptions/abonnement);
 *   under the bug, both fixture rows that should auto-tag would land in Uncategorized,
 *   altering the low-confidence count and breaking the exit-2 assertion.
 *   The exit-code assertion (2, not 0) anchors both regressions: 0 rows built ⇒ 0 low-confidence
 *   ⇒ exit 0; or wrong tagging ⇒ a different low-confidence count ⇒ assertion drift.
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
    // Include autoTagRules so the tagging assertion (3 low-confidence, 2 auto-tagged) remains
    // meaningful post-Story-B. Without rules, all 5 rows would be Uncategorized (low-confidence)
    // and exit 2 would still happen, but the test would no longer guard the actual tagging wiring.
    writeStubYaml(tmpDir, {
      autoTagRules: [
        { category: 'Insurance', patterns: ['mutuelle'] },
        { category: 'Subscriptions', patterns: ['abonnement'] },
      ],
    });

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
