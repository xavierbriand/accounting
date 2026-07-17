Feature: Config-change detection & the ConfigChanged event (FR23, story-4.5a)

  Scenario: external edit is detected and recorded on the next ledger-opening command
    Given a migrated project with accounting.yaml containing buffer "Vacation" target 1500
    When the user edits the buffer "Vacation" target to 1800 in accounting.yaml and runs status
    Then the process exits with code 0
    And the audit trail holds one ConfigChanged event with origin "external"
    And the ConfigChanged diff names "Vacation.target" changing from "EUR 1500.00" to "EUR 1800.00"
    And running status again records no further ConfigChanged event
    # fails if: the observation helper isn't wired at command startup, the detector misses a
    # value change, or the new state isn't saved. Mechanism: subprocess (real binary, real
    # SQLite — R7).

  Scenario: a cosmetic edit produces no ConfigChanged event
    Given a migrated project with accounting.yaml containing buffer "Vacation" target 1500
    When the user reorders top-level keys and adds comments with no value change in accounting.yaml and runs status twice
    Then no ConfigChanged event is recorded on either run
    # fails if canonicalization is unstable (key order / formatting leaks into the digest).
    # Mechanism: subprocess.

  Scenario: a sensitive value in accounting.yaml trips the config parse tripwire
    Given accounting.yaml contains an IBAN-shaped string in a buffer account field
    When the user runs status
    Then the process exits with code 1
    And stderr contains "buffers.0.account"
    And no database file is created
    # fails if the tripwire refinement is missing from the config schema or doesn't cite the
    # path. Mechanism: subprocess. Sentinel value is the well-known synthetic example IBAN
    # (DE89370400440532013000) — no real bank data (QA § Privacy).
    # exit code 1 (not 2): config load failure is an existing, unchanged code path
    # (resolveDbPathForCommand's configResult.isFailure branch in program.ts) — this story
    # does not touch exit-code mapping (R31 n/a). See plan Deviations note: the plan assumed
    # this path was already exit 2; verified empirically it is exit 1.
