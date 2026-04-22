import Database from 'better-sqlite3';
import { Result } from '@core/shared/result.js';
import type { HashRepository } from '@core/ports/hash-repository.js';

// SQLite's minimum guaranteed variable limit across all builds.
// Modern better-sqlite3 supports 32766, but we cap defensively at the floor.
// A future story can lift this cap and add chunking if batch sizes grow.
const MAX_CANDIDATES = 999;

export class SqliteHashRepository implements HashRepository {
  constructor(private readonly db: Database.Database) {}

  listKnownHashes(candidateHashes: readonly string[]): Result<ReadonlySet<string>> {
    if (candidateHashes.length === 0) {
      return Result.ok(new Set<string>());
    }

    if (candidateHashes.length > MAX_CANDIDATES) {
      return Result.fail(
        `listKnownHashes: candidate count ${candidateHashes.length} exceeds the ` +
          `999-variable SQLite limit. Split the batch into chunks of ≤ 999.`,
      );
    }

    const placeholders = candidateHashes.map(() => '?').join(', ');
    const rows = this.db
      .prepare<string[], { idempotency_hash: string }>(
        `SELECT idempotency_hash FROM transactions WHERE idempotency_hash IN (${placeholders})`,
      )
      .all(...(candidateHashes as string[]));

    const known = new Set(rows.map((r) => r.idempotency_hash));
    return Result.ok(known);
  }
}
