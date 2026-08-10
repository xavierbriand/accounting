import { vi } from 'vitest';
import { Result } from '@core/shared/result.js';
import type { ConfigWriter } from '@core/ports/config-writer.js';
import type { SnapshotService } from '@core/ports/snapshot-service.js';
import type { TransactionRepository } from '@core/ports/transaction-repository.js';
import type { DomainEventRecorder } from '@core/ports/domain-event-recorder.js';

export function makeNoOpTransactionRepo(): Pick<TransactionRepository, 'saveBatch'> {
  return {
    saveBatch: vi.fn().mockReturnValue(Result.ok({ written: 0 })),
  };
}

export function makeNoOpConfigWriter(): ConfigWriter {
  return { appendAutoTagRules: vi.fn().mockResolvedValue(Result.ok()) };
}

export function makeNoOpSnapshotService(): SnapshotService {
  return {
    create: vi.fn().mockResolvedValue(Result.ok()),
    restore: vi.fn().mockResolvedValue(Result.ok()),
    remove: vi.fn().mockResolvedValue(Result.ok()),
  };
}

export function makeNoOpDomainEventRecorder(): DomainEventRecorder {
  return { record: vi.fn().mockReturnValue(Result.ok()) };
}
