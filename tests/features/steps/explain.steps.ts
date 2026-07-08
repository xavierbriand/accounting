/**
 * Step bindings for explain.feature (Story 4.3b).
 *
 * Slice 5 lands only the R4 composition-root subprocess journey (scenario 7) —
 * program.ts's `explain` wiring is what this slice proves out, end to end,
 * against the real built binary. Scenarios 1-6 (in-process, real Core services
 * over a real migrated temp SQLite) are added in Slice 7 once the acceptance
 * suite is wired up as a whole; until then they report as pending/undefined,
 * which is expected outside-in TDD red.
 */
import { expect } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnCli } from '../../_helpers/spawn-cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExplainWorld {
  subprocessTmpDir?: string;
  subprocessResult?: { status: number; stdout: string; stderr: string };
}

function writeSettlementYaml(tmpDir: string): void {
  const yaml = `\
dbPath: ./test.db
defaultCurrency: EUR
timezone: Europe/Paris
accounts:
  - id: bpce-settlement-account
    type: bank
    filenamePrefix: "bpce-settlement_"
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alex, ratio: 0.5 }
      - { partner: Sam, ratio: 0.5 }
buffers: []
recurring: []
autoTagRules:
  - category: ContributionAlex
    patterns:
      - "contribution alex"
  - category: ContributionSam
    patterns:
      - "contribution sam"
settlement:
  accounts:
    - account: "Income:ContributionAlex"
      partner: Alex
    - account: "Income:ContributionSam"
      partner: Sam
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

Given('a fresh temp dir with a migrated DB and accounting.yaml configured for settlement', function (state: ExplainWorld) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-explain-r4-'));
  state.subprocessTmpDir = tmpDir;
  writeSettlementYaml(tmpDir);
  const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
  if (migrateResult.status !== 0) throw new Error(`migrate failed: ${migrateResult.stderr}`);
});

Given('the settlement CSV fixture has been ingested non-interactively', function (state: ExplainWorld) {
  const tmpDir = state.subprocessTmpDir!;
  const csvDest = path.join(tmpDir, 'bpce-settlement_2026-06.csv');
  fs.copyFileSync(path.join(__dirname, '../../fixtures/csv/bpce-settlement.csv'), csvDest);
  const ingestResult = spawnCli(['ingest', '-f', csvDest, '--non-interactive'], { cwd: tmpDir });
  if (ingestResult.status !== 0) throw new Error(`ingest failed (status ${ingestResult.status}): ${ingestResult.stderr}`);
});

When('I run the explain binary with --as-of {string} and --json', function (state: ExplainWorld, asOf: string) {
  state.subprocessResult = spawnCli(['explain', '--as-of', asOf, '--json'], { cwd: state.subprocessTmpDir! });
});

Then('the explain subprocess exits with code {int}', function (state: ExplainWorld, code: number) {
  expect(state.subprocessResult!.status).toBe(code);
});

Then('the explain subprocess JSON output matches the documented shape', function (state: ExplainWorld) {
  const { stdout } = state.subprocessResult!;
  const parsed = JSON.parse(stdout) as { asOf: string; thisWindow: unknown; lastWindow: unknown; variance: unknown; followThrough: { perPartner?: Record<string, unknown> } };
  expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['asOf', 'thisWindow', 'lastWindow', 'variance', 'followThrough']));
  expect(parsed.asOf).toBe('2026-06-28');
});
