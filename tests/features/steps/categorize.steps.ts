import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';

interface CategorizeWorld {
  tmpDir?: string;
  csvPath?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
  initialYamlContent?: string;
  originalYamlContent?: string;
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-categorize-bdd-'));
  tmpDirs.push(dir);
  return dir;
}

const CSV_HEADER = 'Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation';

function makeRow(description: string, index: number): string {
  const safe = description.replace(/;/g, ',');
  return `15/03/2026;${safe};${safe};REF${index.toString().padStart(3, '0')};;Carte;Loisirs;Abonnements;-42,00;;15/03/2026;15/03/2026;0`;
}

function writeCategorizeTestCsv(tmpDir: string, rows: Array<{ description: string; count: number }>): string {
  const csvPath = path.join(tmpDir, 'bpce-valid_categorize.csv');
  const dataRows: string[] = [];
  let idx = 1;
  for (const { description, count } of rows) {
    for (let i = 0; i < count; i++) {
      dataRows.push(makeRow(description, idx++));
    }
  }
  const content = [CSV_HEADER, ...dataRows].join('\n') + '\n';
  fs.writeFileSync(csvPath, content, 'latin1');
  return csvPath;
}

// -------- Given steps --------

Given('a fresh accounting.yaml with no autoTagRules entry in a temp dir', function (state: CategorizeWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  writeStubYaml(tmpDir);
});

Given('an accounting.yaml whose autoTagRules.Transport.patterns include {string} in a temp dir', function (state: CategorizeWorld, pattern: string) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  writeStubYaml(tmpDir, {
    autoTagRules: [{ category: 'Transport', patterns: [pattern] }],
  });
});

Given('an accounting.yaml whose autoTagRules cover {string} and {string} in a temp dir', function (state: CategorizeWorld, pattern1: string, pattern2: string) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  writeStubYaml(tmpDir, {
    autoTagRules: [
      { category: 'Transport', patterns: [pattern1] },
      { category: 'Insurance', patterns: [pattern2] },
    ],
  });
});

Given('a BPCE CSV with three rows for {string} and four rows for {string}', function (state: CategorizeWorld, desc1: string, desc2: string) {
  state.csvPath = writeCategorizeTestCsv(state.tmpDir!, [
    { description: desc1, count: 3 },
    { description: desc2, count: 4 },
  ]);
});

Given('a BPCE CSV with three rows for {string} and three rows for {string}', function (state: CategorizeWorld, desc1: string, desc2: string) {
  state.csvPath = writeCategorizeTestCsv(state.tmpDir!, [
    { description: desc1, count: 3 },
    { description: desc2, count: 3 },
  ]);
});

Given('a BPCE CSV with two rows for {string} and two rows for {string}', function (state: CategorizeWorld, desc1: string, desc2: string) {
  state.csvPath = writeCategorizeTestCsv(state.tmpDir!, [
    { description: desc1, count: 2 },
    { description: desc2, count: 2 },
  ]);
  // Capture YAML content for byte-identity checks in scenarios 5/6 and 3
  const yamlContent = fs.readFileSync(path.join(state.tmpDir!, 'accounting.yaml'), 'utf8');
  state.initialYamlContent = yamlContent;
  state.originalYamlContent = yamlContent;
});

Given('a BPCE CSV with one row for {string} and three rows for {string}', function (state: CategorizeWorld, desc1: string, desc2: string) {
  state.csvPath = writeCategorizeTestCsv(state.tmpDir!, [
    { description: desc1, count: 1 },
    { description: desc2, count: 3 },
  ]);
});

Given('a BPCE CSV with three distinct recurring merchants', function (state: CategorizeWorld) {
  state.csvPath = writeCategorizeTestCsv(state.tmpDir!, [
    { description: 'MERCHANT ALPHA', count: 3 },
    { description: 'MERCHANT BETA', count: 2 },
    { description: 'MERCHANT GAMMA', count: 2 },
  ]);
});

// -------- When steps --------

When('I run categorize with a script defining AutoInsurance for ALTIMA and Transport for UBER', function (state: CategorizeWorld) {
  const script = JSON.stringify([
    // UBER FRANCE has 4 occurrences, ALTIMA COURTAGE 9876 has 3 → UBER is first by frequency
    { type: 'selectCategory', action: 'change', category: 'Transport' },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'uber' },
    { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'altima' },
  ]);
  state.lastResult = spawnCli(
    ['categorize', '--file', state.csvPath!, '--scripted-prompts', script],
    { cwd: state.tmpDir, env: { NODE_ENV: 'test' } },
  );
});

When('I run categorize with a script only for the ALTIMA group', function (state: CategorizeWorld) {
  const script = JSON.stringify([
    { type: 'selectCategory', action: 'change', category: 'AutoInsurance' },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'altima' },
  ]);
  state.lastResult = spawnCli(
    ['categorize', '--file', state.csvPath!, '--scripted-prompts', script],
    { cwd: state.tmpDir, env: { NODE_ENV: 'test' } },
  );
});

When('I run categorize without scripted prompts', function (state: CategorizeWorld) {
  state.lastResult = spawnCli(
    ['categorize', '--file', state.csvPath!],
    { cwd: state.tmpDir },
  );
});

When('I run categorize with a script only for the RECURRING MERCHANT group', function (state: CategorizeWorld) {
  const script = JSON.stringify([
    { type: 'selectCategory', action: 'change', category: 'Shopping' },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'recurring' },
  ]);
  state.lastResult = spawnCli(
    ['categorize', '--file', state.csvPath!, '--scripted-prompts', script],
    { cwd: state.tmpDir, env: { NODE_ENV: 'test' } },
  );
});

When('I run categorize with --non-interactive', function (state: CategorizeWorld) {
  state.lastResult = spawnCli(
    ['categorize', '--file', state.csvPath!, '--non-interactive'],
    { cwd: state.tmpDir },
  );
});

When('I run categorize with --json and a script that remembers two rules and skips the third', function (state: CategorizeWorld) {
  // MERCHANT ALPHA (3 occurrences) → first; MERCHANT BETA (2) → second; MERCHANT GAMMA (2) → third
  // Tie-break between BETA and GAMMA is insertion order (Map preserves order)
  const script = JSON.stringify([
    { type: 'selectCategory', action: 'change', category: 'Groceries' },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'alpha' },
    { type: 'selectCategory', action: 'change', category: 'Shopping' },
    { type: 'confirmRememberRule', action: 'remember', pattern: 'beta' },
    { type: 'selectCategory', action: 'keep' },
  ]);
  state.lastResult = spawnCli(
    ['categorize', '--file', state.csvPath!, '--json', '--scripted-prompts', script],
    { cwd: state.tmpDir, env: { NODE_ENV: 'test' } },
  );
});

// -------- Then steps --------

Then('accounting.yaml on disk contains {string}', function (state: CategorizeWorld, needle: string) {
  const yamlContent = fs.readFileSync(path.join(state.tmpDir!, 'accounting.yaml'), 'utf8');
  expect(yamlContent).toContain(needle);
});

Then('no .db file exists in the temp dir', function (state: CategorizeWorld) {
  const files = fs.readdirSync(state.tmpDir!);
  const dbFiles = files.filter((f) => f.endsWith('.db'));
  expect(dbFiles).toHaveLength(0);
});

Then('the script is fully consumed without errors', function (state: CategorizeWorld) {
  expect(state.lastResult!.stderr).not.toContain('ScriptedPrompter: expected next entry');
  expect(state.lastResult!.stderr).not.toContain('ScriptedPrompter: script exhausted');
});

Then('accounting.yaml is unchanged', function (state: CategorizeWorld) {
  const currentContent = fs.readFileSync(path.join(state.tmpDir!, 'accounting.yaml'), 'utf8');
  expect(currentContent).toBe(state.initialYamlContent!);
});

Then('accounting.yaml is byte-identical to the original', function (state: CategorizeWorld) {
  const currentContent = fs.readFileSync(path.join(state.tmpDir!, 'accounting.yaml'), 'utf8');
  expect(currentContent).toBe(state.originalYamlContent!);
});

Then('stdout is valid JSON', function (state: CategorizeWorld) {
  expect(() => JSON.parse(state.lastResult!.stdout.trim())).not.toThrow();
});

Then('the JSON summary.candidateGroups equals {int}', function (state: CategorizeWorld, expected: number) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const summary = json['summary'] as Record<string, unknown>;
  expect(summary['candidateGroups']).toBe(expected);
});

Then('the JSON summary.rulesAdded equals {int}', function (state: CategorizeWorld, expected: number) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const summary = json['summary'] as Record<string, unknown>;
  expect(summary['rulesAdded']).toBe(expected);
});

Then('the JSON summary.rulesSkippedByUser equals {int}', function (state: CategorizeWorld, expected: number) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const summary = json['summary'] as Record<string, unknown>;
  expect(summary['rulesSkippedByUser']).toBe(expected);
});

Then('the JSON rules array has {int} entries', function (state: CategorizeWorld, expected: number) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const rules = json['rules'] as unknown[];
  expect(rules).toHaveLength(expected);
});
