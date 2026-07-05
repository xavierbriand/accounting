import type { Result } from '@core/shared/result.js';
import type { DomainEvent } from '@core/events/domain-event.js';

export interface DomainEventRecorder {
  record(event: DomainEvent): Result<void>;
}
