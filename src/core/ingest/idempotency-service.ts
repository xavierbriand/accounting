import type { IngestItem, FreshIngestItem, DuplicateIngestItem, IdempotencyOutcome } from './types.js';
import type { HashFn } from '@core/ports/hash-fn.js';
import type { HashRepository } from '@core/ports/hash-repository.js';
import { Result } from '@core/shared/result.js';
import { canonicalize, US } from './canonicalize.js';

export class IdempotencyService {
  constructor(
    private readonly hash: HashFn,
    private readonly repo: HashRepository,
  ) {}

  filterNew(items: readonly IngestItem[]): Result<IdempotencyOutcome> {
    if (items.length === 0) {
      return Result.ok({ fresh: [], duplicates: [] });
    }

    // US is the field separator already used by canonicalize() to join the six fields
    // (sourceAccount, occurredAt, direction, amount.cents, currency, description).
    // A non-disambiguated canonical contains exactly 5 US bytes; a disambiguated one
    // contains 6, so the two sets are disjoint — no pre-existing hash can collide with
    // a disambiguated hash. First occurrence keeps the legacy (unmodified) canonical so
    // every already-committed row's hash is unchanged; no migration is needed.
    //
    // Limitation: if a future ingest reorders or splits the same logical rows across
    // batches, sequence assignment may differ — the engine will then treat 2nd-and-later
    // occurrences as fresh. Not a regression (the old code could not commit them at all).
    const hashes: string[] = [];
    const seqByCanon = new Map<string, number>();
    for (const item of items) {
      const canonResult = canonicalize(item);
      if (canonResult.isFailure) {
        return Result.fail(canonResult.error);
      }
      const canon = canonResult.value;
      const seq = (seqByCanon.get(canon) ?? 0) + 1;
      seqByCanon.set(canon, seq);
      const keyed = seq === 1 ? canon : `${canon}${US}#${seq}`;
      hashes.push(this.hash(keyed));
    }

    return this.repo.listKnownHashes(hashes).flatMap((known) => {
      const fresh: FreshIngestItem[] = [];
      const duplicates: DuplicateIngestItem[] = [];
      for (let i = 0; i < items.length; i++) {
        if (known.has(hashes[i])) {
          duplicates.push({ item: items[i], idempotencyHash: hashes[i] });
        } else {
          fresh.push({ item: items[i], idempotencyHash: hashes[i] });
        }
      }
      return Result.ok({ fresh, duplicates });
    });
  }
}
