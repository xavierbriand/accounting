import type { Writable } from 'stream';
import type { ConfigService } from '@core/ports/config-service.js';
import type { CsvParser } from '@core/ports/csv-parser.js';
import type { IdempotencyService } from '@core/ingest/idempotency-service.js';
import type { TransactionBuilder } from '@core/ingest/transaction-builder.js';
import type { BuildOutcome } from '@core/ingest/types.js';
import type { AccountConfig } from '@core/config/app-config.js';
import type { InteractivePrompter } from '../utils/interactive.js';
import type { pickSourceAccount as PickSourceAccountFn } from '../../infra/fs/pick-source-account.js';
import type { readBpceCsv as ReadBpceCsvFn } from '../../infra/fs/read-bpce-csv.js';
import { formatSummaryTable } from '../utils/printer.js';

export interface IngestCommandOptions {
  readonly file: string;
  readonly nonInteractive: boolean;
  readonly json: boolean;
}

export interface IngestCommandDeps {
  readonly configService: Pick<ConfigService, 'load'>;
  readonly csvParser: Pick<CsvParser, 'parse'>;
  readonly idempotencyService: Pick<IdempotencyService, 'filterNew'>;
  readonly transactionBuilder: Pick<TransactionBuilder, 'buildAll'>;
  readonly pickSourceAccount: typeof PickSourceAccountFn;
  readonly readFile: typeof ReadBpceCsvFn;
  readonly prompt: InteractivePrompter;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
}

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

export async function runIngestCommand(
  opts: IngestCommandOptions,
  deps: IngestCommandDeps,
): Promise<void> {
  const { configService, csvParser, idempotencyService, transactionBuilder, pickSourceAccount, readFile, prompt, stdout, stderr, exitCode } = deps;

  const configResult = configService.load();
  if (configResult.isFailure) {
    writeln(stderr, `Configuration error: ${configResult.error}`);
    exitCode(1);
    return;
  }
  const config = configResult.value;

  const accountResult = pickSourceAccount(opts.file, config.accounts);
  if (accountResult.isFailure) {
    writeln(stderr, accountResult.error);
    exitCode(2);
    return;
  }
  const account: AccountConfig = accountResult.value;

  const readResult = readFile(opts.file);
  if (readResult.isFailure) {
    writeln(stderr, readResult.error);
    exitCode(1);
    return;
  }

  const parseResult = csvParser.parse(readResult.value, {
    format: 'bpce',
    currency: config.defaultCurrency,
    timezone: config.timezone,
    sourceAccount: account.id,
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

  const idempotencyResult = idempotencyService.filterNew(parseOutcome.items);
  if (idempotencyResult.isFailure) {
    writeln(stderr, `Idempotency check failed: ${idempotencyResult.error}`);
    exitCode(1);
    return;
  }
  const { fresh, duplicates } = idempotencyResult.value;

  const buildResult = transactionBuilder.buildAll(fresh);
  if (buildResult.isFailure) {
    writeln(stderr, `Build error: ${buildResult.error}`);
    exitCode(1);
    return;
  }
  const { built, failed } = buildResult.value;

  if (failed.length > 0) {
    for (const f of failed) {
      writeln(stderr, `  Build failed for "${f.item.description}": ${f.reason}`);
    }
  }

  const lowConfidence = built.filter((o) => o.confidence === 'low');
  const highConfidence = built.filter((o) => o.confidence === 'high');

  writeln(stderr, `Found ${built.length} new transactions — ${highConfidence.length} auto-tagged, ${lowConfidence.length} need review.`);
  if (duplicates.length > 0) {
    writeln(stderr, `  (${duplicates.length} duplicate(s) skipped)`);
  }

  if (opts.nonInteractive || opts.json) {
    return runNonInteractive(opts, account, built, lowConfidence, duplicates.length, parseOutcome.errors.length, stdout, stderr, exitCode);
  }

  const resolvedOutcomes = await runInteractiveLoop(built, lowConfidence, prompt, stderr, exitCode);
  if (resolvedOutcomes === null) return;

  writeln(stdout, formatSummaryTable(resolvedOutcomes));

  const confirmed = await prompt.confirmBatch(resolvedOutcomes.length);
  if (!confirmed) {
    writeln(stderr, 'Ingest cancelled.');
    exitCode(1);
    return;
  }

  writeln(stderr, `${resolvedOutcomes.length} transaction(s) confirmed. (DB writes pending — Story 2.5)`);
  exitCode(0);
}

async function runInteractiveLoop(
  built: readonly BuildOutcome[],
  lowConfidence: readonly BuildOutcome[],
  prompt: InteractivePrompter,
  stderr: Writable,
  exitCode: (code: number) => void,
): Promise<BuildOutcome[] | null> {
  const resolved: BuildOutcome[] = [...built];

  const categories = Array.from(new Set(built.map((o) => o.category)));
  if (!categories.includes('Uncategorized')) categories.push('Uncategorized');

  for (const outcome of lowConfidence) {
    const answer = await prompt.selectCategory(
      outcome.transaction.description,
      outcome.category,
      categories,
    );

    if (answer.action === 'abort') {
      writeln(stderr, 'Ingest cancelled.');
      exitCode(1);
      return null;
    }

    if (answer.action === 'change') {
      const idx = resolved.findIndex((o) => o === outcome);
      if (idx !== -1) {
        resolved[idx] = { ...outcome, category: answer.category, confidence: 'high' };
      }
    }
  }

  return resolved;
}

function runNonInteractive(
  opts: IngestCommandOptions,
  account: AccountConfig,
  built: readonly BuildOutcome[],
  lowConfidence: readonly BuildOutcome[],
  duplicatesCount: number,
  parseErrorsCount: number,
  stdout: Writable,
  stderr: Writable,
  exitCode: (code: number) => void,
): void {
  if (lowConfidence.length > 0) {
    writeln(
      stderr,
      `${lowConfidence.length} item(s) need manual review. Run without --non-interactive to review them, ` +
        `or re-ingest after updating accounting.yaml's auto-tag-rules.`,
    );

    if (opts.json) {
      const needsReview = lowConfidence.map((o) => o.transaction.id);
      stdout.write(
        JSON.stringify({
          file: opts.file,
          source_account: account.id,
          summary: { total: built.length, autoTagged: built.length - lowConfidence.length, needsReview: lowConfidence.length, duplicates: duplicatesCount, parseErrors: parseErrorsCount },
          items: [],
          needsReview,
        }) + '\n',
      );
    }

    exitCode(2);
    return;
  }

  if (opts.json) {
    const items = built.map((o) => {
      const debitEntry = o.transaction.entries.find((e) => e.side === 'debit');
      const creditEntry = o.transaction.entries.find((e) => e.side === 'credit');
      return {
        id: o.transaction.id,
        occurredAt: o.transaction.occurredAt,
        description: o.transaction.description,
        amount_cents: debitEntry?.amount.amount ?? 0,
        currency: debitEntry?.amount.currency ?? '',
        debit: debitEntry?.account ?? '',
        credit: creditEntry?.account ?? '',
        category: o.category,
        classification: o.classification,
      };
    });

    stdout.write(
      JSON.stringify({
        file: opts.file,
        source_account: account.id,
        summary: { total: built.length, autoTagged: built.length, needsReview: 0, duplicates: duplicatesCount, parseErrors: parseErrorsCount },
        items,
      }) + '\n',
    );
    exitCode(0);
    return;
  }

  stdout.write(formatSummaryTable(built) + '\n');
  exitCode(0);
}
