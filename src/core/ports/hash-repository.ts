import type { Result } from '@core/shared/result.js';

export interface HashRepository {
  listKnownHashes(candidateHashes: readonly string[]): Result<ReadonlySet<string>>;
}
