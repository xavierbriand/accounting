Feature: Ingest CLI atomically commits and snapshots

  Scenario: Atomic commit writes all rows, snapshot removed on success (Story 2.5a)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run ingest interactively with auto-confirm
    Then the process exits with code 0
    And the DB holds 5 transactions
    And no snapshot file exists after success
    And stderr contains "transaction(s) committed"
    # fails if: snapshot lifecycle leaks (file retained after success), partial commit
    # leaves <5 rows, or runIngestCommand's commitBatch coordination breaks. Note: this
    # scenario uses in-process invocation (Inquirer requires TTY for piped stdin); the
    # composition-root wiring (program.ts → runIngestCommand) is covered by maint-09's
    # ingest-end-to-end-wiring.test.ts and ingest.feature scenario 2.1.

  Scenario: Mid-batch failure rolls back, snapshot retained (Story 2.5b)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run ingest interactively and the database commit fails
    Then the process exits with code 4
    And the DB holds 0 transactions
    And a snapshot file exists after failure
    And stderr contains "Commit failed (batch rolled back)"
    And stderr contains "Snapshot retained at"
    And stderr contains no raw idempotency hash (no 64-char hex token)
    # fails if: rollback is partial (some rows persisted), snapshot removed instead of
    # retained, or the raw SQL UNIQUE-violation error is leaked verbatim including the
    # colliding hash (security-checklist.md: hash is PII-adjacent fingerprint). Note:
    # uses an injected failing repo to simulate a UNIQUE constraint, since pre-saveBatch
    # idempotency filtering would intercept a real DB-level collision.
