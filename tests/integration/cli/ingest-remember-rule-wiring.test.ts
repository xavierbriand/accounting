/**
 * Integration test (R4): ingest CLI subprocess exercises the remember-this-rule flow
 * end-to-end through the composition root (program.ts).
 *
 * Gherkin coverage:
 *   - "Scenario: ingest CLI subprocess writes YAML before committing DB (R4)"
 *     (Gherkin scenario 14 in docs/plans/story-C.md)
 *   - "Scenario: ingest CLI subprocess aborts when YAML mtime drifts mid-session (R4)"
 *     (Gherkin scenario 15 in docs/plans/story-C.md)
 *
 * Mechanism: --scripted-prompts <json> CLI flag (gated by NODE_ENV=test in program.ts).
 * The flag feeds a ScriptedPrompter so the subprocess avoids Inquirer's raw-mode TTY
 * requirement. INQUIRER_FORCE_TTY=0 is not supported by @inquirer/prompts v8.x
 * (no env-var escape hatch in create-prompt.js). Choice noted in return report Deviations.
 *
 * fails if (scenario 14): program.ts doesn't wire YamlConfigWriter, or YAML-then-DB ordering
 *   is reversed, or the --scripted-prompts flag is absent/broken.
 * fails if (scenario 15): mtime check is absent or doesn't abort the ingest before DB write.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';
import { runMigrations } from '../../../src/infra/db/migrator.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-remember-wiring-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

/**
 * Writes a synthetic CSV with one row for account prefix "bpce-valid_".
 * Description "ALTIMA COURTAGE" should produce suggestPattern => "courtage".
 */
function writeSingleRowCsv(dir: string, filename: string): string {
  const csvPath = path.join(dir, filename);
  const header = 'Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation';
  const row = '15/03/2026;ALTIMA COURTAGE;ALTIMA COURTAGE;REF001;;Carte;Loisirs;Abonnements;-42,00;;15/03/2026;15/03/2026;0';
  fs.writeFileSync(csvPath, `${header}\n${row}\n`, 'latin1');
  return csvPath;
}

/**
 * Encodes a scripted-prompts JSON payload for:
 *   1. selectCategory: change → AutoInsurance (action: 'change', category: 'AutoInsurance')
 *   2. confirmBatch: true
 *   3. confirmRememberRule: remember with pattern 'courtage'
 */
function makeScriptedPromptsHappyPath(): string {
  return JSON.stringify([
    { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
    { type: 'confirmBatch', confirm: true },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'courtage' },
  ]);
}

/**
 * Encodes a scripted-prompts payload where the user confirms remember, but
 * we will touch the YAML between process start and flush to trigger mtime drift.
 * Same answers as happy path; the drift is injected externally.
 */
function makeScriptedPromptsRememberThenFlush(): string {
  return makeScriptedPromptsHappyPath();
}

describe('ingest-remember-rule-wiring (R4 subprocess — Story C)', () => {
  it(
    'Scenario 14: YAML is updated with AutoInsurance.patterns=["courtage"] and DB has tagged transaction',
    () => {
      // fails if: program.ts does not wire YamlConfigWriter, or YAML-then-DB ordering is reversed,
      //   or --scripted-prompts is absent, or the ScriptedPrompter doesn't feed confirmRememberRule.
      const tmpDir = makeTmpDir();

      // Write a YAML with no autoTagRules so "ALTIMA COURTAGE" comes through as low-confidence
      writeStubYaml(tmpDir, {
        autoTagRules: [{ category: 'Transport', patterns: ['uber'] }],
      });
      spawnCli(['migrate'], { cwd: tmpDir });

      const csvPath = writeSingleRowCsv(tmpDir, 'bpce-valid_2026.csv');
      const scriptedPrompts = makeScriptedPromptsHappyPath();

      const result = spawnCli(
        ['ingest', '--file', csvPath, '--scripted-prompts', scriptedPrompts],
        { cwd: tmpDir, env: { NODE_ENV: 'test' } },
      );

      // Should exit 0
      expect(result.status, `stderr: ${result.stderr}`).toBe(0);

      // YAML on disk should now contain AutoInsurance with pattern "courtage"
      const dbPath = path.join(tmpDir, 'test.db');
      const yamlPath = path.join(tmpDir, 'accounting.yaml');
      const yamlContent = fs.readFileSync(yamlPath, 'utf8');
      expect(yamlContent).toContain('AutoInsurance');
      expect(yamlContent).toContain('courtage');

      // DB should contain the new transaction tagged as AutoInsurance
      const db = new Database(dbPath);
      const row = db.prepare("SELECT category FROM transactions LIMIT 1").get() as { category: string } | undefined;
      db.close();
      expect(row).toBeDefined();
      expect(row!.category).toBe('Expense:AutoInsurance');
    },
  );

  it(
    'Scenario 15: YAML mtime drift aborts ingest — exits 5, DB unchanged',
    () => {
      // fails if: mtime check is absent in YamlConfigWriter, or DB commit proceeds despite
      //   YAML write failure, or exit code is not 5.
      const tmpDir = makeTmpDir();

      writeStubYaml(tmpDir, {
        autoTagRules: [{ category: 'Transport', patterns: ['uber'] }],
      });
      spawnCli(['migrate'], { cwd: tmpDir });

      const csvPath = writeSingleRowCsv(tmpDir, 'bpce-valid_2026.csv');
      const yamlPath = path.join(tmpDir, 'accounting.yaml');

      // Touch the YAML *after* the process reads it (simulated via a hook)
      // Since we can't inject a mid-run touch into the subprocess, we modify the
      // YAML before the subprocess starts AND supply a stale mtime via a special
      // env var --scripted-prompts-yaml-touch that causes program.ts to use a
      // deliberately wrong expectedMtimeNs (bigint 0n simulates "captured at T0 but
      // now file is at T1").
      //
      // Implementation: the scripted-prompts flag can carry a special "forceMtimeRace"
      // field in the JSON. If present, program.ts (in NODE_ENV=test) uses BigInt(0) as
      // expectedMtimeNs instead of the real statSync value.
      const scriptedWithRace = JSON.stringify([
        { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
        { type: 'confirmBatch', confirm: true },
        { type: 'confirmRememberRule', action: 'remember', pattern: 'courtage' },
        { type: '__forceMtimeRace__' },
      ]);

      const dbPath = path.join(tmpDir, 'test.db');
      const dbBefore = new Database(dbPath);
      runMigrations(dbBefore);
      const countBefore = (dbBefore.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
      dbBefore.close();

      const result = spawnCli(
        ['ingest', '--file', csvPath, '--scripted-prompts', scriptedWithRace],
        { cwd: tmpDir, env: { NODE_ENV: 'test' } },
      );

      // Should exit 5 (YAML write failed)
      expect(result.status, `stderr: ${result.stderr}`).toBe(5);
      expect(result.stderr).toMatch(/changed externally|mtime|config changed/i);

      // DB should be unchanged
      const dbAfter = new Database(dbPath);
      const countAfter = (dbAfter.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
      dbAfter.close();
      expect(countAfter).toBe(countBefore);
    },
  );
});
