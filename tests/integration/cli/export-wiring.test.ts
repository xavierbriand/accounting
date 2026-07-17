/**
 * R4 composition-root subprocess test for the `export` command wiring
 * (story-4.5b) — required because program.ts is touched (CLAUDE.md § 8 R4).
 * `tests/features/export.feature` covers the export bundle's own behaviour
 * end-to-end; this file proves the composition-root plumbing specifically:
 * assertMigrated gating, the `./exports` default, and `export` joining
 * JSON_CAPABLE_COMMANDS (Commander parse errors get the --json envelope).
 *
 * Mechanism (R7): subprocess — invokes the dist CLI against a temp config +
 * real SQLite DB.
 *
 * fails if: `export` is not registered as a command, runs without a prior
 * `migrate` (assertMigrated not wired), does not default --out to ./exports,
 * or `export` is missing from JSON_CAPABLE_COMMANDS (a Commander parse error
 * under `export --json` would then bypass the failure envelope entirely).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-export-wiring-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function writeYaml(tmpDir: string): void {
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
buffers: []
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

describe('export wiring — R4 composition-root subprocess test', () => {
  it('refuses to run before migrate (assertMigrated gating)', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir);

    const result = spawnCli(['export'], { cwd: tmpDir });

    expect(result.status).toBe(2);
  });

  it('defaults --out to ./exports under cwd and writes a bundle there', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir);
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    const result = spawnCli(['export'], { cwd: tmpDir });

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'exports'))).toBe(true);
    const bundles = fs.readdirSync(path.join(tmpDir, 'exports'));
    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatch(/^accounting-export-/);
  });

  it('export --json --nope (unknown option) envelopes INVALID_ARGUMENT naming "export" (JSON_CAPABLE_COMMANDS)', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['export', '--json', '--nope'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toMatchObject({
      command: 'export',
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('a custom --out directory is honored', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir);
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    const result = spawnCli(['export', '--out', 'my-backup'], { cwd: tmpDir });

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'my-backup'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'exports'))).toBe(false);
  });
});
