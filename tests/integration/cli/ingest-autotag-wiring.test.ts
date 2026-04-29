/**
 * R4 subprocess smoke test: ingest CLI subprocess wires config.autoTagRules into TransactionBuilder.
 *
 * Gherkin coverage (Story B):
 *   Scenario: ingest CLI subprocess wires config.autoTagRules into TransactionBuilder (R4 — composition root)
 *     Given a stub accounting.yaml whose autoTagRules contains { category: 'Transport', patterns: ["uber"] }
 *     And a CSV containing one description "UBER TRIP 2026"
 *     When the dist build is invoked via spawnCli
 *     Then the run reports one matching transaction tagged 'Transport'
 *
 * fails if program.ts:104 passes undefined or omits config.autoTagRules (guards the composition-root
 * wiring; in-process unit tests cannot prove this end-to-end path).
 *
 * Uses spawnCli (dist build) + writeStubYaml with autoTagRules override.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-autotag-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

const ONE_ROW_CSV = `Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation
22/04/2026;UBER TRIP 2026;PAIEMENT CB UBER TRIP 2026;REF001;;Carte;Transport;Transports en commun;-15,00;;22/04/2026;23/04/2026;0
`;

describe('ingest CLI autotag wiring (R4 subprocess smoke, Story B)', () => {
  it('transaction with matching description is tagged by config.autoTagRules — not by hardcoded defaults', () => {
    // fails if program.ts:104 passes undefined (or old DEFAULT_RULES) instead of config.autoTagRules.
    // The test name: "UBER TRIP 2026" matches pattern "uber" injected via writeStubYaml autoTagRules.
    // Without the wiring, the transaction would be Uncategorized (no rules = no match).
    const tmpDir = makeTmpDir();
    const csvPath = path.join(tmpDir, 'bpce-valid_autotag.csv');

    fs.writeFileSync(csvPath, ONE_ROW_CSV, 'utf8');
    writeStubYaml(tmpDir, {
      autoTagRules: [{ category: 'Transport', patterns: ['uber'] }],
    });

    spawnCli(['migrate'], { cwd: tmpDir });

    const result = spawnCli(
      ['ingest', '--file', csvPath, '--non-interactive', '--json'],
      { cwd: tmpDir },
    );

    // With the rule injected: 1 transaction tagged Transport (high confidence) → exit 0
    // Without the wiring: 1 transaction Uncategorized (low confidence) → exit 2
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/Found 1 new transaction/);
    expect(result.stderr).not.toMatch(/need manual review/);
  });
});
