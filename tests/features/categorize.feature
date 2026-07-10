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
    When I run categorize with an empty scripted-prompts script
    Then the process exits with code 0
    And stderr contains "0 rules added"
    And accounting.yaml is unchanged
    And the prompter is never invoked
    # fails if categorize writes YAML when the buffer is empty, or prompts the user when
    # there is nothing to teach (guards the all-matched short-circuit in steps 4 + 7).
    # "the prompter is never invoked" flips if the scanner fails to filter all-matched
    # descriptions — any prompt call against the empty script throws
    # "ScriptedPrompter: expected next entry".

  Scenario: --min-count default of 2 hides one-off merchants
    Given a fresh accounting.yaml with no autoTagRules entry in a temp dir
    And a BPCE CSV with one row for "ONE-OFF SHOP" and three rows for "RECURRING MERCHANT"
    When I run categorize with a script only for the RECURRING MERCHANT group
    Then the process exits with code 0
    And the script is fully consumed without errors
    # fails if the one-off appears in the prompt sequence (guards default ranking + min-count).

  Scenario: --non-interactive errors when groups need review and writes nothing
    Given a fresh accounting.yaml with no autoTagRules entry in a temp dir
    And a BPCE CSV with two rows for "RECURRING A" and two rows for "RECURRING B"
    When I run categorize with --non-interactive
    Then the process exits with code 2
    And stderr contains "2 group(s) need review"
    And accounting.yaml is byte-identical to the original
    # fails if --non-interactive silently writes or exits 0 (guards CI mode invariant).

  Scenario: --non-interactive + --json errors with a NEEDS_REVIEW envelope (story-4.4b newly-reachable path)
    Given a fresh accounting.yaml with no autoTagRules entry in a temp dir
    And a BPCE CSV with two rows for "RECURRING A" and two rows for "RECURRING B"
    When I run categorize with --non-interactive and --json
    Then the process exits with code 2
    And stdout is empty
    And the final categorize stderr line parses as a NEEDS_REVIEW envelope
    And accounting.yaml is byte-identical to the original
    # fails if the pending-groups guard stays prose-only instead of also emitting the
    # coded envelope under --json (was: prose only).

  Scenario: --json summary shape with multiple rules and a user-skipped group
    Given a fresh accounting.yaml with no autoTagRules entry in a temp dir
    And a BPCE CSV with three distinct recurring merchants
    When I run categorize with --json and a script that remembers two rules and skips the third
    Then the process exits with code 0
    And the JSON envelope's command is "categorize" and ok is true
    And stdout is valid JSON
    And the JSON summary.candidateGroups equals 3
    And the JSON summary.rulesAdded equals 2
    And the JSON summary.rulesSkippedByUser equals 1
    And the JSON rules array has 2 entries
    And the JSON summary does not include a "rulesSkippedAsDuplicate" key
    # fails if the JSON shape regresses or collapses pluralisation (guards machine contract +
    # R8 mock-diversity invariant — non-default fixture exercises rulesSkippedByUser > 0
    # and a multi-rule rules array). story-4.4b finding 9: the hardcoded-always-0
    # rulesSkippedAsDuplicate field is dropped.

  Scenario: --json with zero candidate groups emits a success envelope on stdout (story-4.4b finding 4)
    Given an accounting.yaml whose autoTagRules cover "uber" and "altima" in a temp dir
    And a BPCE CSV with two rows for "UBER FRANCE" and two rows for "ALTIMA COURTAGE"
    When I run categorize with --json and an empty scripted-prompts script
    Then the process exits with code 0
    And the JSON envelope's command is "categorize" and ok is true
    And the JSON summary.candidateGroups equals 0
    # fails if the zero-groups guard returns before writing stdout under --json (was:
    # nothing written even with --json).
