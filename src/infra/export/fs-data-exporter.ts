import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import type { DataExporter, ExportCounts, WrittenBundle } from '@core/ports/data-exporter.js';
import { toCsvLine } from './rfc4180.js';

interface TransactionRow {
  id: string;
  occurred_at: string;
  description: string;
  created_at: string;
  idempotency_hash: string | null;
  corrects_id: string | null;
  kind: string;
}

interface EntryRow {
  id: number;
  transaction_id: string;
  account: string;
  side: string;
  amount_cents: number;
  currency: string;
}

interface DomainEventRow {
  seq: number;
  event_type: string;
  recorded_at: string;
  payload: string;
}

function sha256Of(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export class FsDataExporter implements DataExporter {
  constructor(
    private readonly db: Database.Database,
    private readonly resolvedConfigPath: string,
  ) {}

  counts(): Result<ExportCounts> {
    try {
      const transactions = (this.db.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
      const events = (this.db.prepare('SELECT COUNT(*) as n FROM domain_events').get() as { n: number }).n;
      return Result.ok({ transactions, events });
    } catch (err) {
      return Result.fail(String(err));
    }
  }

  async writeBundle(destinationDir: string, bundleName: string): Promise<Result<WrittenBundle>> {
    const finalDir = path.join(destinationDir, bundleName);
    try {
      fs.mkdirSync(finalDir, { recursive: true });

      const transactionsCsv = this.buildTransactionsCsv();
      const entriesCsv = this.buildTransactionEntriesCsv();
      const eventsJson = this.buildDomainEventsJson();
      const configYaml = fs.readFileSync(this.resolvedConfigPath, 'utf8');

      fs.writeFileSync(path.join(finalDir, 'transactions.csv'), transactionsCsv, 'utf8');
      fs.writeFileSync(path.join(finalDir, 'transaction-entries.csv'), entriesCsv, 'utf8');
      fs.writeFileSync(path.join(finalDir, 'domain-events.json'), eventsJson, 'utf8');
      fs.writeFileSync(path.join(finalDir, 'accounting.yaml'), configYaml, 'utf8');

      const countsResult = this.counts();
      if (countsResult.isFailure) return Result.fail(countsResult.error);

      const files = [
        { name: 'transactions.csv', sha256: sha256Of(transactionsCsv) },
        { name: 'transaction-entries.csv', sha256: sha256Of(entriesCsv) },
        { name: 'domain-events.json', sha256: sha256Of(eventsJson) },
        { name: 'accounting.yaml', sha256: sha256Of(configYaml) },
      ];

      const manifest = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        counts: countsResult.value,
        files,
      };
      const manifestJson = JSON.stringify(manifest);
      fs.writeFileSync(path.join(finalDir, 'manifest.json'), manifestJson, 'utf8');

      return Result.ok({ manifestHash: sha256Of(manifestJson), location: finalDir });
    } catch (err) {
      return Result.fail(String(err));
    }
  }

  private buildTransactionsCsv(): string {
    const rows = this.db
      .prepare('SELECT id, occurred_at, description, created_at, idempotency_hash, corrects_id, kind FROM transactions ORDER BY rowid')
      .all() as TransactionRow[];
    const lines = [toCsvLine(['id', 'occurred_at', 'description', 'created_at', 'idempotency_hash', 'corrects_id', 'kind'])];
    for (const row of rows) {
      lines.push(toCsvLine([
        row.id,
        row.occurred_at,
        row.description,
        row.created_at,
        row.idempotency_hash ?? '',
        row.corrects_id ?? '',
        row.kind,
      ]));
    }
    return lines.join('\r\n') + '\r\n';
  }

  private buildTransactionEntriesCsv(): string {
    const rows = this.db
      .prepare('SELECT id, transaction_id, account, side, amount_cents, currency FROM transaction_entries ORDER BY id')
      .all() as EntryRow[];
    const lines = [toCsvLine(['id', 'transaction_id', 'account', 'side', 'amount_cents', 'currency'])];
    for (const row of rows) {
      lines.push(toCsvLine([
        String(row.id),
        row.transaction_id,
        row.account,
        row.side,
        String(row.amount_cents),
        row.currency,
      ]));
    }
    return lines.join('\r\n') + '\r\n';
  }

  private buildDomainEventsJson(): string {
    const rows = this.db
      .prepare('SELECT seq, event_type, recorded_at, payload FROM domain_events ORDER BY seq')
      .all() as DomainEventRow[];
    const events = rows.map((row) => ({
      seq: row.seq,
      type: row.event_type,
      recordedAt: row.recorded_at,
      ...(JSON.parse(row.payload) as Record<string, unknown>),
    }));
    return JSON.stringify(events);
  }
}
