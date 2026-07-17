/**
 * Integration tests for FsDataExporter's atomicity/permissions/refusal wrapper
 * (story-4.5b, R2 surface) — `.partial` + atomic rename, `0700` dir / `0600`
 * files, and "target already exists → refuse, never overwrite."
 * Content-correctness tests live in the sibling fs-data-exporter.test.ts
 * (P3/R13 plan finding #15 re-slice).
 *
 * Gherkin coverage: none directly — underpins tests/features/export.feature's
 *   "failed export leaves nothing plausible behind" scenario.
 *
 * fails if: a crashed/failed write leaves a plausible-but-incomplete bundle
 *   directory (only `.partial` should ever remain, and only on failure — never
 *   after success), the bundle directory/files aren't least-privilege, or a
 *   repeat export silently overwrites an existing bundle.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { FsDataExporter } from '../../../../src/infra/export/fs-data-exporter.js';

const tmpDirs: string[] = [];
const dbs: Database.Database[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-data-exporter-atomicity-'));
  tmpDirs.push(dir);
  return dir;
}

function setUpDb(): { db: Database.Database; tmpDir: string } {
  const tmpDir = makeTmpDir();
  const db = new Database(path.join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbs.push(db);
  return { db, tmpDir };
}

function writeYaml(tmpDir: string): string {
  const yamlPath = path.join(tmpDir, 'accounting.yaml');
  fs.writeFileSync(yamlPath, 'dbPath: ./test.db\n', 'utf8');
  return yamlPath;
}

describe('FsDataExporter.writeBundle() — permissions', () => {
  it.skipIf(process.platform === 'win32')('creates the bundle directory with mode 0700', async () => {
    const { db, tmpDir } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(tmpDir));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'perm-bundle');
    expect(result.isSuccess).toBe(true);

    const stat = fs.statSync(result.value.location);
    expect(stat.mode & 0o777).toBe(0o700);
  });

  it.skipIf(process.platform === 'win32')('creates every bundle file with mode 0600', async () => {
    const { db, tmpDir } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(tmpDir));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'perm-bundle-files');
    expect(result.isSuccess).toBe(true);

    for (const name of ['transactions.csv', 'transaction-entries.csv', 'domain-events.json', 'accounting.yaml', 'manifest.json']) {
      const stat = fs.statSync(path.join(result.value.location, name));
      expect(stat.mode & 0o777, `${name} mode`).toBe(0o600);
    }
  });
});

describe('FsDataExporter.writeBundle() — atomic rename', () => {
  it('leaves no .partial remnant after a successful write', async () => {
    const { db, tmpDir } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(tmpDir));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'atomic-bundle');
    expect(result.isSuccess).toBe(true);

    const entries = fs.readdirSync(outDir);
    expect(entries).toEqual(['atomic-bundle']);
  });

  it('sweeps the .partial directory and leaves no final bundle on a forced write failure', async () => {
    const { db, tmpDir } = setUpDb();
    // resolvedConfigPath points at a file that does not exist — readFileSync
    // throws mid-write, after the content CSVs are already staged under .partial.
    const exporter = new FsDataExporter(db, path.join(tmpDir, 'does-not-exist.yaml'));
    const outDir = makeTmpDir();
    const result = await exporter.writeBundle(outDir, 'crash-bundle');

    expect(result.isFailure).toBe(true);
    const entries = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
    expect(entries, `unexpected remnants: ${entries.join(', ')}`).toHaveLength(0);
  });
});

describe('FsDataExporter.writeBundle() — exists-refusal', () => {
  it('refuses and leaves the existing bundle untouched when the target directory already exists', async () => {
    const { db, tmpDir } = setUpDb();
    const exporter = new FsDataExporter(db, writeYaml(tmpDir));
    const outDir = makeTmpDir();

    const first = await exporter.writeBundle(outDir, 'repeat-bundle');
    expect(first.isSuccess).toBe(true);
    const originalManifest = fs.readFileSync(path.join(outDir, 'repeat-bundle', 'manifest.json'), 'utf8');

    const second = await exporter.writeBundle(outDir, 'repeat-bundle');
    expect(second.isFailure).toBe(true);

    const manifestAfter = fs.readFileSync(path.join(outDir, 'repeat-bundle', 'manifest.json'), 'utf8');
    expect(manifestAfter).toBe(originalManifest);
    expect(fs.existsSync(path.join(outDir, 'repeat-bundle.partial'))).toBe(false);
  });
});
