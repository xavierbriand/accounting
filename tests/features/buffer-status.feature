Feature: Buffer state reader (Story 3.2)

  Scenario: balances classify across below / on-target / above-cap
    Given a config with three buffers:
      | name  | account            | target | targetDate | cap   |
      | Car   | assets:buffer:car  | 1000   | 2099-12-31 |       |
      | House | assets:buffer:hous | 5000   | 2099-12-31 | 10000 |
      | Vac   | assets:buffer:vac  | 500    | 2099-12-31 | 1500  |
    And the ledger contains as of "2026-04-26":
      | account            | side   | amount |
      | assets:buffer:car  | debit  | 800    |
      | assets:buffer:hous | debit  | 6000   |
      | assets:buffer:vac  | debit  | 2000   |
    When I read buffer state as of "2026-04-26"
    Then the result is success
    And "Car" has balance 800.00 EUR and status "below"
    And "House" has balance 6000.00 EUR and status "on-target"
    And "Vac" has balance 2000.00 EUR and status "above-cap"
    # fails if status thresholds are inverted or formatting drifts.
    # Note: balance == target / balance == cap boundary inclusivity is covered by property test #2 (fast-check), not this scenario.

  Scenario: same-day ledger entry is included by asOf bound (substr-based compare)
    Given a config with one buffer "Car" mapped to "assets:buffer:car" target 1000
    And the ledger has a debit of 500 on "assets:buffer:car" at "2026-04-21T14:30:00+02:00"
    When I read buffer state as of "2026-04-21"
    Then "Car" has balance 500.00 EUR
    # fails if SQL uses raw lexicographic compare (would exclude same-day rows)

  Scenario: duplicate buffer-account mapping rejected at config parse
    Given a config where two buffers share the account "assets:buffer:shared"
    When the buffer config is parsed
    Then loading fails with an error containing "buffers.1.account: duplicate account"
    # fails if superRefine missing or path not cited. Message format mirrors the existing duplicate-name precedent.

  Scenario: currency mismatch on a buffer account fails the read
    Given a config with default currency EUR and buffer "Car" on "assets:buffer:car"
    And the ledger has a USD entry on "assets:buffer:car"
    When I read buffer state as of "2026-04-26"
    Then the result is failure
    And the error cites "assets:buffer:car" and "USD"
    # fails if adapter silently coerces or service masks the mismatch
