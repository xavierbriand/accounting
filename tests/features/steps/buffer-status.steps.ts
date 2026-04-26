/**
 * Step-wiring policy (R7):
 * - Scenarios 1 ("balances classify") and 3 ("duplicate account rejected") use a fake
 *   BufferLedgerQuery (status derivation and config-parse paths do not need real SQL).
 * - Scenarios 2 ("same-day asOf bound") and 4 ("currency mismatch") MUST use the real
 *   SqliteBufferLedgerQuery against an in-memory Database(':memory:') after runMigrations,
 *   because the # fails-if claims reference production SQL paths (substr predicate,
 *   cross-currency detection) that cannot be exercised through a fake.
 */
import { expect } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/infra/db/migrator.js';
import { parseRawConfig } from '../../../src/infra/config/config-schema.js';
import { BufferStateService } from '../../../src/core/buffers/buffer-state-service.js';
import { SqliteBufferLedgerQuery } from '../../../src/infra/db/repositories/sqlite-buffer-ledger-query.js';
import type { BufferLedgerQuery } from '../../../src/core/ports/buffer-ledger-query.js';
import type { BufferState } from '../../../src/core/buffers/buffer-state.js';
import type { BufferBucket } from '../../../src/core/config/app-config.js';
import type { Result } from '../../../src/core/shared/result.js';
import { Money } from '../../../src/core/shared/money.js';

interface World {
  buffers?: readonly BufferBucket[];
  ledgerQuery?: BufferLedgerQuery;
  db?: Database.Database;
  stateResult?: Result<readonly BufferState[]>;
  parseResult?: Result<unknown>;
}

function baseRaw(buffers: unknown): Record<string, unknown> {
  return {
    dbPath: './data/ledger.db',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Paris',
    accounts: [
      { id: 'main-12345678901', type: 'bank', filenamePrefix: '12345678901_' },
    ],
    splits: [
      {
        validFrom: '2024-01-01',
        rules: [
          { partner: 'Alex', ratio: 0.5 },
          { partner: 'Sam', ratio: 0.5 },
        ],
      },
    ],
    buffers,
  };
}

// ─── Scenario 1: balances classify across below / on-target / above-cap ───────
// Uses fake BufferLedgerQuery (status derivation path; no real SQL needed)

interface DataTableRow {
  name: string;
  account: string;
  target: string;
  cap: string;
}

interface LedgerRow {
  account: string;
  side: string;
  amount: string;
}

Given(
  'a config with three buffers:',
  function (state: World, table: { hashes: () => DataTableRow[] }) {
    const rows = table.hashes();
    const raw = rows.map(r => ({
      name: r.name.trim(),
      account: r.account.trim(),
      target: Number(r.target),
      cap: r.cap.trim() !== '' ? Number(r.cap) : undefined,
    }));
    const result = parseRawConfig(baseRaw(raw));
    if (result.isFailure) throw new Error(result.error);
    state.buffers = result.value.buffers;
  },
);

Given(
  'the ledger contains as of {string}:',
  function (state: World, _asOf: string, table: { hashes: () => LedgerRow[] }) {
    const rows = table.hashes();
    const ledger = new Map<string, number>();
    for (const row of rows) {
      const account = row.account.trim();
      const amount = Number(row.amount) * 100; // dollars to cents
      const existing = ledger.get(account) ?? 0;
      ledger.set(account, existing + (row.side.trim() === 'debit' ? amount : -amount));
    }
    // Fake BufferLedgerQuery for scenario 1: sums from in-memory map
    state.ledgerQuery = {
      sumEntriesByAccount(account: string, expectedCurrency: string): Result<Money> {
        const cents = ledger.get(account) ?? 0;
        return Money.fromCents(cents, expectedCurrency);
      },
    };
  },
);

When(
  'I read buffer state as of {string}',
  function (state: World, date: string) {
    const service = new BufferStateService(
      state.buffers ?? [],
      'EUR',
      state.ledgerQuery!,
    );
    state.stateResult = service.getStateAsOf(date);
  },
);

Then('the result is success', function (state: World) {
  expect(state.stateResult?.isSuccess).toBe(true);
});

Then('the result is failure', function (state: World) {
  expect(state.stateResult?.isFailure).toBe(true);
});

Then(
  '{string} has balance {float} EUR and status {string}',
  function (state: World, name: string, balance: number, status: string) {
    const states = state.stateResult!.value;
    const entry = states.find(s => s.name === name.trim());
    expect(entry).toBeDefined();
    expect(entry!.balance.amount).toBe(Math.round(balance * 100));
    expect(entry!.status).toBe(status);
  },
);

// ─── Scenario 2: same-day asOf bound (uses real SqliteBufferLedgerQuery) ──────

Given(
  'a config with one buffer {string} mapped to {string} target {int}',
  function (state: World, name: string, account: string, target: number) {
    const result = parseRawConfig(baseRaw([{ name, account, target }]));
    if (result.isFailure) throw new Error(result.error);
    state.buffers = result.value.buffers;
    state.db = new Database(':memory:');
    runMigrations(state.db);
    state.ledgerQuery = new SqliteBufferLedgerQuery(state.db);
  },
);

Given(
  'the ledger has a debit of {int} on {string} at {string}',
  function (state: World, amount: number, account: string, occurredAt: string) {
    const db = state.db!;
    const txId = `tx-${occurredAt}`;
    db.prepare(
      'INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)',
    ).run(txId, occurredAt, 'test debit', `hash-debit-${txId}`);
    db.prepare(
      'INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES (?, ?, ?, ?, ?)',
    ).run(txId, account, 'debit', amount * 100, 'EUR');
  },
);

Then(
  '{string} has balance {float} EUR',
  function (state: World, name: string, balance: number) {
    const states = state.stateResult!.value;
    const entry = states.find(s => s.name === name.trim());
    expect(entry).toBeDefined();
    expect(entry!.balance.amount).toBe(Math.round(balance * 100));
  },
);

// ─── Scenario 3: duplicate buffer-account mapping rejected at config parse ─────
// Uses config parse path only; no service involved

Given(
  'a config where two buffers share the account {string}',
  function (state: World, account: string) {
    const raw = baseRaw([
      { name: 'Car', account, target: 1000 },
      { name: 'House', account, target: 5000 },
    ]);
    state.parseResult = parseRawConfig(raw);
  },
);

When('the buffer config is parsed', function (state: World) {
  // parseResult was already set in the Given step for scenario 3.
  // This step is intentionally a no-op: parsing happened at Given time.
  void state;
});

Then(
  'loading fails with an error containing {string}',
  function (state: World, fragment: string) {
    expect(state.parseResult?.isFailure).toBe(true);
    expect(state.parseResult?.error).toContain(fragment);
  },
);

// ─── Scenario 4: currency mismatch (uses real SqliteBufferLedgerQuery) ─────────

Given(
  'a config with default currency EUR and buffer {string} on {string}',
  function (state: World, name: string, account: string) {
    const result = parseRawConfig(baseRaw([{ name, account, target: 1000 }]));
    if (result.isFailure) throw new Error(result.error);
    state.buffers = result.value.buffers;
    state.db = new Database(':memory:');
    runMigrations(state.db);
    state.ledgerQuery = new SqliteBufferLedgerQuery(state.db);
  },
);

Given(
  'the ledger has a USD entry on {string}',
  function (state: World, account: string) {
    const db = state.db!;
    const txId = `tx-usd-mismatch`;
    db.prepare(
      'INSERT INTO transactions (id, occurred_at, description, idempotency_hash) VALUES (?, ?, ?, ?)',
    ).run(txId, '2026-04-26T00:00:00+00:00', 'USD test entry', `hash-usd-${txId}`);
    db.prepare(
      'INSERT INTO transaction_entries (transaction_id, account, side, amount_cents, currency) VALUES (?, ?, ?, ?, ?)',
    ).run(txId, account, 'debit', 10000, 'USD');
  },
);

Then(
  'the error cites {string} and {string}',
  function (state: World, account: string, currency: string) {
    expect(state.stateResult?.isFailure).toBe(true);
    expect(state.stateResult?.error).toContain(account);
    expect(state.stateResult?.error).toContain(currency);
  },
);
