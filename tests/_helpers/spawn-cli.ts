import { execFileSync, spawn, type ChildProcess } from 'child_process';
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
 * Never throws — caught errors are returned as the result object.
 */
export function spawnCli(args: string[], opts?: SpawnOpts): SpawnResult {
  try {
    const stdout = execFileSync('node', [DIST_CLI, ...args], {
      encoding: 'utf8',
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status: number | null; stdout: string | Buffer; stderr: string | Buffer };
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
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
        if (!stderrBuf.includes(waitFor)) break;
        const line = stdinLines[writeIndex];
        child.stdin?.write(line + '\n');
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
