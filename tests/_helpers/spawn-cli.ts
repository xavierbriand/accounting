import { spawnSync, spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DIST_CLI = path.resolve(__dirname, '../../dist/cli/program.js');

export interface SpawnResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SpawnOpts {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Runs the dist CLI synchronously and captures stdout/stderr.
 * Never throws — always returns a result object with status, stdout, stderr.
 */
export function spawnCli(args: string[], opts?: SpawnOpts): SpawnResult {
  const result = spawnSync('node', [DIST_CLI, ...args], {
    encoding: 'utf8',
    cwd: opts?.cwd,
    env: { ...process.env, ...opts?.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export interface InteractiveSpawnResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs the dist CLI interactively, writing `stdinLines` to stdin after waiting
 * for each corresponding `waitForText` on stderr. Synchronization is via
 * stderr-watching, not timing — avoids flakiness from Inquirer's async rendering.
 *
 * stdinLines: array of strings to write to stdin, in order.
 * waitForTexts: array of substrings to wait for on stderr before writing each
 *   corresponding stdinLine.  Must be the same length as stdinLines.
 *
 * Each waitForTexts[i] is waited for AFTER the previous write, so duplicate
 * prompts (e.g., same question asked 3 times) are handled correctly:
 * the helper tracks a per-write "search offset" into stderrBuf, so it waits
 * for a NEW occurrence of the text past the point already consumed.
 *
 * Resolves when the child process exits.
 */
export function spawnCliInteractive(
  args: string[],
  stdinLines: string[],
  waitForTexts: string[],
  opts?: SpawnOpts,
): Promise<InteractiveSpawnResult> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn('node', [DIST_CLI, ...args], {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let writeIndex = 0;
    let searchOffset = 0;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      tryWrite();
    });

    function tryWrite(): void {
      while (writeIndex < waitForTexts.length) {
        const waitFor = waitForTexts[writeIndex];
        const idx = stderrBuf.indexOf(waitFor, searchOffset);
        if (idx === -1) break;
        const line = stdinLines[writeIndex];
        child.stdin?.write(line + '\n');
        searchOffset = idx + waitFor.length;
        writeIndex++;
      }
    }

    child.on('close', (code) => {
      child.stdin?.end();
      resolve({
        status: code ?? 1,
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });

    child.on('error', (err) => {
      resolve({
        status: 1,
        stdout: stdoutBuf,
        stderr: stderrBuf + '\n' + err.message,
      });
    });
  });
}
