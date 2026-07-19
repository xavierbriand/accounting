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
import { formatJsonSuccess, formatJsonError, writeJsonErrorIf } from '../utils/json-envelope.js';
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
    writeJsonErrorIf(stderr, opts.json, 'ingest', { code: 'INVALID_ARGUMENT', message: accountResult.error });
    exitCode(2);
    return null;
  }
  const account: AccountConfig = accountResult.value;

  const readResult = readFile(opts.file);
  if (readResult.isFailure) {
    writeln(stderr, readResult.error);
    writeJsonErrorIf(stderr, opts.json, 'ingest', { code: 'READ_FAILURE', message: readResult.error });
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
    const message = `Parse error: ${parseResult.error}`;
    writeln(stderr, message);
    writeJsonErrorIf(stderr, opts.json, 'ingest', { code: 'READ_FAILURE', message });
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
    const message = `Idempotency check failed: ${idempotencyResult.error}`;
    writeln(stderr, message);
    writeJsonErrorIf(stderr, opts.json, 'ingest', { code: 'QUERY_FAILURE', message });
    exitCode(1);
    return;
  }
  const { fresh, duplicates } = idempotencyResult.value;

  const builder = transactionBuilder(config.accounts);
  const buildResult = builder.buildAll(fresh);
  if (buildResult.isFailure) {
    const message = `Build error: ${buildResult.error}`;
    writeln(stderr, message);
    writeJsonErrorIf(stderr, opts.json, 'ingest', { code: 'QUERY_FAILURE', message });
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
    await runNonInteractive(opts, account, built, lowConfidence, duplicates, parseOutcome.errors.length, stdout, stderr, exitCode, {
      transactionRepository,
      snapshotService,
      dbPath,
      domainEventRecorder,
    });
    return;
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

  await commitBatch(resolvedOutcomes, account.id, opts.json, { transactionRepository, snapshotService, dbPath, stderr, exitCode, domainEventRecorder });
}

async function commitBatch(
  outcomes: readonly BuildOutcome[],
  sourceAccount: string,
  json: boolean,
  deps: Pick<IngestCommandDeps, 'transactionRepository' | 'snapshotService' | 'dbPath' | 'stderr' | 'exitCode' | 'domainEventRecorder'>,
): Promise<void> {
  const { transactionRepository, snapshotService, dbPath, stderr, exitCode, domainEventRecorder } = deps;
  const snapshotPath = dbPath + '.bak';

  const snapResult = await snapshotService.create(dbPath, snapshotPath);
  if (snapResult.isFailure) {
    const message = `Snapshot failed: ${snapResult.error}`;
    writeln(stderr, message);
    writeJsonErrorIf(stderr, json, 'ingest', { code: 'SNAPSHOT_FAILURE', message });
    exitCode(3);
    return;
  }

  const writeResult = transactionRepository.saveBatch(outcomes);
  if (writeResult.isFailure) {
    // sanitizeSqlError redacts hex-like tokens (≥32 consecutive hex chars) from
    // SQLite's raw UNIQUE/CHECK-violation messages; hashes are PII-adjacent
    // fingerprints per security-checklist.md (P2 adopt #1).
    const message = `Commit failed (batch rolled back): ${sanitizeSqlError(writeResult.error)}`;
    writeln(stderr, message);
    writeln(stderr, `Snapshot retained at ${snapshotPath} for recovery.`);
    writeJsonErrorIf(stderr, json, 'ingest', { code: 'WRITE_FAILURE', message });
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
    // sanitizeSqlError: the recorder returns String(SqliteError) on failure, which can
    // embed hex-like fingerprint tokens — redact before stderr, same as the saveBatch
    // branch above (P2 review, security-checklist PII hygiene).
    writeln(stderr, `Warning: committed successfully but could not record the audit event: ${sanitizeSqlError(recordResult.error)}`);
  }

  const removeResult = await snapshotService.remove(snapshotPath);
  if (removeResult.isFailure) {
    // Snapshot-removal failure is non-fatal — the write succeeded. Warn, don't abort.
    writeln(stderr, `Warning: committed successfully but could not remove snapshot at ${snapshotPath}: ${removeResult.error}`);
  }

  writeln(stderr, `${writeResult.value.written} transaction(s) committed.`);
  exitCode(0);
}

// Rebuilds the expense-side entry's account from the new category so the change is
// durable through saveBatch (entries[].account is what gets written to the DB;
// outcome.category alone is summary-only). Only the 'expense' classification has an
// Expense:<category> debit; income and internal-transfer don't get rewritten here. The
// 'low' confidence outcomes that reach this helper are by definition 'expense' (auto-tag
// rules don't match income), so the rewrite is sound. Shared by the manual 'change'
// prompt and the same-run auto-tag branch (Story E) so the two paths cannot drift.
function applyCategoryChange(outcome: BuildOutcome, category: string): BuildOutcome | null {
  const newExpenseAccount = expenseAccount(category);
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
  // Practically unreachable: rewriting one entry's account without changing amounts
  // can't violate the double-entry balance. Callers keep the original outcome and warn
  // rather than trust a transaction we couldn't validate.
  if (!newTxResult.isSuccess) return null;

  return {
    ...outcome,
    category,
    confidence: 'high',
    transaction: newTxResult.value,
  };
}

// #103 Option B: rules remembered so far this run re-apply to later pending rows without
// re-prompting. Same `new RegExp(pattern, 'i')` construction config-schema.ts gives the
// identical pattern on the next invocation, so in-run behavior matches next-invocation
// behavior. First-matching-rule-wins in insertion order (deterministic); forward-only —
// only rows visited after a rule is remembered can match it.
function findMatchingRememberedRule(
  description: string,
  rememberedMap: ReadonlyMap<string, { category: string; pattern: string }>,
): { category: string; pattern: string } | undefined {
  for (const rule of rememberedMap.values()) {
    // A syntactically invalid user-edited pattern must not crash mid-ingest:
    // it simply never fires this run (the YAML write still happens; the next
    // invocation's config load reports it with a path-cited error). The regex
    // is user-authored by design — CodeQL's js/regex-injection on this line is
    // the feature, matching config-schema.ts's identical next-invocation
    // construction on the same string.
    try {
      if (new RegExp(rule.pattern, 'i').test(description)) {
        return rule;
      }
    } catch {
      continue;
    }
  }
  return undefined;
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
    const matchedRule = findMatchingRememberedRule(outcome.transaction.description, rememberedMap);
    if (matchedRule !== undefined) {
      const idx = resolved.findIndex((o) => o === outcome);
      const updated = idx === -1 ? null : applyCategoryChange(outcome, matchedRule.category);
      if (updated !== null) {
        resolved[idx] = updated;
        writeln(
          stderr,
          `Auto-tagged "${outcome.transaction.description}" → ${matchedRule.category} (rule remembered this run)`,
        );
        continue;
      }
      // Practically unreachable (see applyCategoryChange) — fall through to the normal
      // prompt so the row still gets resolved instead of being silently dropped.
      writeln(
        stderr,
        `Warning: could not auto-apply the remembered rule for "${outcome.transaction.description}"; falling back to manual review.`,
      );
    }

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
        const updated = applyCategoryChange(outcome, answer.category);
        if (updated === null) {
          // Skip the rest of this iteration so we don't buffer a rule for a category the
          // outcome wasn't tagged with. Phase-4 review surfaced the unguarded fall-through.
          writeln(
            stderr,
            `Warning: could not apply category change for "${outcome.transaction.description}"; keeping the original tag and skipping the remember prompt.`,
          );
          continue;
        }
        resolved[idx] = updated;
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

function toDuplicatesPayload(
  duplicates: readonly DuplicateIngestItem[],
): Array<{ description: string; idempotencyHash: string }> {
  return duplicates.map((d) => ({
    description: d.item.description,
    idempotencyHash: d.idempotencyHash,
  }));
}

function toItemsPayload(
  built: readonly BuildOutcome[],
): Array<{ id: string; occurredAt: string; description: string; amount: string; debit: string; credit: string; category: string; classification: string }> {
  return built.map((o) => {
    const debitEntry = o.transaction.entries.find((e) => e.side === 'debit');
    const creditEntry = o.transaction.entries.find((e) => e.side === 'credit');
    return {
      id: o.transaction.id,
      occurredAt: o.transaction.occurredAt,
      description: o.transaction.description,
      amount: debitEntry !== undefined ? debitEntry.amount.toString() : '',
      debit: debitEntry?.account ?? '',
      credit: creditEntry?.account ?? '',
      category: o.category,
      classification: o.classification,
    };
  });
}

async function runNonInteractive(
  opts: IngestCommandOptions,
  account: AccountConfig,
  built: readonly BuildOutcome[],
  lowConfidence: readonly BuildOutcome[],
  duplicates: readonly DuplicateIngestItem[],
  parseErrorsCount: number,
  stdout: Writable,
  stderr: Writable,
  exitCode: (code: number) => void,
  commitDeps: Pick<IngestCommandDeps, 'transactionRepository' | 'snapshotService' | 'dbPath' | 'domainEventRecorder'>,
): Promise<void> {
  if (lowConfidence.length > 0) {
    writeln(
      stderr,
      `${lowConfidence.length} item(s) need manual review. Run without --non-interactive to review them (you can define new categories inline), ` +
        `or re-ingest after updating accounting.yaml's auto-tag-rules.`,
    );

    if (opts.json) {
      const lowConfidenceIds = lowConfidence.map((o) => o.transaction.id);
      const duplicatesPayload = toDuplicatesPayload(duplicates);
      stderr.write(formatJsonError('ingest', {
        code: 'NEEDS_REVIEW',
        message: `${lowConfidence.length} item(s) need manual review.`,
        suggestedAction: 'Run without --non-interactive to review them (you can define new categories inline), or re-ingest after updating accounting.yaml\'s auto-tag-rules.',
        details: {
          file: opts.file,
          sourceAccount: account.id,
          summary: { total: built.length, autoTagged: built.length - lowConfidence.length, lowConfidence: lowConfidence.length, duplicates: duplicates.length, parseErrors: parseErrorsCount },
          lowConfidence: lowConfidenceIds,
          duplicates: duplicatesPayload,
        },
      }));
    }

    exitCode(2);
    return;
  }

  if (opts.json) {
    const items = toItemsPayload(built);
    const duplicatesPayload = toDuplicatesPayload(duplicates);

    stdout.write(formatJsonSuccess('ingest', {
      file: opts.file,
      sourceAccount: account.id,
      summary: { total: built.length, autoTagged: built.length, lowConfidence: 0, duplicates: duplicates.length, parseErrors: parseErrorsCount },
      items,
      duplicates: duplicatesPayload,
    }));
  } else {
    stdout.write(formatSummaryTable(built) + '\n');
  }

  // Emitted before commitBatch, mirroring the interactive flow's summary-table-then-commit
  // order: commitBatch's own exitCode(0) call is process.exit() at the composition root
  // (program.ts), which halts the process synchronously — any stdout write attempted after
  // that call would be silently dropped (story-4.4a finding; verified empirically, not just
  // in the mocked exitCode of these unit tests).
  await commitBatch(built, account.id, opts.json, { ...commitDeps, stderr, exitCode });
}
