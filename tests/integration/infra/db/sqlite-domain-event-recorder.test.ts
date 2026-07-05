/**
 * Integration tests for SqliteDomainEventRecorder (real SQLite) — append-only, ordered,
 * UTC-stamped event store (FR23 audit-trail spine).
 *
 * Gherkin coverage: none directly (store-level mechanics) — see
 *   docs/plans/story-4.1.md "Verification plan" § Append-only + ordering.
 *
 * fails if: seq does not strictly increase across record() calls, recorded_at is not a
 *   valid UTC ISO string, payload does not round-trip the event's domain fields, or the
 *   payload leaks a description / any field beyond transactionIds + sourceAccount.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/infra/db/migrator.js';
import { SqliteDomainEventRecorder } from '../../../../src/infra/db/repositories/sqlite-domain-event-recorder.js';
import type { TransactionIngested } from '../../../../src/core/events/domain-event.js';

const dbs: Database.Database[] = [];

function makeMigratedDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.open) db.close();
  }
});

describe('SqliteDomainEventRecorder', () => {
  it('records an event and returns Result.ok', () => {
    const db = makeMigratedDb();
    const recorder = new SqliteDomainEventRecorder(db);

    const event: TransactionIngested = {
      type: 'TransactionIngested',
      transactionIds: ['tx-1'],
      sourceAccount: 'main-account',
    };

    const result = recorder.record(event);
    expect(result.isSuccess).toBe(true);
  });

  it('two record() calls produce strictly increasing seq values (ordering)', () => {
    const db = makeMigratedDb();
    const recorder = new SqliteDomainEventRecorder(db);

    recorder.record({ type: 'TransactionIngested', transactionIds: ['tx-1'], sourceAccount: 'a' });
    recorder.record({ type: 'TransactionIngested', transactionIds: ['tx-2'], sourceAccount: 'b' });

    const rows = db.prepare('SELECT seq FROM domain_events ORDER BY seq').all() as { seq: number }[];
    expect(rows).toHaveLength(2);
    expect(rows[1].seq).toBeGreaterThan(rows[0].seq);
  });

  it('recorded_at parses as a valid UTC ISO date', () => {
    const db = makeMigratedDb();
    const recorder = new SqliteDomainEventRecorder(db);

    recorder.record({ type: 'TransactionIngested', transactionIds: ['tx-1'], sourceAccount: 'a' });

    const row = db.prepare('SELECT recorded_at FROM domain_events').get() as { recorded_at: string };
    expect(row.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(row.recorded_at))).toBe(false);
  });

  it('payload JSON round-trips the event domain fields and carries no description/PII', () => {
    const db = makeMigratedDb();
    const recorder = new SqliteDomainEventRecorder(db);

    recorder.record({
      type: 'TransactionIngested',
      transactionIds: ['tx-1', 'tx-2'],
      sourceAccount: 'main-account',
    });

    const row = db.prepare('SELECT event_type, payload FROM domain_events').get() as {
      event_type: string;
      payload: string;
    };
    expect(row.event_type).toBe('TransactionIngested');

    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    expect(payload).toEqual({ transactionIds: ['tx-1', 'tx-2'], sourceAccount: 'main-account' });
    expect(payload['description']).toBeUndefined();
    expect(Object.keys(payload).sort()).toEqual(['sourceAccount', 'transactionIds']);
  });

  it('exposes no update/delete path (insert-only surface)', () => {
    const db = makeMigratedDb();
    const recorder = new SqliteDomainEventRecorder(db);

    expect((recorder as unknown as Record<string, unknown>)['update']).toBeUndefined();
    expect((recorder as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });
});
