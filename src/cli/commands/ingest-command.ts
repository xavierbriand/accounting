import type { Writable } from 'stream';
import type { CsvParser } from '@core/ports/csv-parser.js';
import type { IdempotencyService } from '@core/ingest/idempotency-service.js';
import type { TransactionBuilder } from '@core/ingest/transaction-builder.js';
import type { BuildOutcome, DuplicateIngestItem, ParseOutcome } from '@core/ingest/types.js';
import type { AccountConfig, AppConfig } from '@core/config/app-config.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { ConfigWriter } from '@core/ports/config-writer.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';
import type { InteractivePrompter } from '../utils/interactive.js';
import type { pickSourceAccount as PickSourceAccountFn } from '../../infra/fs/pick-source-account.js';
import type { readBpceCsv as ReadBpceCsvFn } from '../../infra/fs/read-bpce-csv.js';
import { formatSummaryTable } from '../utils/printer.js';
import { sanitizeSqlError } from '../utils/sanitize-sql-error.js';
import { suggestPattern } from '@core/ingest/pattern-suggester.js';
import { expenseAccount } from '@core/ingest/account-names.js';
import { Transaction, type EntryDraft } from '@core/ledger/transaction.js';

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
  readonly configWriter: ConfigWriter;
  readonly domainEventRecorder: DomainEventRecorder;
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
  const { config, idempotencyService, transactionBuilder, prompt, stdout, stderr, exitCode, transactionRepository, snapshotService, dbPath, configWriter, domainEventRecorder } = deps;

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

  const loopResult = await runInteractiveLoop(built, lowConfidence, prompt, stderr, exitCode);
  if (loopResult === null) return;
  const { resolved: resolvedOutcomes, rememberedRules } = loopResult;

  writeln(stdout, formatSummaryTable(resolvedOutcomes));

  const confirmed = await prompt.confirmBatch(resolvedOutcomes.length);
  if (!confirmed) {
    writeln(stderr, 'Ingest cancelled.');
    exitCode(1);
    return;
  }

  // YAML write BEFORE DB commit (Q1-b atomicity sequence step 4)
  if (rememberedRules.length > 0) {
    const writeResult = await configWriter.appendAutoTagRules(rememberedRules);
    if (writeResult.isFailure) {
      const err = writeResult.error;
      if (err.kind === 'mtime-race') {
        writeln(stderr, 'Your accounting.yaml changed externally; please re-run ingest.');
      } else if (err.kind === 'conflict') {
        writeln(stderr, `Config conflict: pattern '${err.pattern}' already exists under category '${err.existingCategory}'. Remove or rename before adding under a new category.`);
      } else {
        writeln(stderr, `Config write failed: ${err.message}`);
      }
      exitCode(5);
      return;
    }
  }

  await commitBatch(resolvedOutcomes, account.id, { transactionRepository, snapshotService, dbPath, stderr, exitCode, domainEventRecorder });
}

async function commitBatch(
  outcomes: readonly BuildOutcome[],
  sourceAccount: string,
  deps: Pick<IngestCommandDeps, 'transactionRepository' | 'snapshotService' | 'dbPath' | 'stderr' | 'exitCode' | 'domainEventRecorder'>,
): Promise<void> {
  const { transactionRepository, snapshotService, dbPath, stderr, exitCode, domainEventRecorder } = deps;
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

  // Recorded only after saveBatch succeeds (B1 app-boundary wiring, story-4.1) — a
  // failed record() does not roll back the already-committed batch; the rows are
  // durable, so we warn rather than fail (mirrors the snapshot-removal pattern below).
  const recordResult = domainEventRecorder.record({
    type: 'TransactionIngested',
    transactionIds: outcomes.map((o) => o.transaction.id),
    sourceAccount,
  });
  if (recordResult.isFailure) {
    writeln(stderr, `Warning: committed successfully but could not record the audit event: ${recordResult.error}`);
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
): Promise<{ resolved: BuildOutcome[]; rememberedRules: Array<{ category: string; pattern: string }> } | null> {
  const resolved: BuildOutcome[] = [...built];
  // Deduplicated buffer (Q5-c): keyed by "category|pattern"
  const rememberedMap = new Map<string, { category: string; pattern: string }>();

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
        // Rebuild the expense-side entry's account from the new category so the
        // change is durable through saveBatch (entries[].account is what gets
        // written to the DB; outcome.category alone is summary-only). Only the
        // 'expense' classification has an Expense:<category> debit; income and
        // internal-transfer don't get rewritten here. The 'low' confidence
        // outcomes that hit this prompt are by definition 'expense' (auto-tag
        // rules don't match income), so the rewrite is sound.
        const newExpenseAccount = expenseAccount(answer.category);
        const newEntries: EntryDraft[] = outcome.transaction.entries.map((e) =>
          e.side === 'debit' && e.account.startsWith('Expense:')
            ? { account: newExpenseAccount, side: e.side, amount: e.amount }
            : { account: e.account, side: e.side, amount: e.amount },
        );
        const newTxResult = Transaction.create({
          id: outcome.transaction.id,
          occurredAt: outcome.transaction.occurredAt,
          description: outcome.transaction.description,
          entries: newEntries,
        });
        if (!newTxResult.isSuccess) {
          // Practically unreachable: rewriting one entry's account without changing amounts
          // can't violate the double-entry balance. But guarding the failure path keeps the
          // remembered-rule buffer in sync with what was actually persisted to the DB —
          // skip the rest of this iteration so we don't buffer a rule for a category the
          // outcome wasn't tagged with. Phase-4 review surfaced the unguarded fall-through.
          writeln(
            stderr,
            `Warning: could not apply category change for "${outcome.transaction.description}"; keeping the original tag and skipping the remember prompt.`,
          );
          continue;
        }
        resolved[idx] = {
          ...outcome,
          category: answer.category,
          confidence: 'high',
          transaction: newTxResult.value,
        };
      }
      if (!categories.includes(answer.category)) {
        categories.push(answer.category);
      }

      // Ask to remember the rule
      const suggestion = suggestPattern(outcome.transaction.description);
      const rememberResult = await prompt.confirmRememberRule(
        outcome.transaction.description,
        suggestion,
        answer.category,
      );

      if (rememberResult.action === 'remember') {
        const key = `${answer.category}|${rememberResult.pattern}`;
        rememberedMap.set(key, { category: answer.category, pattern: rememberResult.pattern });
      }
    }
  }

  return { resolved, rememberedRules: Array.from(rememberedMap.values()) };
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
