Feature: Define autotag rules from a CSV before ingest (categorize command)

  Scenario: scripted run appends two rules for the two recurring merchants
    Given a fresh accounting.yaml with no autoTagRules entry in a temp dir
    And a BPCE CSV with three rows for "ALTIMA COURTAGE 9876" and four rows for "UBER FRANCE"
    When I run categorize with a script defining AutoInsurance for ALTIMA and Transport for UBER
    Then the process exits with code 0
    And accounting.yaml on disk contains "AutoInsurance"
    And accounting.yaml on disk contains "altima"
    And accounting.yaml on disk contains "Transport"
    And accounting.yaml on disk contains "uber"
    And no .db file exists in the temp dir
    # fails if categorize touches SQLite, mis-orders the writer call, or duplicates Story C's
    # confirmRememberRule UX (guards composition root + Core/Infra boundary in program.ts).

  Scenario: descriptions already covered by an existing rule are silently skipped
    Given an accounting.yaml whose autoTagRules.Transport.patterns include "uber" in a temp dir
    And a BPCE CSV with three rows for "UBER FRANCE" and three rows for "ALTIMA COURTAGE"
    When I run categorize with a script only for the ALTIMA group
    Then the process exits with code 0
    And the script is fully consumed without errors
    # fails if the scanner re-prompts on already-matching descriptions
    # (guards the existing-rule filter in scanForUnmatched).

  Scenario: all descriptions already covered — no YAML write, exit 0
    Given an accounting.yaml whose autoTagRules cover "uber" and "altima" in a temp dir
    And a BPCE CSV with two rows for "UBER FRANCE" and two rows for "ALTIMA COURTAGE"
    When I run categorize without scripted prompts
    Then the process exits with code 0
    And stderr contains "0 rules added"
    And accounting.yaml is unchanged
    # fails if categorize writes YAML when the buffer is empty, or prompts the user when
    # there is nothing to teach (guards the all-matched short-circuit in steps 4 + 7).

  Scenario: --min-count default of 2 hides one-off merchants
    Given a fresh accounting.yaml with no autoTagRules entry in a temp dir
    And a BPCE CSV with one row for "ONE-OFF SHOP" and three rows for "RECURRING MERCHANT"
    When I run categorize with a script only for the RECURRING MERCHANT group
    Then the process exits with code 0
    And the script is fully consumed without errors
    # fails if the one-off appears in the prompt sequence (guards default ranking + min-count).
