import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import type { DomainEvent } from '@core/events/domain-event.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';

export class SqliteDomainEventRecorder implements DomainEventRecorder {
  private readonly insertEvent: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insertEvent = db.prepare(
      'INSERT INTO domain_events (event_type, recorded_at, payload) VALUES (?, ?, ?)',
    );
  }

  record(event: DomainEvent): Result<void> {
    const { type, ...domainFields } = event;
    const recordedAt = new Date().toISOString();
    const payload = JSON.stringify(domainFields);

    try {
      this.insertEvent.run(type, recordedAt, payload);
      return Result.ok();
    } catch (err) {
      return Result.fail(String(err));
    }
  }
}
