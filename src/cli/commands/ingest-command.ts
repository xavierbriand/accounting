import type { Writable } from 'stream';
import type { CsvParser } from '@core/ports/csv-parser.js';
import type { IdempotencyService } from '@core/ingest/idempotency-service.js';
import type { TransactionBuilder } from '@core/ingest/transaction-builder.js';
import type { BuildOutcome, DuplicateIngestItem, ParseOutcome } from '@core/ingest/types.js';
import type { AccountConfig, AppConfig } from '@core/config/app-config.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { InteractivePrompter } from '../utils/interactive.js';
import type { pickSourceAccount as PickSourceAccountFn } from '../../infra/fs/pick-source-account.js';
import type { readBpceCsv as ReadBpceCsvFn } from '../../infra/fs/read-bpce-csv.js';
import { formatSummaryTable } from '../utils/printer.js';
import { sanitizeSqlError } from '../utils/sanitize-sql-error.js';

export interface IngestCommandOptions {
  readonly file: string;
  readonly nonInteractive: boolean;
  readonly json: boolean;
}

export type TransactionBuilderFactory =
  (accounts: readonly AccountConfig[]) => Pick<TransactionBuilder, 'buildAll'>;

export interface IngestCommandDeps {
  readonly config: AppConfig;
  readonly csvParser: Pick<CsvParser, 'parse'>;
  readonly idempotencyService: Pick<IdempotencyService, 'filterNew'>;
  readonly transactionBuilder: TransactionBuilderFactory;
  readonly pickSourceAccount: typeof PickSourceAccountFn;
  readonly readFile: typeof ReadBpceCsvFn;
  readonly prompt: InteractivePrompter;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly exitCode: (code: number) => void;
  readonly transactionRepository: Pick<TransactionRepository, 'saveBatch'>;
  readonly snapshotService: SnapshotService;
  readonly dbPath: string;
}

function writeln(stream: Writable, msg: string): void {
  stream.write(msg + '\n');
}

async function loadAndParse(
  opts: IngestCommandOptions,
  deps: Pick<IngestCommandDeps, 'config' | 'csvParser' | 'pickSourceAccount' | 'readFile' | 'stderr' | 'exitCode'>,
): Promise<{ account: AccountConfig; parseOutcome: ParseOutcome } | null> {
  const { config, csvParser, pickSourceAccount, readFile, stderr, exitCode } = deps;

  const accountResult = pickSourceAccount(opts.file, config.accounts);
  if (accountResult.isFailure) {
    writeln(stderr, accountResult.error);
    exitCode(2);
    return null;
  }
  const account: AccountConfig = accountResult.value;

  const readResult = readFile(opts.file);
  if (readResult.isFailure) {
    writeln(stderr, readResult.error);
    exitCode(1);
    return null;
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
    return null;
  }
  const parseOutcome = parseResult.value;

  if (parseOutcome.errors.length > 0) {
    for (const e of parseOutcome.errors) {
      writeln(stderr, `  Row ${e.line}: ${e.reason}`);
    }
  }

  return { account, parseOutcome };
}

export async function runIngestCommand(
  opts: IngestCommandOptions,
  deps: IngestCommandDeps,
): Promise<void> {
  const { config, idempotencyService, transactionBuilder, prompt, stdout, stderr, exitCode, transactionRepository, snapshotService, dbPath } = deps;

  const parsed = await loadAndParse(opts, deps);
  if (parsed === null) return;
  const { account, parseOutcome } = parsed;
  const idempotencyResult = idempotencyService.filterNew(parseOutcome.items);
  if (idempotencyResult.isFailure) {
    writeln(stderr, `Idempotency check failed: ${idempotencyResult.error}`);
    exitCode(1);
    return;
  }
  const { fresh, duplicates } = idempotencyResult.value;

  const builder = transactionBuilder(config.accounts);
  const buildResult = builder.buildAll(fresh);
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
  writeln(stderr, `Found ${built.length} new transactions — ${built.length - lowConfidence.length} auto-tagged, ${lowConfidence.length} need review.`);
  if (duplicates.length > 0) {
    writeln(stderr, `  (${duplicates.length} duplicate(s) skipped)`);
  }

  if (opts.nonInteractive || opts.json) {
    return runNonInteractive(opts, account, built, lowConfidence, duplicates, parseOutcome.errors.length, stdout, stderr, exitCode);
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

  await commitBatch(resolvedOutcomes, { transactionRepository, snapshotService, dbPath, stderr, exitCode });
}

async function commitBatch(
  outcomes: readonly BuildOutcome[],
  deps: Pick<IngestCommandDeps, 'transactionRepository' | 'snapshotService' | 'dbPath' | 'stderr' | 'exitCode'>,
): Promise<void> {
  const { transactionRepository, snapshotService, dbPath, stderr, exitCode } = deps;
  const snapshotPath = dbPath + '.bak';

  const snapResult = await snapshotService.create(dbPath, snapshotPath);
  if (snapResult.isFailure) {
    writeln(stderr, `Snapshot failed: ${snapResult.error}`);
    exitCode(3);
    return;
  }

  const writeResult = transactionRepository.saveBatch(outcomes);
  if (writeResult.isFailure) {
    // sanitizeSqlError redacts hex-like tokens (≥32 consecutive hex chars) from
    // SQLite's raw UNIQUE/CHECK-violation messages; hashes are PII-adjacent
    // fingerprints per security-checklist.md (P2 adopt #1).
    writeln(stderr, `Commit failed (batch rolled back): ${sanitizeSqlError(writeResult.error)}`);
    writeln(stderr, `Snapshot retained at ${snapshotPath} for recovery.`);
    exitCode(4);
    return;
  }

  const removeResult = await snapshotService.remove(snapshotPath);
  if (removeResult.isFailure) {
    // Snapshot-removal failure is non-fatal — the write succeeded. Warn, don't abort.
    writeln(stderr, `Warning: committed successfully but could not remove snapshot at ${snapshotPath}: ${removeResult.error}`);
  }

  writeln(stderr, `${writeResult.value.written} transaction(s) committed.`);
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
      if (!categories.includes(answer.category)) {
        categories.push(answer.category);
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
  duplicates: readonly DuplicateIngestItem[],
  parseErrorsCount: number,
  stdout: Writable,
  stderr: Writable,
  exitCode: (code: number) => void,
): void {
  if (lowConfidence.length > 0) {
    writeln(
      stderr,
      `${lowConfidence.length} item(s) need manual review. Run without --non-interactive to review them (you can define new categories inline), ` +
        `or re-ingest after updating accounting.yaml's auto-tag-rules.`,
    );

    if (opts.json) {
      const lowConfidenceIds = lowConfidence.map((o) => o.transaction.id);
      const duplicatesPayload = duplicates.map((d) => ({
        description: d.item.description,
        idempotencyHash: d.idempotencyHash,
      }));
      stdout.write(
        JSON.stringify({
          file: opts.file,
          source_account: account.id,
          summary: { total: built.length, autoTagged: built.length - lowConfidence.length, lowConfidence: lowConfidence.length, duplicates: duplicates.length, parseErrors: parseErrorsCount },
          items: [],
          lowConfidence: lowConfidenceIds,
          duplicates: duplicatesPayload,
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

    const duplicatesPayload = duplicates.map((d) => ({
      description: d.item.description,
      idempotencyHash: d.idempotencyHash,
    }));

    stdout.write(
      JSON.stringify({
        file: opts.file,
        source_account: account.id,
        summary: { total: built.length, autoTagged: built.length, lowConfidence: 0, duplicates: duplicates.length, parseErrors: parseErrorsCount },
        items,
        lowConfidence: [],
        duplicates: duplicatesPayload,
      }) + '\n',
    );
    exitCode(0);
    return;
  }

  stdout.write(formatSummaryTable(built) + '\n');
  exitCode(0);
}
