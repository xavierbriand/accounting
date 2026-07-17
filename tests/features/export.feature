Feature: Export bundle (FR21, story-4.5b)

  Scenario: export produces a self-describing bundle with a printed proof
    Given a migrated project with ingested transactions and prior audit events
    When the user runs export with an out directory
    Then the process exits with code 0
    And the bundle directory contains "transactions.csv", "transaction-entries.csv", "domain-events.json", "accounting.yaml", and "manifest.json"
    And every file named in the manifest has a matching SHA-256 checksum
    And stdout prints the bundle location and the manifest's SHA-256 as the export-proof
    And the audit trail holds one DataExported event whose archiveLocation is the bundle directory name with no path separators
    And that same DataExported event appears inside the bundle's domain-events.json
    And the manifest's counts and the event's exported counts are equal and match the actual row counts in the bundle
    And running export again with json output against a fresh out directory exits 0 with non-zero exported counts in the envelope
    # fails if: the record→write ordering is flipped (event missing from its own bundle), the
    # manifest hashes don't verify, counts drift from contents, or archiveLocation leaks a path.
    # Mechanism: subprocess.

  Scenario: bundle fidelity round-trip
    Given a migrated project with ingested transactions including hostile description text
    When the user runs export with an out directory
    Then parsing the bundle's transactions.csv and transaction-entries.csv with the project's own CSV parser reproduces the DB's rows, including the idempotency_hash column
    And the bundle's domain-events.json matches the domain_events table row for row
    # fails if the exporter's serialization drops rows or mangles fields (commas/quotes/newlines
    # in descriptions are the fixture). Mechanism: subprocess.

  Scenario: failed export leaves nothing plausible behind
    Given a migrated project with ingested transactions and prior audit events
    And an out directory that cannot be written
    When the user runs export with json output against that out directory
    Then the process exits with code 1
    And the final stderr line parses as a WRITE_FAILURE envelope
    And no bundle directory and no partial remnant exist under the out directory
    # fails if a half-written directory survives (a plausible-but-incomplete "bundle") or the
    # envelope is missing. Mechanism: subprocess.
