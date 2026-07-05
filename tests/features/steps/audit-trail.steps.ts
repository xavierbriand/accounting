import { expect, afterEach } from 'vitest';
import { When, Then } from 'quickpickle';
import path from 'path';
import Database from 'better-sqlite3';
import { spawnCli } from '../../_helpers/spawn-cli.js';

// AuditTrailWorld mirrors IngestWorld's field shape (ingest.steps.ts) so the shared
// Given/Then steps registered there ('a fresh migrated DB…', 'a BPCE CSV copied…',
// 'the process exits with code') can read/write the same quickpickle state object.
interface AuditTrailWorld {
  tmpDir?: string;
  csvPath?: string;
  dbPath?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
}

const dbs: Database.Database[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
});

/**
 * bpce-valid.csv (copied as bpce-valid_real.csv by the shared step) has 5 rows;
 * with the autoTagRules set by 'a fresh migrated DB and accounting.yaml at a temp
 * dir' (mutuelle→Insurance, abonnement→Subscriptions), 2 rows auto-tag high-confidence
 * and 3 remain low-confidence, each requiring one selectCategory 'keep' prompt before
 * the single confirmBatch prompt fires (ingest-command.ts runInteractiveLoop order).
 */
function makeScriptedConfirmBatch(): string {
  return JSON.stringify([
    { type: 'selectCategory', action: 'keep' },
    { type: 'selectCategory', action: 'keep' },
    { type: 'selectCategory', action: 'keep' },
    { type: 'confirmBatch', confirm: true },
  ]);
}

When('I run scripted ingest confirming the batch on {string}', function (state: AuditTrailWorld, filename: string) {
  const csvPath = path.join(state.tmpDir!, filename);
  const script = makeScriptedConfirmBatch();
  state.lastResult = spawnCli(
    ['ingest', '--file', csvPath, '--scripted-prompts', script],
    { cwd: state.tmpDir, env: { NODE_ENV: 'test' } },
  );
});

Then('the audit trail holds one TransactionIngested event', function (state: AuditTrailWorld) {
  const db = new Database(state.dbPath!);
  dbs.push(db);
  const rows = db.prepare('SELECT event_type FROM domain_events').all() as { event_type: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].event_type).toBe('TransactionIngested');
});

Then('its payload lists the committed transaction ids and source account', function (state: AuditTrailWorld) {
  const db = new Database(state.dbPath!);
  dbs.push(db);
  const row = db.prepare('SELECT payload FROM domain_events').get() as { payload: string };
  const payload = JSON.parse(row.payload) as { transactionIds: string[]; sourceAccount: string };

  const committedIds = (db.prepare('SELECT id FROM transactions ORDER BY id').all() as { id: string }[]).map((r) => r.id);
  expect(committedIds).toHaveLength(5);
  expect([...payload.transactionIds].sort()).toEqual([...committedIds].sort());
  expect(payload.sourceAccount).toBe('bpce-valid-account');
});
