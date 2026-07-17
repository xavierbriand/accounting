import { describe, it, expect, vi } from 'vitest';
import type { Writable } from 'stream';
import { makeCapturingStream as makeCapture } from '../../../_helpers/streams.js';
import { unwrapSuccess, unwrapError } from '../../../_helpers/json-envelope.js';
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
      confirmDissolution: vi.fn(),
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

  it('exits 2 with a NEEDS_REVIEW envelope on the final stderr line when groups exist, --non-interactive, --json (story-4.4b newly-reachable path)', async () => {
    // fails if: categorize-command.ts:123-129's writeJsonErrorIf(..., 'NEEDS_REVIEW', ...)
    //   (line 126) is missing or never reached under --json — this path was prose-only
    //   before story-4.4b
    const { deps, stdout, stderr, exitCodes } = makeBaseDeps();

    await runCategorizeCommand({ ...baseOpts, nonInteractive: true, json: true }, deps);

    expect(exitCodes).toContain(2);
    expect(stdout.captured).toBe('');
    const error = unwrapError(stderr.captured);
    expect(error.code).toBe('NEEDS_REVIEW');
    expect(deps.configWriter.appendAutoTagRules).not.toHaveBeenCalled();
  });
});

// ---- --json zero-groups success envelope (story-4.4b finding 4) ----

describe('runCategorizeCommand — --json zero-groups success envelope (story-4.4b finding 4)', () => {
  it('writes a success envelope to stdout when zero candidate groups exist under --json (was: nothing)', async () => {
    // fails if categorize-command.ts's zero-groups guard returns before writing stdout
    const configWithRules: AppConfig = {
      ...baseConfig,
      autoTagRules: [
        { pattern: /merchant a/i, category: 'Cat1' },
        { pattern: /merchant b/i, category: 'Cat2' },
      ],
    };
    const { deps, stdout, exitCodes } = makeBaseDeps({ config: configWithRules });

    await runCategorizeCommand({ ...baseOpts, json: true }, deps);

    expect(exitCodes).toContain(0);
    const data = unwrapSuccess<{ summary: { candidateGroups: number } }>(stdout.captured);
    expect(data.summary.candidateGroups).toBe(0);
  });

  it('does not write to stdout under non-json mode (existing "0 rules added" stderr prose only)', async () => {
    // fails if: categorize-command.ts:131-149's `if (opts.json)` guard (line 133) fires
    //   (or the stdout.write call moves outside it) when --json is not set, regressing
    //   the pre-4.4b prose-only zero-groups behaviour
    const configWithRules: AppConfig = {
      ...baseConfig,
      autoTagRules: [
        { pattern: /merchant a/i, category: 'Cat1' },
        { pattern: /merchant b/i, category: 'Cat2' },
      ],
    };
    const { deps, stdout, stderr, exitCodes } = makeBaseDeps({ config: configWithRules });

    await runCategorizeCommand({ ...baseOpts, json: false }, deps);

    expect(exitCodes).toContain(0);
    expect(stdout.captured).toBe('');
    expect(stderr.captured).toContain('0 rules added');
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
      confirmDissolution: vi.fn(),
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
    const data = unwrapSuccess<Record<string, unknown>>(stdout.captured);
    const summary = data['summary'] as Record<string, unknown>;

    expect(summary['candidateGroups']).toBe(3);
    expect(summary['rulesAdded']).toBe(2);
    expect(summary['rulesSkippedByUser']).toBe(1);
    // story-4.4b finding 9: the hardcoded-always-0 rulesSkippedAsDuplicate field is dropped.
    expect('rulesSkippedAsDuplicate' in summary).toBe(false);

    const rules = data['rules'] as Array<Record<string, string>>;
    expect(rules).toHaveLength(2);
    expect(rules[0]).toHaveProperty('category');
    expect(rules[0]).toHaveProperty('pattern');
    expect(data['file']).toBe('/tmp/X_2026.csv');
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
      confirmDissolution: vi.fn(),
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
        confirmDissolution: vi.fn(),
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

// story-4.4b: categorize shares ingest's read/parse/source-account resolution logic —
// same failure discipline (a coded envelope on the final stderr line under --json).
describe('runCategorizeCommand — --json-reachable failure envelopes (story-4.4b)', () => {
  it('pickSourceAccount failure + --json: final stderr line is an INVALID_ARGUMENT envelope', async () => {
    // fails if: categorize-command.ts:80-86's writeJsonErrorIf(..., 'INVALID_ARGUMENT', ...)
    //   (line 83) is missing or drops the source message
    const { deps, exitCodes, stderr } = makeBaseDeps({
      pickSourceAccount: () => Result.fail('no account configured for this filename'),
    });

    await runCategorizeCommand({ ...baseOpts, json: true }, deps);

    expect(exitCodes).toContain(2);
    const error = unwrapError(stderr.captured);
    expect(error.code).toBe('INVALID_ARGUMENT');
    expect(error.message).toContain('no account configured for this filename');
  });

  it('readFile failure + --json: final stderr line is a READ_FAILURE envelope', async () => {
    // fails if: categorize-command.ts:88-94's writeJsonErrorIf(..., 'READ_FAILURE', ...)
    //   (line 91) is missing
    const { deps, exitCodes, stderr } = makeBaseDeps({
      readFile: () => Result.fail('ENOENT: no such file or directory'),
    });

    await runCategorizeCommand({ ...baseOpts, json: true }, deps);

    expect(exitCodes).toContain(1);
    const error = unwrapError(stderr.captured);
    expect(error.code).toBe('READ_FAILURE');
  });

  it('CSV parse failure + --json: final stderr line is a READ_FAILURE envelope', async () => {
    // fails if: categorize-command.ts:96-108's writeJsonErrorIf(..., 'READ_FAILURE', ...)
    //   (line 105) is missing or the "Parse error: " prefix leaks into error.code instead
    //   of error.message
    const { deps, exitCodes, stderr } = makeBaseDeps({
      csvParser: { parse: () => Result.fail('malformed header row') },
    });

    await runCategorizeCommand({ ...baseOpts, json: true }, deps);

    expect(exitCodes).toContain(1);
    const error = unwrapError(stderr.captured);
    expect(error.code).toBe('READ_FAILURE');
    expect(error.message).toContain('malformed header row');
  });

  it('configWriter failure + --json: final stderr line is a CONFIG_WRITE_FAILURE envelope', async () => {
    // fails if: categorize-command.ts:203-220's writeJsonErrorIf(..., 'CONFIG_WRITE_FAILURE', ...)
    //   (line 216) is missing — this is the interactive-loop configWriter failure, reachable
    //   under --json here (unlike ingest, where --json forces the non-interactive branch)
    const configWriter: ConfigWriter = {
      appendAutoTagRules: vi.fn().mockResolvedValue(Result.fail({ kind: 'mtime-race' as const })),
    };
    const prompter: InteractivePrompter = {
      selectCategory: vi.fn().mockResolvedValue({ action: 'change', category: 'Groceries' }),
      confirmBatch: vi.fn(),
      confirmRememberRule: vi.fn().mockResolvedValue({ action: 'remember', pattern: 'merchant' }),
      confirmDissolution: vi.fn(),
    };
    const { deps, exitCodes, stderr } = makeBaseDeps({ configWriter, prompt: prompter });

    await runCategorizeCommand({ ...baseOpts, json: true }, deps);

    expect(exitCodes).toContain(5);
    const error = unwrapError(stderr.captured);
    expect(error.code).toBe('CONFIG_WRITE_FAILURE');
  });

  it('non-json mode stays prose-only (no envelope line)', async () => {
    // fails if: writeJsonErrorIf's `json` gate is dropped from any of the four call sites
    //   above (categorize-command.ts:83,91,105,216), leaking an envelope line onto stderr
    //   when --json was never requested
    const { deps, exitCodes, stderr } = makeBaseDeps({
      pickSourceAccount: () => Result.fail('no account configured for this filename'),
    });

    await runCategorizeCommand({ ...baseOpts, json: false }, deps);

    expect(exitCodes).toContain(2);
    expect(() => JSON.parse(stderr.captured.trim())).toThrow();
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
      confirmDissolution: vi.fn(),
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

    const data = unwrapSuccess<Record<string, unknown>>(stdout.captured);
    const summary = data['summary'] as Record<string, unknown>;

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
      confirmDissolution: vi.fn(),
    };

    const { deps, exitCodes, stderr } = makeBaseDeps({ configWriter, prompt: prompter });

    await runCategorizeCommand(baseOpts, deps);

    expect(exitCodes).toContain(5);
    expect(stderr.captured).toMatch(/yaml|changed externally|categorize/i);
  });
});
