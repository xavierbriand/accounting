/**
 * R4 composition-root subprocess test for Commander's own parse-time errors
 * (missing required option/argument, unknown option) under `--json`.
 *
 * Story-maint-26: Commander catches these failures in its own parser, before any
 * command action handler runs — entirely bypassing src/cli/utils/json-envelope.ts.
 * This suite proves program.ts's `exitOverride()` + catch translates them into the
 * same INVALID_ARGUMENT failure envelope every other CLI failure already produces.
 *
 * Mechanism (R7): subprocess — invokes `node dist/cli/program.js <command> --json ...`.
 * No accounting.yaml/DB fixture is needed: Commander's own parser rejects these
 * invocations before config/DB load ever runs. A tmp cwd is still used per this
 * suite's existing spawn-cli precedent (status-program.test.ts), keeping the test
 * isolated from wherever it happens to run.
 *
 * fails if program.ts doesn't call `exitOverride()` and catch the resulting
 * CommanderError, or if the catch doesn't recognize the specific Commander error
 * code being exercised.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnCli } from '../../_helpers/spawn-cli.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-parse-error-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('Commander parse-time errors — --json envelope (story-maint-26)', () => {
  it('ingest --json with -f omitted exits 2 and envelopes INVALID_ARGUMENT as the final stderr line', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['ingest', '--json'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toEqual({
      command: 'ingest',
      ok: false,
      error: {
        code: 'INVALID_ARGUMENT',
        message: "required option '-f, --file <path>' not specified",
      },
    });
  });
});
