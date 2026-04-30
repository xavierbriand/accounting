/**
 * Integration test (R4): categorize CLI subprocess exercises the full composition root
 * (program.ts) end-to-end with a scripted prompter. Asserts YAML mutation and
 * critically NO .db file creation — the categorize command must not touch SQLite.
 *
 * Gherkin coverage:
 *   - Scenario 1: "scripted run appends two rules for the two recurring merchants"
 *   - Scenario 5 (all-matched): "all descriptions already covered — no YAML write, exit 0"
 *
 * Mechanism: --scripted-prompts <json> CLI flag (gated by NODE_ENV=test in program.ts).
 *
 * fails if (R4):
 *   (a) program.ts does not register the 'categorize' subcommand
 *   (b) the command attempts to open/create a SQLite database (no-DB-writes invariant)
 *   (c) YAML is not updated after a successful scripted categorize run
 *   (d) --scripted-prompts flag is absent or broken for categorize
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-categorize-wiring-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

const CSV_HEADER = 'Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation';

function writeTestCsv(
  dir: string,
  rows: Array<{ description: string; count: number }>,
): string {
  const csvPath = path.join(dir, 'bpce-valid_wiring.csv');
  const dataRows: string[] = [];
  let idx = 1;
  for (const { description, count } of rows) {
    for (let i = 0; i < count; i++) {
      const safe = description.replace(/;/g, ',');
      dataRows.push(`15/03/2026;${safe};${safe};REF${idx.toString().padStart(3, '0')};;Carte;Loisirs;Abonnements;-42,00;;15/03/2026;15/03/2026;0`);
      idx++;
    }
  }
  const content = [CSV_HEADER, ...dataRows].join('\n') + '\n';
  fs.writeFileSync(csvPath, content, 'latin1');
  return csvPath;
}

describe('categorize end-to-end wiring (R4 subprocess — Story D)', () => {
  it(
    'appends two rules to YAML and creates NO .db file',
    () => {
      // fails if: categorize subcommand is missing from program.ts, or YamlConfigWriter is
      //   not wired, or the command opens a SQLite DB (violating no-DB-writes invariant).
      const tmpDir = makeTmpDir();

      writeStubYaml(tmpDir);
      const csvPath = writeTestCsv(tmpDir, [
        { description: 'ALTIMA COURTAGE 9876', count: 3 },
        { description: 'UBER FRANCE', count: 4 },
      ]);

      // UBER FRANCE has 4 occurrences → shown first; ALTIMA has 3 → shown second
      const script = JSON.stringify([
        { type: 'selectCategory', action: 'change', category: 'Transport' },
        { type: 'confirmRememberRule', action: 'remember', pattern: 'uber' },
        { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
        { type: 'confirmRememberRule', action: 'remember', pattern: 'altima' },
      ]);

      const result = spawnCli(
        ['categorize', '--file', csvPath, '--scripted-prompts', script],
        { cwd: tmpDir, env: { NODE_ENV: 'test' } },
      );

      expect(result.status, `stderr: ${result.stderr}`).toBe(0);

      const yamlContent = fs.readFileSync(path.join(tmpDir, 'accounting.yaml'), 'utf8');
      expect(yamlContent).toContain('Transport');
      expect(yamlContent).toContain('uber');
      expect(yamlContent).toContain('AutoInsurance');
      expect(yamlContent).toContain('altima');

      // R4: no SQLite DB file created — categorize must not touch the DB layer
      const files = fs.readdirSync(tmpDir);
      const dbFiles = files.filter((f) => f.endsWith('.db'));
      expect(dbFiles, `db files found: ${dbFiles.join(', ')}`).toHaveLength(0);
    },
  );

  it(
    'all-already-matched: exits 0, YAML unchanged, no DB file',
    () => {
      // fails if: categorize writes YAML when all descriptions are already covered by existing rules,
      //   or creates a DB file (no-DB-writes invariant).
      const tmpDir = makeTmpDir();

      writeStubYaml(tmpDir, {
        autoTagRules: [
          { category: 'Transport', patterns: ['uber'] },
          { category: 'AutoInsurance', patterns: ['altima'] },
        ],
      });

      const yamlBefore = fs.readFileSync(path.join(tmpDir, 'accounting.yaml'), 'utf8');

      const csvPath = writeTestCsv(tmpDir, [
        { description: 'UBER FRANCE', count: 2 },
        { description: 'ALTIMA COURTAGE', count: 2 },
      ]);

      const result = spawnCli(
        ['categorize', '--file', csvPath],
        { cwd: tmpDir },
      );

      expect(result.status, `stderr: ${result.stderr}`).toBe(0);
      expect(result.stderr).toContain('0 rules added');

      const yamlAfter = fs.readFileSync(path.join(tmpDir, 'accounting.yaml'), 'utf8');
      expect(yamlAfter).toBe(yamlBefore);

      const files = fs.readdirSync(tmpDir);
      const dbFiles = files.filter((f) => f.endsWith('.db'));
      expect(dbFiles, `db files found: ${dbFiles.join(', ')}`).toHaveLength(0);
    },
  );
});
