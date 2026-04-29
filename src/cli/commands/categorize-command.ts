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

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

export async function runCategorizeCommand(
  opts: CategorizeCommandOptions,
  deps: CategorizeCommandDeps,
): Promise<void> {
  const { config, csvParser, pickSourceAccount, readFile, prompt, stdout, stderr, exitCode, configWriter } = deps;

  // Step 1: pick source account (config lookup)
  const accountResult = pickSourceAccount(opts.file, config.accounts);
  if (accountResult.isFailure) {
    writeln(stderr, accountResult.error);
    exitCode(2);
    return;
  }

  // Step 2: read CSV
  const readResult = readFile(opts.file);
  if (readResult.isFailure) {
    writeln(stderr, readResult.error);
    exitCode(1);
    return;
  }

  // Step 3: parse CSV (parse errors reported per-row; valid siblings proceed)
  const parseResult = csvParser.parse(readResult.value, {
    format: 'bpce',
    currency: config.defaultCurrency,
    timezone: config.timezone,
    sourceAccount: accountResult.value.id,
  });
  if (parseResult.isFailure) {
    writeln(stderr, `Parse error: ${parseResult.error}`);
    exitCode(1);
    return;
  }
  const parseOutcome = parseResult.value;

  if (parseOutcome.errors.length > 0) {
    for (const e of parseOutcome.errors) {
      writeln(stderr, `  Row ${e.line}: ${e.reason}`);
    }
  }

  // Step 4: scan for unmatched descriptions
  const descriptions = parseOutcome.items.map((i) => i.description);
  const scannedRows = descriptions.length;
  const alreadyMatchedCount = descriptions.filter((d) => isAlreadyClassified(d, config.autoTagRules)).length;

  const groups = scanForUnmatched(descriptions, config.autoTagRules, { minCount: opts.minCount });

  // Step 5: non-interactive bail if groups exist
  if (opts.nonInteractive && groups.length > 0) {
    writeln(stderr, `${groups.length} group(s) need review; re-run without --non-interactive`);
    exitCode(2);
    return;
  }

  // Step 6: no groups → skip prompts
  if (groups.length === 0) {
    writeln(stderr, '0 rules added');
    exitCode(0);
    return;
  }

  // Step 7: walk groups and prompt
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

    // action === 'change'
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

  // Step 8: single YAML write (only if buffer non-empty)
  if (rememberedRules.length > 0) {
    const writeResult = await configWriter.appendAutoTagRules(rememberedRules);
    if (writeResult.isFailure) {
      const err = writeResult.error;
      if (err.kind === 'mtime-race') {
        writeln(stderr, 'Your accounting.yaml changed externally; please re-run categorize.');
      } else if (err.kind === 'conflict') {
        writeln(stderr, `Config conflict: pattern '${err.pattern}' already exists under category '${err.existingCategory}'.`);
      } else {
        writeln(stderr, `Config write failed: ${err.message}`);
      }
      exitCode(5);
      return;
    }
  }

  const rulesAdded = rememberedRules.length;

  // Step 9: print summary
  if (opts.json) {
    const jsonSummary = {
      file: opts.file,
      summary: {
        scannedRows,
        alreadyMatched: alreadyMatchedCount,
        candidateGroups: groups.length,
        promptedGroups,
        rulesAdded,
        rulesSkippedByUser,
        rulesSkippedAsDuplicate: 0,
      },
      rules: rememberedRules.map((r) => ({ category: r.category, pattern: r.pattern })),
    };
    stdout.write(JSON.stringify(jsonSummary) + '\n');
  } else {
    writeln(stderr, `${rulesAdded} rules added to accounting.yaml.`);
    if (rulesAdded > 0) {
      writeln(stderr, `Re-run \`accounting ingest --file ${opts.file}\` to apply.`);
    }
  }

  exitCode(0);
}
