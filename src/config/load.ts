import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { parseConfig, type Config } from './schema.ts';

export type {
  Config,
  EnvelopeConfig,
  EnvelopeMatcher,
  EnvelopePlan,
  IncomeSource,
  Person,
  SeasonalWeights,
} from './schema.ts';
export { ConfigError, envelopeIndex, peopleMatching } from './schema.ts';

/**
 * The name the ingest already tells the user to edit, in
 * `ExportsNotFoundError`. Exported so the two modules cannot drift apart on it.
 */
export const SLUICE_TOML = 'sluice.toml';

export class ConfigNotFoundError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigNotFoundError';
  }
}

/** A leading `~/` is the household's home directory. */
function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

/**
 * Read and validate the household's plan.
 *
 * `exports.directory` is resolved against **the config file's own folder**, not
 * the process's working directory. The config lives beside the exports it points
 * at, so a relative path means "next to me" — resolving against the cwd would
 * make the same file read a different folder depending on where the app happened
 * to be started from, which is a wrong answer that looks like a right one.
 */
export async function loadConfig(directory: string): Promise<Config> {
  const path = join(directory, SLUICE_TOML);

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    throw new ConfigNotFoundError(
      `No ${SLUICE_TOML} in "${directory}". sluice reads the household's plan from a ` +
        `file of that name: it needs at least an [exports] table whose directory points ` +
        `at the bank's exports, the people who live here and what they earn.`,
      { cause },
    );
  }

  // A BOM is invisible in an editor and would otherwise become part of the first
  // key's name, so the file would be refused for a reason nobody could see.
  const config = parseConfig(text.replace(/^﻿/, ''), path);

  const declared = expandHome(config.exportsDirectory);
  return {
    ...config,
    exportsDirectory: isAbsolute(declared) ? declared : resolve(directory, declared),
  };
}
