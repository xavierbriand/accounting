import { expect, afterEach } from 'vitest';
import { Given, When, Then } from 'quickpickle';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';
import Database from 'better-sqlite3';
import { FileConfigService } from '../../../src/infra/config/config-service.js';
import { NodeCsvParser } from '../../../src/infra/csv/node-csv-parser.js';
import { IdempotencyService } from '../../../src/core/ingest/idempotency-service.js';
import { TransactionBuilder } from '../../../src/core/ingest/transaction-builder.js';
import { SqliteHashRepository } from '../../../src/infra/db/repositories/sqlite-hash-repository.js';
import { SqliteTransactionRepository } from '../../../src/infra/db/repositories/sqlite-transaction-repo.js';
import { NodeSqliteSnapshotService } from '../../../src/infra/db/node-sqlite-snapshot-service.js';
import { nodeHashFn } from '../../../src/infra/crypto/node-hash-fn.js';
import { nodeUuidGen } from '../../../src/infra/crypto/node-uuid-gen.js';
import { pickSourceAccount } from '../../../src/infra/fs/pick-source-account.js';
import { readBpceCsv } from '../../../src/infra/fs/read-bpce-csv.js';
import { runIngestCommand } from '../../../src/cli/commands/ingest-command.js';
import { spawnCli } from '../../_helpers/spawn-cli.js';
import { writeStubYaml } from '../../_helpers/inline-config.js';
import { Result } from '../../../src/core/shared/result.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_CSV = path.join(__dirname, '../../fixtures/csv/bpce-valid.csv');

interface IngestWorld {
  tmpDir?: string;
  csvPath?: string;
  dbPath?: string;
  lastResult?: { status: number; stdout: string; stderr: string };
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-bdd-'));
  tmpDirs.push(dir);
  return dir;
}

Given('a fresh migrated DB and accounting.yaml at a temp dir', function (state: IngestWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
  state.dbPath = path.join(tmpDir, 'test.db');
  // dbPath in YAML uses relative './test.db'; cwd=tmpDir makes it resolve to tmpDir/test.db
  // autoTagRules: minimal set that matches the bpce-valid fixture (mutuelle→Insurance,
  // abonnement→Subscriptions) so the auto-tagging BDD scenario sees autoTagged=2.
  writeStubYaml(tmpDir, {
    autoTagRules: [
      { category: 'Insurance', patterns: ['mutuelle'] },
      { category: 'Subscriptions', patterns: ['abonnement'] },
    ],
  });
  // YAML-authoritative: no --db-path flag after #65 (story-maint-11)
  spawnCli(['migrate'], { cwd: tmpDir });
});

Given('a BPCE CSV copied to that temp dir as {string}', function (state: IngestWorld, filename: string) {
  const csvPath = path.join(state.tmpDir!, filename);
  fs.copyFileSync(FIXTURE_CSV, csvPath);
  state.csvPath = csvPath;
});

Given('the CSV has been committed interactively', async function (state: IngestWorld) {
  // Seed the DB by running runIngestCommand directly with an auto-confirm prompter.
  // Inquirer's `select` requires a TTY; piped stdin can't drive it. The
  // in-process approach is the deterministic equivalent of "the user accepted
  // all classifications and confirmed the batch."
  const db = new Database(state.dbPath!);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const configService = new FileConfigService({ projectDir: state.tmpDir! });
  const configResult = configService.load();
  if (configResult.isFailure) throw new Error(`Config load failed: ${configResult.error}`);
  const config = configResult.value;

  const csvParser = new NodeCsvParser();
  const hashRepo = new SqliteHashRepository(db);
  const idempotencyService = new IdempotencyService(nodeHashFn, hashRepo);
  const transactionBuilderFactory = (accounts: ConstructorParameters<typeof TransactionBuilder>[0]) =>
    new TransactionBuilder(accounts, config.autoTagRules, nodeUuidGen);
  const transactionRepository = new SqliteTransactionRepository(db);
  const snapshotService = new NodeSqliteSnapshotService(db);

  const sink = new PassThrough();
  sink.resume();

  await runIngestCommand(
    { file: state.csvPath!, nonInteractive: false, json: false },
    {
      config,
      csvParser,
      idempotencyService,
      transactionBuilder: transactionBuilderFactory,
      pickSourceAccount,
      readFile: readBpceCsv,
      prompt: {
        selectCategory: () => Promise.resolve({ action: 'keep' }),
        confirmBatch: () => Promise.resolve(true),
        confirmRememberRule: () => Promise.resolve({ action: 'skip' as const }),
      },
      stdout: sink,
      stderr: sink,
      exitCode: () => {},
      transactionRepository,
      snapshotService,
      dbPath: state.dbPath!,
      configWriter: { appendAutoTagRules: async () => Result.ok() },
    },
  );

  db.close();
});

When('I run ingest with {string}', function (state: IngestWorld, flagsStr: string) {
  const flags = flagsStr.trim().split(/\s+/);
  // YAML-authoritative dbPath after #65: no --db-path flag; cwd=tmpDir resolves ./test.db
  const args = ['ingest', '--file', state.csvPath!, ...flags];
  state.lastResult = spawnCli(args, { cwd: state.tmpDir });
});

Then('the process exits with code {int}', function (state: IngestWorld, code: number) {
  expect(state.lastResult!.status).toBe(code);
});

Then('stderr contains {string}', function (state: IngestWorld, text: string) {
  expect(state.lastResult!.stderr).toContain(text);
});

Then('stderr contains no {string} or {string} lines', function (state: IngestWorld, text1: string, text2: string) {
  expect(state.lastResult!.stderr).not.toContain(text1);
  expect(state.lastResult!.stderr).not.toContain(text2);
});

Then('stderr contains no {string} lines', function (state: IngestWorld, text: string) {
  expect(state.lastResult!.stderr).not.toContain(text);
});

Then('the JSON payload\'s {string} equals {int}', function (state: IngestWorld, fieldPath: string, expected: number) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const parts = fieldPath.split('.');
  let value: unknown = json;
  for (const part of parts) {
    value = (value as Record<string, unknown>)[part];
  }
  expect(value).toBe(expected);
});

Then('the JSON payload\'s {string} array length equals {int}', function (state: IngestWorld, fieldPath: string, expected: number) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const parts = fieldPath.split('.');
  let value: unknown = json;
  for (const part of parts) {
    value = (value as Record<string, unknown>)[part];
  }
  expect(Array.isArray(value)).toBe(true);
  expect((value as unknown[]).length).toBe(expected);
});

Then('the JSON payload\'s {string} has {string} and {string} fields populated', function (state: IngestWorld, jsonPath: string, field1: string, field2: string) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const parts = jsonPath.split('.');
  let value: unknown = json;
  for (const part of parts) {
    if (part.endsWith(']')) {
      const bracket = part.indexOf('[');
      const key = part.slice(0, bracket);
      const index = parseInt(part.slice(bracket + 1, -1), 10);
      value = ((value as Record<string, unknown>)[key] as unknown[])[index];
    } else {
      value = (value as Record<string, unknown>)[part];
    }
  }
  const obj = value as Record<string, unknown>;
  expect(obj[field1]).toBeTruthy();
  expect(typeof obj[field1]).toBe('string');
  expect(obj[field2]).toBeTruthy();
  expect(typeof obj[field2]).toBe('string');
});

Then('the JSON payload\'s {string} array is empty', function (state: IngestWorld, fieldPath: string) {
  const json = JSON.parse(state.lastResult!.stdout.trim()) as Record<string, unknown>;
  const parts = fieldPath.split('.');
  let value: unknown = json;
  for (const part of parts) {
    value = (value as Record<string, unknown>)[part];
  }
  expect(Array.isArray(value)).toBe(true);
  expect((value as unknown[]).length).toBe(0);
});

Then('the JSON payload contains no partner names verbatim', function (state: IngestWorld) {
  const raw = state.lastResult!.stdout;
  expect(raw).not.toContain('Alice');
  expect(raw).not.toContain('Bob');
});

// Step definitions for YAML-authoritative dbPath scenarios (story-maint-11)

Given('a fresh tmp dir', function (state: IngestWorld) {
  const tmpDir = makeTmpDir();
  state.tmpDir = tmpDir;
});

Given('an accounting.yaml at tmp dir with dbPath: {string}', function (state: IngestWorld, dbPathValue: string) {
  writeStubYaml(state.tmpDir!, { dbPath: dbPathValue });
});

When('I run migrate with no --db-path-override', function (state: IngestWorld) {
  state.lastResult = spawnCli(['migrate'], { cwd: state.tmpDir });
});

When('I run migrate with --db-path-override {string}', function (state: IngestWorld, overridePath: string) {
  const resolvedOverride = path.join(state.tmpDir!, overridePath);
  state.lastResult = spawnCli(['migrate', '--db-path-override', resolvedOverride], { cwd: state.tmpDir });
});

Then('the migration creates the file at {string}', function (state: IngestWorld, relativePath: string) {
  const fullPath = path.join(state.tmpDir!, relativePath);
  expect(fs.existsSync(fullPath)).toBe(true);
});

Then('no file exists at {string}', function (state: IngestWorld, relativePath: string) {
  const fullPath = path.join(state.tmpDir!, relativePath);
  expect(fs.existsSync(fullPath)).toBe(false);
});
