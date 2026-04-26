/**
 * Unit tests for assertMigrated hint string — verifies #65 fix (story-maint-11).
 *
 * fails if: the hint still reads "run 'accounting migrate --db-path ...' first"
 *   (old behaviour), instead of the new YAML-authoritative form
 *   "run 'accounting migrate' first (or set dbPath in accounting.yaml)".
 *   The old hint misleads users by suggesting --db-path is the primary workflow;
 *   after #65, YAML dbPath is authoritative and --db-path-override is for recovery only.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { assertMigrated } from '../../../../src/infra/db/migration-check.js';

describe('assertMigrated — hint string (story-maint-11)', () => {
  it('hint does not reference --db-path flag (YAML is authoritative after #65)', () => {
    // fails if: hint still says "run 'accounting migrate --db-path <path>' first"
    //   (references the renamed/removed flag); the new hint should guide users to
    //   'accounting migrate' (YAML-driven) not a flag-based invocation.
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const result = assertMigrated(db, '/tmp/test.db');
    db.close();

    expect(result.isFailure).toBe(true);
    expect(result.error).not.toContain('--db-path');
    expect(result.error).toContain('accounting.yaml');
  });
});
