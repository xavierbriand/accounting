import type { IngestItem, IdempotencyOutcome } from './types.js';
import type { HashFn } from '@core/ports/hash-fn.js';
import type { HashRepository } from '@core/ports/hash-repository.js';
import { Result } from '@core/shared/result.js';
import { canonicalize } from './canonicalize.js';

export class IdempotencyService {
  constructor(
    private readonly hash: HashFn,
    private readonly repo: HashRepository,
  ) {}

  filterNew(items: readonly IngestItem[]): Result<IdempotencyOutcome> {
    if (items.length === 0) {
      return Result.ok({ fresh: [], duplicates: [] });
    }

    const hashes: string[] = [];
    for (const item of items) {
      const canonResult = canonicalize(item);
      if (canonResult.isFailure) {
        return Result.fail(canonResult.error);
      }
      hashes.push(this.hash(canonResult.value));
    }

    const knownResult = this.repo.listKnownHashes(hashes);
    if (knownResult.isFailure) {
      return Result.fail(knownResult.error);
    }
    const known = knownResult.value;

    const fresh: IngestItem[] = [];
    const duplicates: IngestItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (known.has(hashes[i])) {
        duplicates.push(items[i]);
      } else {
        fresh.push(items[i]);
      }
    }

    return Result.ok({ fresh, duplicates });
  }
}
