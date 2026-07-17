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
 * code being exercised. This file-level clause covers the 4 INVALID_ARGUMENT-
 * translation tests (ingest/status/correct/categorize below); the passthrough,
 * scoping, and regression-guard tests each carry their own inline `fails if`.
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

  it('status --json --nope (unknown option, a command with no requiredOption) envelopes INVALID_ARGUMENT naming "status"', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['status', '--json', '--nope'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toMatchObject({
      command: 'status',
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('correct --json with the transactionId positional omitted envelopes INVALID_ARGUMENT naming "correct"', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['correct', '--json', '--reason', 'why'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toMatchObject({
      command: 'correct',
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('categorize --json with -f omitted envelopes INVALID_ARGUMENT naming "categorize"', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['categorize', '--json'], { cwd: tmpDir });

    expect(result.status).toBe(2);
    const lines = result.stderr.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    expect(JSON.parse(lastLine)).toMatchObject({
      command: 'categorize',
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('migrate --nope (a command outside JSON_CAPABLE_COMMANDS) keeps Commander\'s original exit code, no envelope', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['migrate', '--nope'], { cwd: tmpDir });

    // fails if: the exit-2 branch isn't scoped to JSON_CAPABLE_COMMANDS — migrate has
    // no --json mode (docs/cli-json-contract.md § 8) and never had an INVALID_ARGUMENT
    // call site, so it must keep Commander's own exit code (1) for a malformed
    // invocation, not the 5-known-commands' exit 2.
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown option '--nope'");
    expect(result.stderr).not.toContain('"ok":false');
  });

  it('ingest with -f omitted and no --json exits 2 (not Commander\'s old default of 1) with prose only, no JSON line', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['ingest'], { cwd: tmpDir });

    // fails if: writeJsonErrorIf's json-flag gate is broken and writes the envelope
    // even though --json isn't in argv, or the exit-2 consistency fix regresses back
    // to Commander's old default of 1 for this command.
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("required option '-f, --file <path>' not specified");
    expect(result.stderr).not.toContain('"ok":false');
  });

  it('--help exits 0 and prints usage, unaffected by exitOverride', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['--help'], { cwd: tmpDir });

    // fails if: COMMANDER_PASSTHROUGH_CODES doesn't include commander.helpDisplayed,
    // or exitOverride() breaks help output/exit-0 behavior entirely.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  it('--version exits 0 and prints the version, unaffected by exitOverride', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['--version'], { cwd: tmpDir });

    // fails if: COMMANDER_PASSTHROUGH_CODES doesn't include commander.version, or
    // exitOverride() breaks version output/exit-0 behavior entirely.
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('1.0.0');
  });

  it('an unrecognized subcommand under --json passes through unaffected — no envelope (deliberately out of scope)', () => {
    const tmpDir = makeTmpDir();

    const result = spawnCli(['bogus-command', '--json'], { cwd: tmpDir });

    // fails if: the final fallback process.exit(err.exitCode) is removed, changed, or
    // erroneously matched against COMMANDER_PARSE_ERROR_CODES/JSON_CAPABLE_COMMANDS —
    // commander.unknownCommand must keep Commander's original exit code (1) and never
    // gain an envelope, since there's no known command name to report.
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown command');
    expect(result.stderr).not.toContain('"ok":false');
  });
});
