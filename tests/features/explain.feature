Feature: accounting explain CLI command (Story 4.3b)

  Scenario: Settle-ritual happy path, human output
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And a recurring rule "Insurance" in category "Insurance" for 200.00 EUR monthly valid from "2026-07-01"
    And settlement accounts:
      | account                   | partner |
      | income:contribution:alex | Alex    |
      | income:contribution:sam  | Sam     |
    And a credit of 480.00 EUR on "income:contribution:alex" occurred at "2026-06-15T10:00:00+00:00"
    And a credit of 460.00 EUR on "income:contribution:sam" occurred at "2026-06-16T10:00:00+00:00"
    When I run explain with --as-of "2026-06-28"
    Then the explain command exits with code 0
    And explain stdout contains the CFO headline mentioning "Your suggested transfer for July 2026"
    And explain stdout contains a "new" cause for "Insurance"
    And explain stdout contains per-partner columns "Alex" and "Sam"
    And explain stdout contains the follow-through line for "Alex" and "Sam"
    # fails if orchestration miswires the two calculator runs or the prose contradicts the table's numbers.

  Scenario: --json full shape is R8-diverse (all presences, negative delta, multi-partner, split boundary, envelope)
    Given split window Alex 60% and Sam 40% valid from "2024-01-01"
    And split window Alex 50% and Sam 50% valid from "2026-07-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And a recurring rule "Insurance" in category "Insurance" for 200.00 EUR monthly valid from "2026-07-01"
    And a buffer "Vacation" on account "assets:buffer:vacation" with target 1200.00 EUR and targetDate "2026-07-01"
    And the buffer ledger balance for "assets:buffer:vacation" is 0.00 EUR as of "2026-05-28" and 1200.00 EUR as of "2026-06-28"
    And settlement accounts:
      | account                   | partner |
      | income:contribution:alex | Alex    |
      | income:contribution:sam  | Sam     |
    And a credit of 580.00 EUR on "income:contribution:alex" occurred at "2026-06-15T10:00:00+00:00"
    And a credit of 380.00 EUR on "income:contribution:sam" occurred at "2026-06-16T10:00:00+00:00"
    When I run explain with --as-of "2026-06-28" and --json
    Then the explain command exits with code 0
    And the JSON envelope's command is "explain" and ok is true
    And explain stdout is valid JSON with keys asOf, thisWindow, lastWindow, variance, followThrough
    And explain stdout contains only JSON (no prose)
    And the JSON variance lines include presence classes "both", "this-only", and "last-only"
    And the JSON variance totalDelta is negative
    And the JSON variance perPartnerDelta has keys "Alex" and "Sam"
    And the JSON followThrough perPartner has keys "Alex" and "Sam"
    # fails if the formatter drops a presence class, serializes Maps as {}, or emits prose to stdout.

  Scenario: settlement: not configured — follow-through is tolerant, exit 0
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    When I run explain with --as-of "2026-06-28"
    Then the explain command exits with code 0
    And explain stdout contains the CFO headline mentioning "Your suggested transfer for July 2026"
    And explain follow-through says not configured with a Suggested action naming accounting.yaml and settlement:
    # fails if a missing optional settlement: section aborts the whole report.

  Scenario: first month — empty last window renders every cause as new, exit 0
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2026-07-01"
    And settlement accounts:
      | account                   | partner |
      | income:contribution:alex | Alex    |
      | income:contribution:sam  | Sam     |
    When I run explain with --as-of "2026-06-28" and --json
    Then the explain command exits with code 0
    And every variance line in the JSON has presence "this-only"
    And the JSON followThrough perPartner actual is 0.00 EUR for "Alex" and "Sam"
    # fails if an empty prior window is treated as an error or divides against zero.

  Scenario: invalid --as-of exits with code 2
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    When I run explain with --as-of "not-a-date"
    Then the explain command exits with code 2
    And explain stderr contains "must be ISO 8601" and "got"
    And explain stdout is empty
    # fails if invalid input is accepted or surfaces as an unrecoverable runtime error (exit 1) instead of an input error (exit 2).

  Scenario: a tolerated calculation failure still renders follow-through, exit 0
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a buffer "Vacation" on account "assets:buffer:vacation" with target 1000.00 EUR and targetDate "2026-01-01"
    And the buffer ledger balance for "assets:buffer:vacation" is 500.00 EUR as of "2026-05-28" and 1500.00 EUR as of "2026-06-28"
    And settlement accounts:
      | account                   | partner |
      | income:contribution:alex | Alex    |
      | income:contribution:sam  | Sam     |
    And a credit of 480.00 EUR on "income:contribution:alex" occurred at "2026-06-15T10:00:00+00:00"
    And a credit of 460.00 EUR on "income:contribution:sam" occurred at "2026-06-16T10:00:00+00:00"
    When I run explain with --as-of "2026-06-28"
    Then the explain command exits with code 0
    And explain stdout shows the variance calc error with a Suggested action naming "Vacation"
    And explain stdout contains the follow-through line for "Alex" and "Sam"
    # fails if one failing section suppresses the report or flips the exit code.

  Scenario: composition-root journey — migrate, ingest settlement credits, then explain --json
    Given a fresh temp dir with a migrated DB and accounting.yaml configured for settlement
    And the settlement CSV fixture has been ingested non-interactively
    When I run the explain binary with --as-of "2026-06-28" and --json
    Then the explain subprocess exits with code 0
    And the explain subprocess JSON output matches the documented shape
    And explain creates no snapshot and writes no rows (read-only guarantee)
    # fails if program.ts wiring (adapter, config mapping, clock) is broken.
