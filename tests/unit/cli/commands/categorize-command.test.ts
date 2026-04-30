import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { PassThrough } from 'stream';
import { runCategorizeCommand } from '../../../../src/cli/commands/categorize-command.js';
import type { CategorizeCommandOptions, CategorizeCommandDeps } from '../../../../src/cli/commands/categorize-command.js';
import type { InteractivePrompter } from '../../../../src/cli/utils/interactive.js';
import { Result } from '@core/shared/result.js';
import type { AppConfig, AccountConfig } from '@core/config/app-config.js';
import type { ConfigWriter } from '@core/ports/config-writer.js';
import { Money } from '@core/shared/money.js';

// fails if: --non-interactive bail exits 0 when groups exist (guards CI mode invariant),
//   --json shape regresses (guards machine contract), abort path doesn't flush partial buffer,
//   writer not called when buffer is empty, exit codes wrong

const EUR = Money.zero('EUR').value;

function makeAccount(id: string, prefix: string): AccountConfig {
  return { id, type: 'bank', filenamePrefix: prefix };
}

const baseConfig: AppConfig = {
  dbPath: './test.db',
  defaultCurrency: 'EUR',
  timezone: 'Europe/Paris',
  splits: [{ validFrom: '2024-01-01', rules: [{ partner: 'Alex', ratio: 0.5 }, { partner: 'Sam', ratio: 0.5 }] }],
  buffers: [],
  accounts: [makeAccount('main-X', 'X_')],
  recurring: [],
  autoTagRules: [],
};

function makeCapture(): Writable & { captured: string } {
  const buf: string[] = [];
  const stream = new PassThrough() as unknown as Writable & { captured: string };
  stream.on('data', (chunk: Buffer | string) => buf.push(chunk.toString()));
  Object.defineProperty(stream, 'captured', { get: () => buf.join('') });
  return stream;
}

const CSV_HEADER = 'Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation';

function makeCsvContent(rows: Array<{ description: string; count: number }>): string {
  const dataRows: string[] = [];
  let idx = 1;
  for (const { description, count } of rows) {
    for (let i = 0; i < count; i++) {
      const safe = description.replace(/;/g, ',');
      dataRows.push(`15/03/2026;${safe};${safe};REF${idx.toString().padStart(3, '0')};;Carte;Loisirs;Abonnements;-42,00;;15/03/2026;15/03/2026;0`);
      idx++;
    }
  }
  return [CSV_HEADER, ...dataRows].join('\n') + '\n';
}

function makeNoOpConfigWriter(): ConfigWriter {
  return {
    appendAutoTagRules: vi.fn().mockResolvedValue(Result.ok()),
  };
}

function makeBaseDeps(overrides: Partial<CategorizeCommandDeps> = {}): {
  deps: CategorizeCommandDeps;
  stdout: Writable & { captured: string };
  stderr: Writable & { captured: string };
  exitCodes: number[];
} {
  const stdout = makeCapture();
  const stderr = makeCapture();
  const exitCodes: number[] = [];

  const csvContent = makeCsvContent([
    { description: 'MERCHANT A', count: 3 },
    { description: 'MERCHANT B', count: 2 },
  ]);

  const deps: CategorizeCommandDeps = {
    config: baseConfig,
    csvParser: {
      parse: () => Result.ok({
        items: [
          ...Array(3).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'MERCHANT A', direction: 'outflow' as const, amount: EUR })),
          ...Array(2).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'MERCHANT B', direction: 'outflow' as const, amount: EUR })),
        ],
        errors: [],
      }),
    },
    pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
    readFile: () => Result.ok(csvContent),
    prompt: {
      selectCategory: vi.fn().mockResolvedValue({ action: 'keep' }),
      confirmBatch: vi.fn().mockResolvedValue(true),
      confirmRememberRule: vi.fn().mockResolvedValue({ action: 'skip' as const }),
    },
    stdout: stdout as Writable,
    stderr: stderr as Writable,
    exitCode: (code) => exitCodes.push(code),
    configWriter: makeNoOpConfigWriter(),
    ...overrides,
  };

  return { deps, stdout, stderr, exitCodes };
}

const baseOpts: CategorizeCommandOptions = {
  file: '/tmp/X_2026.csv',
  nonInteractive: false,
  json: false,
  minCount: 2,
};

// ---- --non-interactive bail ----

describe('runCategorizeCommand — --non-interactive bail', () => {
  it('exits 2 when groups exist and --non-interactive is set', async () => {
    // fails if: --non-interactive silently writes or exits 0 when groups need review
    const { deps, stderr, exitCodes } = makeBaseDeps();

    await runCategorizeCommand({ ...baseOpts, nonInteractive: true }, deps);

    expect(exitCodes).toContain(2);
    expect(stderr.captured).toContain('group(s) need review');
    expect(deps.configWriter.appendAutoTagRules).not.toHaveBeenCalled();
  });

  it('exits 0 and does not bail when no groups exist (all already matched)', async () => {
    // fails if: --non-interactive bails when there are no candidate groups
    const configWithRules: AppConfig = {
      ...baseConfig,
      autoTagRules: [
        { pattern: /merchant a/i, category: 'Cat1' },
        { pattern: /merchant b/i, category: 'Cat2' },
      ],
    };
    const { deps, exitCodes } = makeBaseDeps({ config: configWithRules });

    await runCategorizeCommand({ ...baseOpts, nonInteractive: true }, deps);

    expect(exitCodes).toContain(0);
  });
});

// ---- --json shape ----

describe('runCategorizeCommand — --json summary shape (R8 mock diversity)', () => {
  it('outputs valid JSON with candidateGroups, rulesAdded, rulesSkippedByUser, rules array', async () => {
    // fails if: --json shape regresses (guards machine contract; R8 diversified with
    //   rulesSkippedByUser > 0 and multi-rule rules array)
    const stdout = makeCapture();
    const stderr = makeCapture();
    const exitCodes: number[] = [];

    const csvContent = makeCsvContent([
      { description: 'MERCHANT ALPHA', count: 3 },
      { description: 'MERCHANT BETA', count: 2 },
      { description: 'MERCHANT GAMMA', count: 2 },
    ]);

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn()
        .mockResolvedValueOnce({ action: 'change', category: 'Groceries' })
        .mockResolvedValueOnce({ action: 'change', category: 'Shopping' })
        .mockResolvedValueOnce({ action: 'keep' }),
      confirmBatch: vi.fn(),
      confirmRememberRule: vi.fn()
        .mockResolvedValueOnce({ action: 'remember', pattern: 'alpha' })
        .mockResolvedValueOnce({ action: 'remember', pattern: 'beta' }),
    };

    const deps: CategorizeCommandDeps = {
      config: baseConfig,
      csvParser: {
        parse: () => Result.ok({
          items: [
            ...Array(3).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'MERCHANT ALPHA', direction: 'outflow' as const, amount: EUR })),
            ...Array(2).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'MERCHANT BETA', direction: 'outflow' as const, amount: EUR })),
            ...Array(2).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'MERCHANT GAMMA', direction: 'outflow' as const, amount: EUR })),
          ],
          errors: [],
        }),
      },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok(csvContent),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      configWriter: makeNoOpConfigWriter(),
    };

    await runCategorizeCommand({ ...baseOpts, json: true }, deps);

    expect(exitCodes).toContain(0);
    const json = JSON.parse(stdout.captured.trim()) as Record<string, unknown>;
    const summary = json['summary'] as Record<string, unknown>;

    expect(summary['candidateGroups']).toBe(3);
    expect(summary['rulesAdded']).toBe(2);
    expect(summary['rulesSkippedByUser']).toBe(1);
    expect(summary['rulesSkippedAsDuplicate']).toBe(0);

    const rules = json['rules'] as Array<Record<string, string>>;
    expect(rules).toHaveLength(2);
    expect(rules[0]).toHaveProperty('category');
    expect(rules[0]).toHaveProperty('pattern');
    expect(json['file']).toBe('/tmp/X_2026.csv');
  });
});

// ---- abort path ----

describe('runCategorizeCommand — abort path', () => {
  it('flushes partial buffer on abort and exits 0', async () => {
    // fails if: abort discards confirmed rules (user input lost), or exits non-zero
    const stdout = makeCapture();
    const stderr = makeCapture();
    const exitCodes: number[] = [];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn()
        .mockResolvedValueOnce({ action: 'change', category: 'Groceries' })
        .mockResolvedValueOnce({ action: 'abort' }),
      confirmBatch: vi.fn(),
      confirmRememberRule: vi.fn()
        .mockResolvedValueOnce({ action: 'remember', pattern: 'merchant' }),
    };

    const configWriter = makeNoOpConfigWriter();

    const { deps } = makeBaseDeps({ prompt: prompter, configWriter, stdout: stdout as Writable, stderr: stderr as Writable, exitCode: (code) => exitCodes.push(code) });

    await runCategorizeCommand(baseOpts, deps);

    expect(exitCodes).toContain(0);
    expect(stderr.captured).toContain('Aborted');
    expect(configWriter.appendAutoTagRules).toHaveBeenCalledOnce();
    const calledWith = (configWriter.appendAutoTagRules as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ category: string; pattern: string }>;
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0]).toEqual({ category: 'Groceries', pattern: 'merchant' });
  });
});

// ---- configWriter not called when buffer empty ----

describe('runCategorizeCommand — writer skip when empty', () => {
  it('does not call configWriter when all groups are skipped by user', async () => {
    // fails if: configWriter is called on empty buffer (wasteful write)
    const configWriter = makeNoOpConfigWriter();
    const { deps, exitCodes } = makeBaseDeps({
      configWriter,
      prompt: {
        selectCategory: vi.fn().mockResolvedValue({ action: 'keep' }),
        confirmBatch: vi.fn(),
        confirmRememberRule: vi.fn(),
      },
    });

    await runCategorizeCommand(baseOpts, deps);

    expect(configWriter.appendAutoTagRules).not.toHaveBeenCalled();
    expect(exitCodes).toContain(0);
  });
});

// ---- pickSourceAccount failure ----

describe('runCategorizeCommand — pickSourceAccount failure', () => {
  it('exits 2 when pickSourceAccount fails', async () => {
    // fails if: exit code is not 2 when no account matches the filename
    const { deps, exitCodes, stderr } = makeBaseDeps({
      pickSourceAccount: () => Result.fail('no account configured for this filename'),
    });

    await runCategorizeCommand(baseOpts, deps);

    expect(exitCodes).toContain(2);
    expect(stderr.captured).toContain('no account configured for this filename');
  });
});

// ---- --limit truncation ----

describe('runCategorizeCommand — --limit truncation', () => {
  it('prompts for exactly --limit groups and reports candidateGroups as the full set', async () => {
    // fails if: --limit does not truncate the prompt loop (all 5 groups would be prompted
    // without --limit, but only 2 should be prompted with --limit 2).
    const stdout = makeCapture();
    const stderr = makeCapture();
    const exitCodes: number[] = [];

    const fiveGroupItems = [
      ...Array(3).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'GROUP ONE', direction: 'outflow' as const, amount: EUR })),
      ...Array(3).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'GROUP TWO', direction: 'outflow' as const, amount: EUR })),
      ...Array(2).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'GROUP THREE', direction: 'outflow' as const, amount: EUR })),
      ...Array(2).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'GROUP FOUR', direction: 'outflow' as const, amount: EUR })),
      ...Array(2).fill(null).map(() => ({ sourceAccount: 'main-X', occurredAt: '2026-03-15T00:00:00+01:00', description: 'GROUP FIVE', direction: 'outflow' as const, amount: EUR })),
    ];

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn()
        .mockResolvedValueOnce({ action: 'change', category: 'CatA' })
        .mockResolvedValueOnce({ action: 'change', category: 'CatB' }),
      confirmBatch: vi.fn(),
      confirmRememberRule: vi.fn()
        .mockResolvedValueOnce({ action: 'remember', pattern: 'group one' })
        .mockResolvedValueOnce({ action: 'remember', pattern: 'group two' }),
    };

    const configWriter = makeNoOpConfigWriter();

    const deps: CategorizeCommandDeps = {
      config: baseConfig,
      csvParser: {
        parse: () => Result.ok({ items: fiveGroupItems, errors: [] }),
      },
      pickSourceAccount: () => Result.ok(makeAccount('main-X', 'X_')),
      readFile: () => Result.ok(''),
      prompt: prompter,
      stdout: stdout as Writable,
      stderr: stderr as Writable,
      exitCode: (code) => exitCodes.push(code),
      configWriter,
    };

    await runCategorizeCommand({ ...baseOpts, limit: 2, json: true }, deps);

    expect(exitCodes).toContain(0);

    // selectCategory called exactly twice — only 2 groups prompted (not 5)
    expect(prompter.selectCategory).toHaveBeenCalledTimes(2);

    const json = JSON.parse(stdout.captured.trim()) as Record<string, unknown>;
    const summary = json['summary'] as Record<string, unknown>;

    // candidateGroups reflects the full scan result (5), not the limited set
    expect(summary['candidateGroups']).toBe(5);
    expect(summary['rulesAdded']).toBe(2);

    // writer called once with 2 rules
    expect(configWriter.appendAutoTagRules).toHaveBeenCalledOnce();
    const calledWith = (configWriter.appendAutoTagRules as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ category: string; pattern: string }>;
    expect(calledWith).toHaveLength(2);
  });
});

// ---- configWriter failure (exit 5) ----

describe('runCategorizeCommand — configWriter failure', () => {
  it('exits 5 when YAML write fails', async () => {
    // fails if: exit code is not 5 when configWriter returns mtime-race error
    const configWriter: ConfigWriter = {
      appendAutoTagRules: vi.fn().mockResolvedValue(Result.fail({ kind: 'mtime-race' as const })),
    };

    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'Groceries' }),
      confirmBatch: vi.fn(),
      confirmRememberRule: vi.fn().mockResolvedValue({ action: 'remember', pattern: 'merchant' }),
    };

    const { deps, exitCodes, stderr } = makeBaseDeps({ configWriter, prompt: prompter });

    await runCategorizeCommand(baseOpts, deps);

    expect(exitCodes).toContain(5);
    expect(stderr.captured).toMatch(/yaml|changed externally|categorize/i);
  });
});
