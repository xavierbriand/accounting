/**
 * R4 composition-root subprocess test for `accounting status`.
 * Required because program.ts is touched (CLAUDE.md § 8 R4).
 *
 * Mechanism (R7): subprocess — invokes `node dist/cli/program.js status --json --as-of 2026-04-29`
 * against a temp config + migrated SQLite DB (created in-process before launch).
 *
 * fails if (a) the `status` subcommand is not registered in program.ts, (b) the JSON
 * output is malformed, or (c) any required top-level key is missing from the document.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-status-r4-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function writeStatusYaml(tmpDir: string): void {
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
      - { partner: Alex, ratio: 0.6 }
      - { partner: Sam, ratio: 0.4 }
buffers:
  - name: Vacation
    account: vacation-account
    target: 1200
    targetDate: "2026-12-01"
recurring:
  - name: Netflix
    category: Subscriptions
    cadence: monthly
    amount: 12.99
    validFrom: "2026-01-15"
`;
  fs.writeFileSync(path.join(tmpDir, 'accounting.yaml'), yaml, 'utf8');
}

describe('accounting status — R4 composition-root subprocess test', () => {
  it('node dist/cli/program.js status --json --as-of 2026-04-29 produces valid JSON with required keys', () => {
    const tmpDir = makeTmpDir();
    writeStatusYaml(tmpDir);

    // Migrate the DB
    const migrateResult = spawnCli(['migrate'], { cwd: tmpDir });
    expect(migrateResult.stderr).not.toMatch(/error:/i);

    // Run status
    const result = spawnCli(['status', '--json', '--as-of', '2026-04-29'], { cwd: tmpDir });

    // Parse and validate the envelope + JSON shape (story-4.4b: {command, ok, data})
    let envelope: { command: string; ok: boolean; data: Record<string, unknown> };
    try {
      envelope = JSON.parse(result.stdout) as { command: string; ok: boolean; data: Record<string, unknown> };
    } catch (e) {
      throw new Error(
        `stdout was not valid JSON: ${e instanceof Error ? e.message : String(e)}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
        { cause: e },
      );
    }

    expect(result.status).toBe(0);
    expect(envelope.command).toBe('status');
    expect(envelope.ok).toBe(true);
    expect(Object.keys(envelope.data)).toEqual(expect.arrayContaining(['asOf', 'window', 'buffers', 'transfer', 'forecast']));

    const doc = envelope.data as {
      asOf: string;
      window: { from: string; to: string };
      buffers: unknown[];
      transfer: { totalRequired?: string };
      forecast: unknown[];
    };

    expect(doc.asOf).toBe('2026-04-29');
    expect(doc.window.from).toBe('2026-05-01');
    expect(doc.window.to).toBe('2026-05-31');
    expect(doc.buffers).toHaveLength(1);
    expect(typeof doc.transfer.totalRequired).toBe('string');
    expect(doc.forecast).toHaveLength(1);
  });

  it('exits 2 for invalid --as-of format', () => {
    const tmpDir = makeTmpDir();
    writeStatusYaml(tmpDir);
    spawnCli(['migrate'], { cwd: tmpDir });

    const result = spawnCli(['status', '--as-of', 'not-a-date'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('must be ISO 8601');
  });
});
