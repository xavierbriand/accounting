Feature: Ingest CLI atomically commits and snapshots

  Scenario: Atomic commit writes all rows, snapshot removed on success (Story 2.5a)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run ingest interactively with auto-confirm
    Then the process exits with code 0
    And the DB holds 5 transactions
    And no snapshot file exists after success
    And stderr contains "transaction(s) committed"
    # fails if: snapshot lifecycle leaks (file retained after success), or partial commit
    # leaves <5 rows, or the interactive prompter wiring (selectCategory + confirmBatch)
    # does not reach commitBatch.

  Scenario: Mid-batch failure rolls back, snapshot retained (Story 2.5b)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run ingest interactively with auto-confirm and a failing repo
    Then the process exits with code 4
    And the DB holds 0 transactions
    And a snapshot file exists after failure
    And stderr contains "Commit failed (batch rolled back)"
    And stderr contains "Snapshot retained at"
    And stderr contains no raw idempotency hash (no 64-char hex token)
    # fails if: rollback is partial (some rows persisted), snapshot removed instead of
    # retained, or the raw SQL UNIQUE-violation error is leaked verbatim including the
    # colliding hash (security-checklist.md: hash is PII-adjacent fingerprint).
    # The failing repo simulates a UNIQUE constraint on idempotency_hash — the same
    # error the real SQL path would produce — without requiring DB-level collision setup
    # (which would be filtered by the idempotency check before reaching saveBatch).
