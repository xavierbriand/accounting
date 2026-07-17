import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { spawnCli } from '../../_helpers/spawn-cli.js';

interface ConfigChangeWorld {
  tmpDir?: string;
  dbPath?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
}

const dbs: Database.Database[] = [];
const tmpDirs: string[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-config-change-'));
  tmpDirs.push(dir);
  return dir;
}

// Regular (non-cosmetic) layout: buffer target is the only value this suite varies.
function writeYaml(tmpDir: string, bufferTarget: number): void {
  const yaml = `\
dbPath: ./test.db
defaultCurrency: EUR
timezone: Europe/Paris
accounts:
  - id: main-account
    type: bank
    filenamePrefix: "main_"
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alice, ratio: 0.5 }
      - { partner: Bob, ratio: 0.5 }
buffers:
  - name: Vacation
    account: vacation-account
    target: ${bufferTarget}
    targetDate: "2026-12-01"
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

// Same semantic content as writeYaml, but top-level keys reordered and padded with
// comments/blank lines — proves canonicalConfigForm ignores YAML surface form.
function writeCosmeticVariantYaml(tmpDir: string, bufferTarget: number): void {
  const yaml = `\
# household rules
timezone: Europe/Paris

buffers:
  - name: Vacation
    account: vacation-account
    target: ${bufferTarget}
    targetDate: "2026-12-01"

defaultCurrency: EUR
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Bob, ratio: 0.5 }
      - { partner: Alice, ratio: 0.5 }
# accounts below
accounts:
  - id: main-account
    type: bank
    filenamePrefix: "main_"
dbPath: ./test.db
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

function writeSensitiveYaml(tmpDir: string): void {
  const yaml = `\
dbPath: ./test.db
defaultCurrency: EUR
timezone: Europe/Paris
accounts:
  - id: main-account
    type: bank
    filenamePrefix: "main_"
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alice, ratio: 0.5 }
      - { partner: Bob, ratio: 0.5 }
buffers:
  - name: Vacation
    account: DE89370400440532013000
    target: 1500
    targetDate: "2026-12-01"
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

function configChangedRows(dbPath: string): Array<{ payload: string }> {
  const db = new Database(dbPath);
  dbs.push(db);
  return db
    .prepare("SELECT payload FROM domain_events WHERE event_type = 'ConfigChanged'")
    .all() as Array<{ payload: string }>;
}

Given('a migrated project with accounting.yaml containing buffer {string} target {int}', function (
  state: ConfigChangeWorld,
  _bufferName: string,
  target: number,
) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  state.dbPath = path.join(tmpDir, 'test.db');
  writeYaml(tmpDir, target);
  const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
  expect(migrateResult.status, `migrate stderr: ${migrateResult.stderr}`).toBe(0);
});

When('the user edits the buffer {string} target to {int} in accounting.yaml and runs status', function (
  state: ConfigChangeWorld,
  _bufferName: string,
  target: number,
) {
  writeYaml(state.tmpDir!, target);
  state.lastResult = spawnCli(['status'], { cwd: state.tmpDir });
});

// 'the process exits with code {int}' and 'stderr contains {string}' are registered in
// ingest.steps.ts; ConfigChangeWorld's lastResult shape matches so those shared steps apply here.

Then('the audit trail holds one ConfigChanged event with origin {string}', function (
  state: ConfigChangeWorld,
  origin: string,
) {
  const rows = configChangedRows(state.dbPath!);
  expect(rows).toHaveLength(1);
  const payload = JSON.parse(rows[0].payload) as { origin: string };
  expect(payload.origin).toBe(origin);
});

Then('the ConfigChanged diff names {string} changing from {string} to {string}', function (
  state: ConfigChangeWorld,
  key: string,
  previous: string,
  current: string,
) {
  const rows = configChangedRows(state.dbPath!);
  expect(rows).toHaveLength(1);
  const payload = JSON.parse(rows[0].payload) as {
    changedSections: Array<{ section: string; entries: Array<{ key: string; previous?: string; current?: string }> }>;
  };
  const entry = payload.changedSections
    .flatMap((s) => s.entries)
    .find((e) => e.key === key);
  expect(entry, `no entry with key ${key} in ${JSON.stringify(payload.changedSections)}`).toBeDefined();
  expect(entry?.previous).toBe(previous);
  expect(entry?.current).toBe(current);
});

Then('running status again records no further ConfigChanged event', function (state: ConfigChangeWorld) {
  const again = spawnCli(['status'], { cwd: state.tmpDir });
  expect(again.status, `stderr: ${again.stderr}`).toBe(0);
  const rows = configChangedRows(state.dbPath!);
  expect(rows).toHaveLength(1);
});

When('the user reorders top-level keys and adds comments with no value change in accounting.yaml and runs status twice', function (
  state: ConfigChangeWorld,
) {
  writeCosmeticVariantYaml(state.tmpDir!, 1500);
  const first = spawnCli(['status'], { cwd: state.tmpDir });
  expect(first.status, `stderr: ${first.stderr}`).toBe(0);
  const second = spawnCli(['status'], { cwd: state.tmpDir });
  expect(second.status, `stderr: ${second.stderr}`).toBe(0);
});

Then('no ConfigChanged event is recorded on either run', function (state: ConfigChangeWorld) {
  const rows = configChangedRows(state.dbPath!);
  expect(rows).toHaveLength(0);
});

Given('accounting.yaml contains an IBAN-shaped string in a buffer account field', function (state: ConfigChangeWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  state.dbPath = path.join(tmpDir, 'test.db');
  writeSensitiveYaml(tmpDir);
});

When('the user runs status', function (state: ConfigChangeWorld) {
  state.lastResult = spawnCli(['status'], { cwd: state.tmpDir });
});

Then('no database file is created', function (state: ConfigChangeWorld) {
  const files = fs.readdirSync(state.tmpDir!);
  const dbFiles = files.filter((f) => f.endsWith('.db'));
  expect(dbFiles, `db files found: ${dbFiles.join(', ')}`).toHaveLength(0);
});
