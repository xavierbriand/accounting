/**
 * R4 composition-root subprocess test for the `dissolve` command wiring
 * (story-4.5c) — required because program.ts is touched (CLAUDE.md § 8 R4).
 * tests/features/dissolve.feature covers the wipe's own behaviour end-to-end;
 * this file proves the composition-root plumbing specifically: assertMigrated
 * gating, `--bundle` being required, and `dissolve` joining
 * JSON_CAPABLE_COMMANDS (Commander parse errors get the --json envelope).
 *
 * Mechanism (R7): subprocess — invokes the dist CLI against a temp config +
 * real SQLite DB.
 *
 * fails if: `dissolve` is not registered as a command, runs without a prior
 * `migrate` (assertMigrated not wired), `--bundle` is not a required option,
 * or `dissolve` is missing from JSON_CAPABLE_COMMANDS (a Commander parse
 * error under `dissolve --json` would then bypass the failure envelope
 * entirely).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-dissolve-wiring-'));
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

describe('dissolve wiring — R4 composition-root subprocess test', () => {
  it('refuses to run before migrate (assertMigrated gating)', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir);

    const result = spawnCli(['dissolve', '--bundle', 'nope', '--confirm'], { cwd: tmpDir });

    expect(result.status).toBe(2);
  });

  it('--bundle is a required option (Commander parse error)', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir);
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    const result = spawnCli(['dissolve', '--confirm'], { cwd: tmpDir });

    expect(result.status).toBe(2);
  });

  it('dissolve --json --nope (unknown option) envelopes INVALID_ARGUMENT naming "dissolve" (JSON_CAPABLE_COMMANDS)', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['dissolve', '--json', '--nope'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toMatchObject({
      command: 'dissolve',
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('a missing --bundle directory is refused with an INVALID_ARGUMENT envelope after migrate', () => {
    const tmpDir = makeTmpDir();
    writeYaml(tmpDir);
    expect(spawnCli(['migrate'], { cwd: tmpDir }).status).toBe(0);

    const result = spawnCli(['dissolve', '--bundle', 'does-not-exist', '--confirm', '--json'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toMatchObject({
      command: 'dissolve',
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });
});
