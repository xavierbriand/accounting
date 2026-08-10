import type Database from 'better-sqlite3';
import { getDb } from '../infra/db/sqlite-client.js';
import { FileConfigService } from '../infra/config/config-service.js';
import { SqliteDomainEventRecorder } from '../infra/db/repositories/sqlite-domain-event-recorder.js';
import { SqliteConfigStateStore } from '../infra/db/repositories/sqlite-config-state-store.js';
import { observeConfigChange } from './utils/observe-config-change.js';
import { nodeHashFn } from '../infra/crypto/node-hash-fn.js';
import { assertMigrated } from '../infra/db/migration-check.js';
import { validateDbPath } from '../infra/db/db-path-validator.js';
import type { AppConfig } from '../core/config/app-config.js';
import { Result } from '../core/shared/result.js';

interface DbPathError {
  code: number;
  message: string;
}

interface ResolvedDb {
  config: AppConfig;
  resolvedDbPath: string;
  configService: FileConfigService;
}

export interface LedgerCommandContext extends ResolvedDb {
  db: Database.Database;
}

function resolveDbPathForCommand(
  options: { dbPathOverride?: string },
  projectDir: string,
  stderr: NodeJS.WritableStream,
): Result<ResolvedDb, DbPathError> {
  const configService = new FileConfigService({ projectDir });
  const configResult = configService.load();
  if (configResult.isFailure) {
    return Result.fail({ code: 1, message: configResult.error });
  }
  const config = configResult.value;

  if (options.dbPathOverride !== undefined) {
    stderr.write('[warning] --db-path-override is set; YAML dbPath ignored. Use only for recovery.\n');
  }
  const effectiveDbPath = options.dbPathOverride ?? config.dbPath;

  const validation = validateDbPath(effectiveDbPath);
  if (validation.isFailure) {
    return Result.fail({ code: 2, message: validation.error });
  }

  return Result.ok({ config, resolvedDbPath: validation.value, configService });
}

// Ambient audit observation (FR23, story-4.5a): one shared call per ledger-opening command,
// right after assertMigrated (or, for `migrate`, after a successful migration). Best-effort —
// never blocks the command it's wired into (see observeConfigChange's own doc comment).
// `categorize` is deliberately excluded: it never opens the DB (story-D no-DB invariant,
// enforced by tests/integration/cli/categorize-end-to-end-wiring.test.ts).
export function observeConfigChangeFor(db: Database.Database, config: AppConfig, stderr: NodeJS.WritableStream): void {
  observeConfigChange({
    config,
    configStateStore: new SqliteConfigStateStore(db),
    domainEventRecorder: new SqliteDomainEventRecorder(db),
    hashFn: nodeHashFn,
    stderr,
  });
}

/**
 * Resolve config + a validated dbPath, or write the error and exit the process
 * (1: config-load failure — #231 argues this should be exit 2, deliberately not
 * fixed here, see docs/plans/story-maint-31.md "Selected solution"; 2: dbPath
 * validation failure). Used directly by `migrate` and `categorize` (neither
 * wants the assertMigrated step below); the other six ledger-opening commands
 * go through `openLedgerCommand`.
 */
export function resolveLedgerConfigOrExit(
  options: { dbPathOverride?: string },
  projectDir: string,
  stderr: NodeJS.WritableStream,
): ResolvedDb {
  const result = resolveDbPathForCommand(options, projectDir, stderr);
  if (result.isFailure) {
    stderr.write(`error: ${result.error.message}\n`);
    process.exit(result.error.code);
  }
  return result.value;
}

/**
 * Full ledger-opening sequence shared by ingest/correct/status/explain/export/
 * dissolve: resolve config → open the DB → assert it's migrated (stderr + exit
 * 2 if not) → fire the ambient config-change observation → return the opened
 * context.
 */
export function openLedgerCommand(
  options: { dbPathOverride?: string },
  projectDir: string,
  stderr: NodeJS.WritableStream,
): LedgerCommandContext {
  const resolved = resolveLedgerConfigOrExit(options, projectDir, stderr);
  const db = getDb(resolved.resolvedDbPath);

  const migrationCheck = assertMigrated(db, resolved.resolvedDbPath);
  if (migrationCheck.isFailure) {
    stderr.write(`error: ${migrationCheck.error}\n`);
    process.exit(2);
  }
  observeConfigChangeFor(db, resolved.config, stderr);

  return { ...resolved, db };
}
