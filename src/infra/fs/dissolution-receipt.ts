import type { DissolutionPerformed } from '@core/events/domain-event.js';

// The small local file that survives a dissolve (model note § Terms — "Dissolution
// receipt"): DissolutionPerformed plus enough context to say what happened and
// where the history went, once the DB it would normally live in is gone.
export interface DissolutionReceipt {
  readonly schemaVersion: number;
  readonly recordedAt: string;
  readonly event: DissolutionPerformed;
  readonly archivePath: string;
}
