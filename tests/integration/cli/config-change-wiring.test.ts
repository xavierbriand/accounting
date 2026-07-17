/**
 * R4 composition-root subprocess test for observe-config-change wiring (story-4.5a).
 * Required because program.ts is touched (CLAUDE.md § 8 R4).
 *
 * Mechanism (R7): subprocess — invokes the dist CLI against a temp config + real SQLite DB.
 *
 * Gherkin coverage: tests/features/config-change.feature exercises the `status` command
 *   specifically; this test proves the SAME wiring reaches `migrate`, `ingest`, `correct`,
 *   `explain`, and `export` too (the plan's "one helper, one call per command" surface
 *   spans six commands — the acceptance scenario alone only demonstrates one of them).
 *
 * fails if (R4): `migrate` does not save a baseline on first run, or `ingest`/`correct`/
 *   `explain`/`export` do not call the observation helper after assertMigrated (each
 *   would then never record a pending config change before eventually running their own
 *   command logic — a bug here would only surface as a "config change silently missed"
 *   defect, not a command-level failure, since the underlying command paths tolerate a
 *   missing/dangling argument long enough to reach the wiring point first; `export`'s own
 *   --out validation runs after the wiring point, so even a doomed --out still proves it
 *   fired — story-4.5b).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { spawnCli } from '../../_helpers/spawn-cli.js';

const tmpDirs: string[] = [];
const dbs: Database.Database[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-config-change-wiring-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function writeYaml(tmpDir: string, timezone: string): void {
  const yaml = `\
dbPath: ./test.db
defaultCurrency: EUR
timezone: ${timezone}
accounts:
  - id: main-account
    type: bank
    filenamePrefix: "main_"
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alice, ratio: 0.5 }
      - { partner: Bob, ratio: 0.5 }
buffers: []
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

function configStateRowCount(dbPath: string): number {
  const db = new Database(dbPath);
  dbs.push(db);
  return (db.prepare('SELECT COUNT(*) as n FROM config_state').get() as { n: number }).n;
}

function configChangedEventCount(dbPath: string): number {
  const db = new Database(dbPath);
  dbs.push(db);
  return (db.prepare("SELECT COUNT(*) as n FROM domain_events WHERE event_type = 'ConfigChanged'").get() as { n: number }).n;
}

describe('observe-config-change wiring — R4 composition-root subprocess test', () => {
  it('migrate saves a baseline into config_state on first run', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir, 'Europe/Paris');

    const result = spawnCli(['migrate'], { cwd: tmpDir });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);

    expect(configStateRowCount(path.join(tmpDir, 'test.db'))).toBe(1);
  });

  it('explain detects and records a change made after migrate (no other command in between)', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    writeYaml(tmpDir, 'Europe/Paris');
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    writeYaml(tmpDir, 'Europe/Berlin');
    const result = spawnCli(['explain'], { cwd: tmpDir });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);

    expect(configChangedEventCount(dbPath)).toBe(1);
  });

  it('correct detects and records a change (even though the target transaction id does not exist)', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    writeYaml(tmpDir, 'Europe/Paris');
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    writeYaml(tmpDir, 'Europe/Berlin');
    // The wiring point (right after assertMigrated) runs before correct-command.ts looks
    // the transaction id up — a bogus id still proves the wiring fired, without needing
    // to seed a real transaction first.
    spawnCli(['correct', 'does-not-exist', '--reason', 'wiring check'], { cwd: tmpDir });

    expect(configChangedEventCount(dbPath)).toBe(1);
  });

  it('ingest detects and records a change (even though the CSV file does not exist)', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    writeYaml(tmpDir, 'Europe/Paris');
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    writeYaml(tmpDir, 'Europe/Berlin');
    // Same reasoning as the correct-command case above: the wiring point precedes the
    // CSV read, so a nonexistent file path still proves the wiring fired.
    spawnCli(['ingest', '--file', path.join(tmpDir, 'does-not-exist.csv')], { cwd: tmpDir });

    expect(configChangedEventCount(dbPath)).toBe(1);
  });

  it('export detects and records a change (story-4.5b — the sixth ledger-opening command)', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    writeYaml(tmpDir, 'Europe/Paris');
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    writeYaml(tmpDir, 'Europe/Berlin');
    // The wiring point (right after assertMigrated) precedes export's own --out
    // resolution/validation, so a normal export run still proves the wiring fired.
    const result = spawnCli(['export'], { cwd: tmpDir });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);

    expect(configChangedEventCount(dbPath)).toBe(1);
  });

  it('dissolve detects and records a change (story-4.5c — the seventh observed command)', () => {
    const tmpDir = makeTmpDir();
    const dbPath = path.join(tmpDir, 'test.db');
    writeYaml(tmpDir, 'Europe/Paris');
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    writeYaml(tmpDir, 'Europe/Berlin');
    // The wiring point (right after assertMigrated) precedes dissolve's own
    // --bundle resolution — a bogus bundle dir still proves the wiring fired
    // (same reasoning as correct/ingest's bogus-argument cases above). This is
    // also the Phase-2 reversal itself: dissolve runs observeConfigChangeFor
    // like every sibling, so a config change since the export correctly trips
    // the staleness gate on a real run (the bundle's accounting.yaml copy is
    // now outdated) — this test only proves the observation fires, not the
    // staleness consequence (covered by dissolve-command's own unit tests).
    const result = spawnCli(['dissolve', '--bundle', 'does-not-exist', '--confirm'], { cwd: tmpDir });
    expect(result.status).toBe(2);

    expect(configChangedEventCount(dbPath)).toBe(1);
  });
});
