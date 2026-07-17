Feature: Dissolution act 2 — the proof-gated wipe (FR21, story-4.5c)

  Scenario: proof-gated dissolution, receipt left behind
    Given a migrated project with data and a fresh export bundle
    And a stray backup file planted next to the database
    When the user runs dissolve against that bundle with --confirm and --json
    Then the process exits with code 0
    And the database file and the planted backup file are gone
    And accounting.yaml remains byte-identical
    And a dissolution receipt exists beside accounting.yaml with mode 0600
    And the receipt's event manifestHash equals the bundle's manifest hash and its archiveLocation is the bundle directory name
    And the envelope's data.wipedStores enumerates both deleted files
    # fails if: the wipe runs without verification, the receipt is written after (or not at
    # all), or the partition (invariant 10) is violated.
    # Mechanism: subprocess.

  Scenario: tampered bundle refused, nothing touched
    Given a migrated project with data and a fresh export bundle
    And one byte appended to the bundle's transactions.csv
    When the user runs dissolve against that bundle with --confirm and --json
    Then the process exits with code 2
    And the final stderr line parses as an INVALID_ARGUMENT envelope naming the failed verification
    And the database and accounting.yaml are untouched and no receipt exists
    # fails if: per-file hash verification is skipped or a refusal still mutates anything.
    # Mechanism: subprocess.

  Scenario: stale bundle refused with a re-export suggestion
    Given a migrated project with data and a fresh export bundle
    And one more transaction ingested after the export
    When the user runs dissolve against that bundle with --confirm and --json
    Then the process exits with code 2
    And the final stderr line's message names the export-proof as stale and suggests running export again
    And the database and accounting.yaml are untouched and no receipt exists
    # fails if: the staleness comparison (live counts vs manifest counts) is missing.
    # Mechanism: subprocess.
