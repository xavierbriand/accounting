import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ConfigError, ConfigNotFoundError, loadConfig, SLUICE_TOML } from './load.ts';
import { configToml } from './__fixtures__/build.ts';
import { loadLedger } from '../ingest/load.ts';
import { csvFixture, ofxFixture, type FixtureRow } from '../ingest/__fixtures__/build.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sluice-config-'));
  created.push(dir);
  return dir;
}

async function withConfig(text: string): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, SLUICE_TOML), text, 'utf8');
  return dir;
}

describe('loadConfig', () => {
  it('reads the plan from a file called sluice.toml', async () => {
    // The name the ingest's own error message tells the user to edit. Pinned
    // here so the two modules cannot drift apart on it.
    expect(SLUICE_TOML).toBe('sluice.toml');
    const dir = await withConfig(configToml());
    const config = await loadConfig(dir);
    expect(config.people).toHaveLength(1);
  });

  it('resolves a relative exports directory against the config file, not the cwd', async () => {
    // The config lives beside the exports it points at. Resolving against the
    // process's working directory would make the same file read a different
    // folder depending on where the app was started — a wrong answer that looks
    // like a right one.
    const dir = await withConfig(configToml({ exports: '[exports]\ndirectory = "./exports"\n' }));
    const config = await loadConfig(dir);
    expect(config.exportsDirectory).toBe(resolve(dir, 'exports'));
    expect(config.exportsDirectory).not.toBe(resolve(process.cwd(), 'exports'));
  });

  it('leaves an absolute exports directory alone', async () => {
    const dir = await withConfig(
      configToml({ exports: `[exports]\ndirectory = "${tmpdir()}/elsewhere"\n` }),
    );
    expect((await loadConfig(dir)).exportsDirectory).toBe(join(tmpdir(), 'elsewhere'));
  });

  it('expands a leading ~/ to the home directory', async () => {
    const dir = await withConfig(
      configToml({ exports: '[exports]\ndirectory = "~/sluice-private/exports"\n' }),
    );
    expect((await loadConfig(dir)).exportsDirectory).toBe(
      join(homedir(), 'sluice-private/exports'),
    );
  });

  it('reads a file that starts with a byte-order mark', async () => {
    // Invisible in an editor, and it would otherwise become part of the first
    // key's name — so the file would be refused for a reason nobody could see.
    const dir = await withConfig('﻿' + configToml());
    await expect(loadConfig(dir)).resolves.toBeDefined();
  });

  it('says where it looked when there is no config', async () => {
    const dir = await tempDir();
    await expect(loadConfig(dir)).rejects.toThrow(ConfigNotFoundError);
    await expect(loadConfig(dir)).rejects.toThrow(new RegExp(dir));
  });

  it('reports a bad plan as a config problem, not a missing file', async () => {
    const dir = await withConfig(configToml({ funding: '[funding]\ncutoff_day = 30\n' }));
    await expect(loadConfig(dir)).rejects.toThrow(ConfigError);
    await expect(loadConfig(dir)).rejects.toThrow(/between 1 and 28/);
  });
});

describe('config and ingest together', () => {
  const ROWS: FixtureRow[] = [
    { postedOn: '05/01/2025', amount: '-40,00' },
    { postedOn: '06/01/2025', amount: '-60,00' },
  ];

  it('points the ingest at the folder the plan names', async () => {
    // The only check that the two halves meet. Everything either side of this
    // line is tested in isolation, and a mismatch here would surface as an empty
    // page rather than an error.
    const root = await tempDir();
    const exports = join(root, 'exports');
    await mkdir(exports);

    const stem = '00000000001_01012025_31012025';
    await writeFile(join(exports, `${stem}.ofx`), ofxFixture(ROWS, { balance: '+500.00' }));
    await writeFile(join(exports, `${stem}.csv`), csvFixture(ROWS));
    await writeFile(
      join(root, SLUICE_TOML),
      configToml({ exports: '[exports]\ndirectory = "./exports"\n' }),
      'utf8',
    );

    const config = await loadConfig(root);
    const ledger = await loadLedger(config.exportsDirectory);

    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.reconciliation.accountBalance).toBe(50000);
  });
});
