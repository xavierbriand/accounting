import type { Writable } from 'stream';
import type { CsvParser } from '@core/ports/csv-parser.js';
import type { AppConfig } from '@core/config/app-config.js';
import type { ConfigWriter } from '@core/ports/config-writer.js';
import type { InteractivePrompter } from '../utils/interactive.js';
import type { pickSourceAccount as PickSourceAccountFn } from '../../infra/fs/pick-source-account.js';
import type { readBpceCsv as ReadBpceCsvFn } from '../../infra/fs/read-bpce-csv.js';
import { scanForUnmatched } from '@core/ingest/categorize-scanner.js';
import { isAlreadyClassified } from '@core/ingest/auto-classify.js';
import { suggestPattern } from '@core/ingest/pattern-suggester.js';
import { formatJsonSuccess, writeJsonErrorIf } from '../utils/json-envelope.js';

export interface CategorizeCommandOptions {
  readonly file: string;
  readonly nonInteractive: boolean;
  readonly json: boolean;
  readonly limit?: number;
  readonly minCount: number;
}

export interface CategorizeCommandDeps {
  readonly config: AppConfig;
  readonly csvParser: Pick<CsvParser, 'parse'>;
  readonly pickSourceAccount: typeof PickSourceAccountFn;
  readonly readFile: typeof ReadBpceCsvFn;
  readonly prompt: InteractivePrompter;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
  readonly configWriter: ConfigWriter;
}

interface SummaryParams {
  readonly file: string;
  readonly json: boolean;
  readonly scannedRows: number;
  readonly alreadyMatchedCount: number;
  readonly candidateGroups: number;
  readonly promptedGroups: number;
  readonly rulesAdded: number;
  readonly rulesSkippedByUser: number;
  readonly rememberedRules: ReadonlyArray<{ readonly category: string; readonly pattern: string }>;
  readonly stdout: Writable;
  readonly stderr: Writable;
}

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

function runCategorizeSummary(p: SummaryParams): void {
  if (p.json) {
    const data = {
      file: p.file,
      summary: {
        scannedRows: p.scannedRows,
        alreadyMatched: p.alreadyMatchedCount,
        candidateGroups: p.candidateGroups,
        promptedGroups: p.promptedGroups,
        rulesAdded: p.rulesAdded,
        rulesSkippedByUser: p.rulesSkippedByUser,
      },
      rules: p.rememberedRules.map((r) => ({ category: r.category, pattern: r.pattern })),
    };
    p.stdout.write(formatJsonSuccess('categorize', data));
  } else {
    writeln(p.stderr, `${p.rulesAdded} rules added to accounting.yaml.`);
    if (p.rulesAdded > 0) {
      writeln(p.stderr, `Re-run \`accounting ingest --file ${p.file}\` to apply.`);
    }
  }
}

export async function runCategorizeCommand(
  opts: CategorizeCommandOptions,
  deps: CategorizeCommandDeps,
): Promise<void> {
  const { config, csvParser, pickSourceAccount, readFile, prompt, stdout, stderr, exitCode, configWriter } = deps;

  const accountResult = pickSourceAccount(opts.file, config.accounts);
  if (accountResult.isFailure) {
    writeln(stderr, accountResult.error);
    writeJsonErrorIf(stderr, opts.json, 'categorize', { code: 'INVALID_ARGUMENT', message: accountResult.error });
    exitCode(2);
    return;
  }

  const readResult = readFile(opts.file);
  if (readResult.isFailure) {
    writeln(stderr, readResult.error);
    writeJsonErrorIf(stderr, opts.json, 'categorize', { code: 'READ_FAILURE', message: readResult.error });
    exitCode(1);
    return;
  }

  const parseResult = csvParser.parse(readResult.value, {
    format: 'bpce',
    currency: config.defaultCurrency,
    timezone: config.timezone,
    sourceAccount: accountResult.value.id,
  });
  if (parseResult.isFailure) {
    const message = `Parse error: ${parseResult.error}`;
    writeln(stderr, message);
    writeJsonErrorIf(stderr, opts.json, 'categorize', { code: 'READ_FAILURE', message });
    exitCode(1);
    return;
  }
  const parseOutcome = parseResult.value;

  if (parseOutcome.errors.length > 0) {
    for (const e of parseOutcome.errors) {
      writeln(stderr, `  Row ${e.line}: ${e.reason}`);
    }
  }

  const descriptions = parseOutcome.items.map((i) => i.description);
  const scannedRows = descriptions.length;
  const alreadyMatchedCount = descriptions.filter((d) => isAlreadyClassified(d, config.autoTagRules, config.accounts)).length;

  const groups = scanForUnmatched(descriptions, config.autoTagRules, config.accounts, { minCount: opts.minCount });

  if (opts.nonInteractive && groups.length > 0) {
    const message = `${groups.length} group(s) need review; re-run without --non-interactive`;
    writeln(stderr, message);
    writeJsonErrorIf(stderr, opts.json, 'categorize', { code: 'NEEDS_REVIEW', message });
    exitCode(2);
    return;
  }

  if (groups.length === 0) {
    writeln(stderr, '0 rules added');
    if (opts.json) {
      stdout.write(formatJsonSuccess('categorize', {
        file: opts.file,
        summary: {
          scannedRows,
          alreadyMatched: alreadyMatchedCount,
          candidateGroups: 0,
          promptedGroups: 0,
          rulesAdded: 0,
          rulesSkippedByUser: 0,
        },
        rules: [],
      }));
    }
    exitCode(0);
    return;
  }

  const limitedGroups = opts.limit !== undefined ? groups.slice(0, opts.limit) : groups;

  const rememberedMap = new Map<string, { category: string; pattern: string }>();
  const categoriesSoFar: string[] = ['Uncategorized'];
  let promptedGroups = 0;
  let rulesSkippedByUser = 0;
  let aborted = false;

  for (const group of limitedGroups) {
    promptedGroups++;
    const selectResult = await prompt.selectCategory(
      group.description,
      'Uncategorized',
      categoriesSoFar,
    );

    if (selectResult.action === 'abort') {
      aborted = true;
      break;
    }

    if (selectResult.action === 'keep') {
      rulesSkippedByUser++;
      continue;
    }

    const { category } = selectResult;
    if (!categoriesSoFar.includes(category)) {
      categoriesSoFar.push(category);
    }

    const suggestion = suggestPattern(group.description);
    const rememberResult = await prompt.confirmRememberRule(
      group.description,
      suggestion,
      category,
    );

    if (rememberResult.action === 'remember') {
      const key = `${category}|${rememberResult.pattern}`;
      rememberedMap.set(key, { category, pattern: rememberResult.pattern });
    } else {
      rulesSkippedByUser++;
    }
  }

  const rememberedRules = Array.from(rememberedMap.values());

  if (aborted) {
    writeln(stderr, `Aborted; ${rememberedRules.length} rules already confirmed were saved to accounting.yaml`);
  }

  if (rememberedRules.length > 0) {
    const writeResult = await configWriter.appendAutoTagRules(rememberedRules);
    if (writeResult.isFailure) {
      const err = writeResult.error;
      let message: string;
      if (err.kind === 'mtime-race') {
        message = 'Your accounting.yaml changed externally; please re-run categorize.';
      } else if (err.kind === 'conflict') {
        message = `Config conflict: pattern '${err.pattern}' already exists under category '${err.existingCategory}'.`;
      } else {
        message = `Config write failed: ${err.message}`;
      }
      writeln(stderr, message);
      writeJsonErrorIf(stderr, opts.json, 'categorize', { code: 'CONFIG_WRITE_FAILURE', message });
      exitCode(5);
      return;
    }
  }

  runCategorizeSummary({
    file: opts.file,
    json: opts.json,
    scannedRows,
    alreadyMatchedCount,
    candidateGroups: groups.length,
    promptedGroups,
    rulesAdded: rememberedRules.length,
    rulesSkippedByUser,
    rememberedRules,
    stdout,
    stderr,
  });

  exitCode(0);
}
