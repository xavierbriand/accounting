import { spawnSync } from 'child_process';
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

