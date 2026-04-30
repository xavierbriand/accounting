Feature: Ingest CLI builds and reviews transactions from bank CSVs

  Scenario: BPCE CSV with valid encoding parses all rows (Story 2.1)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run ingest with "--non-interactive --json"
    Then the process exits with code 2
    And stderr contains "Found 5 new transactions"
    And stderr contains no "ERR_MODULE_NOT_FOUND" or "Cannot find module" lines
    And stderr contains no "Build failed" lines
    # fails if: BPCE parser regresses on the fixture's encoding/delimiter, or
    # dist/cli/program.js cannot resolve @core/* (ERR_MODULE_NOT_FOUND), or
    # --non-interactive routing semantics regress (exit 2 = low-confidence rows present).

  Scenario: Re-ingest of the same CSV is idempotent (Story 2.2, FR8)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    And the CSV has been committed interactively
    When I run ingest with "--non-interactive --json"
    Then the process exits with code 0
    And stderr contains "Found 0 new transactions"
    And stderr contains "5 duplicate(s) skipped"
    # fails if: idempotency_hash dedup is bypassed (would re-insert), or the
    # "Found 0 new" / "5 duplicate(s)" messaging regresses on a no-op batch.

  Scenario: Auto-tagging routes high-confidence and isolates low-confidence (Story 2.3)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run ingest with "--non-interactive --json"
    Then the process exits with code 2
    And the JSON payload's "summary.autoTagged" equals 2
    And the JSON payload's "summary.lowConfidence" equals 3
    # fails if: classifier mis-routes high-confidence as low-confidence (or vice
    # versa), or --non-interactive does not exit 2 on a non-zero low-confidence count.

  Scenario: --json output includes non-default duplicate and low-confidence sections (Story 2.4 mock-diversity)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    And the CSV has been committed interactively
    When I run ingest with "--non-interactive --json"
    Then the process exits with code 0
    And the JSON payload's "duplicates" array length equals 5
    And the JSON payload's "duplicates[0]" has "description" and "idempotencyHash" fields populated
    And the JSON payload's "lowConfidence" array is empty
    And the JSON payload contains no partner names verbatim
    # fails if: --json output hardcodes duplicates: [] or omits the array entirely.
    # Story 2.4 retro action A: mock-diversity check — assertions run against a
    # non-default fixture (5 duplicates, not 0).

  Scenario: dbPath in accounting.yaml is honoured (closes #65) (story-maint-11)
    Given a fresh tmp dir
    And an accounting.yaml at tmp dir with dbPath: "./ledger.db"
    When I run migrate with no --db-path-override
    Then the migration creates the file at "ledger.db"
    And no file exists at "accounting.db"
    # fails if: program.ts uses the hardcoded 'accounting.db' default instead of
    # config.dbPath, leaving ledger.db non-existent and accounting.db populated.

  Scenario: --db-path-override warns and overrides YAML dbPath (story-maint-11)
    Given a fresh tmp dir
    And an accounting.yaml at tmp dir with dbPath: "./ledger.db"
    When I run migrate with --db-path-override "recovery.db"
    Then the migration creates the file at "recovery.db"
    And no file exists at "ledger.db"
    And stderr contains "[warning]"
    And stderr contains "--db-path-override is set"
    # fails if: --db-path-override is silently honoured (no warn), or the rename
    # didn't propagate (CLI parses old --db-path), or YAML dbPath wins over the override.

  Scenario: Ingest commits a CSV that contains in-batch hash duplicates (story-maint-17)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-in-batch-dups.csv"
    And the CSV has been committed interactively
    When I run ingest with "--non-interactive --json"
    Then the process exits with code 0
    And stderr contains "Found 0 new transactions"
    # fails if: filterNew emits two fresh items with the same idempotencyHash, causing
    # saveBatch to trip the UNIQUE index on transactions.idempotency_hash and roll back
    # the entire batch (sqlite-transaction-repo.ts:64-91); a rolled-back batch leaves the
    # DB empty so the subsequent re-ingest sees all 4 rows as fresh instead of 0.

  Scenario: Define-new + remember + re-ingest auto-tags (Story C round-trip — closes Story A retro carry-over)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a single-row CSV at "bpce-valid_first.csv" with description "ALTIMA COURTAGE"
    When I run scripted ingest with category "AutoInsurance" and remembered pattern "altima" on "bpce-valid_first.csv"
    Then the process exits with code 0
    And the accounting.yaml on disk contains "AutoInsurance"
    And the accounting.yaml on disk contains "altima"
    When I run a fresh ingest with "--non-interactive --json" on a single-row CSV at "bpce-valid_second.csv" with description "ALTIMA SOLO 2026"
    Then the process exits with code 0
    And stderr contains "Found 1 new transactions — 1 auto-tagged"
    # fails if: the YAML write doesn't persist the appended rule across processes,
    # or the next ingest doesn't reload autoTagRules from YAML, or the rule-match
    # against "ALTIMA SOLO 2026" doesn't reach high-confidence (would exit 2).
    # Closes Story A retro carry-over: end-to-end define-new + auto-tag interaction.
