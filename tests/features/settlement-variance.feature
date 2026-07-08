Feature: Settlement variance (Story 4.3a)

  Scenario: Matched, appeared, and disappeared causes
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And a recurring rule "Insurance" in category "Insurance" for 200.00 EUR monthly valid from "2026-07-01"
    And a buffer "Vacation" on account "assets:buffer:vacation" with target 1200.00 EUR and targetDate "2026-07-01"
    And the buffer ledger balance for "assets:buffer:vacation" is 0.00 EUR as of "2026-05-28" and 1200.00 EUR as of "2026-06-28"
    When I explain the settlement variance for asOf "2026-06-28"
    Then the result is success
    And the variance lines are:
      | kind         | category  | description     | presence  | totalDelta |
      | buffer-topup | Vacation  | Vacation top-up | last-only | -1200.00   |
      | forecast     | Insurance | Insurance       | this-only | 200.00     |
      | forecast     | Rent      | Rent            | both      | 0.00       |
    # fails if the LineItemKey diff or presence classification in explainSettlementVariance is broken

  Scenario: Penny-perfect totals across a split boundary
    Given split window Alex 60% and Sam 40% valid from "2024-01-01"
    And split window Alex 50% and Sam 50% valid from "2026-07-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    When I explain the settlement variance for asOf "2026-06-28"
    Then the result is success
    And sum of line totalDeltas equals thisTotal minus lastTotal
    And each partner's line-delta sum equals their headline delta
    # fails if per-partner deltas are computed by applying one ratio to the net delta instead of diffing each month's allocations

  Scenario: Buffer top-up movement
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a buffer "Car" on account "assets:buffer:car" with target 1200.00 EUR and targetDate "2026-09-01"
    And the buffer ledger balance for "assets:buffer:car" is 800.00 EUR as of "2026-05-28" and 700.00 EUR as of "2026-06-28"
    When I explain the settlement variance for asOf "2026-06-28"
    Then the result is success
    And the line for kind "buffer-topup" category "Car" description "Car top-up" has presence "both" and totalDelta 116.66 EUR
    # fails if buffer-topup line items are excluded from the key diff, or both runs receive the same asOf

  Scenario: Follow-through, per-partner
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And settlement accounts:
      | account                   | partner |
      | income:contribution:alex | Alex    |
      | income:contribution:sam  | Sam     |
    And a credit of 480.00 EUR on "income:contribution:alex" occurred at "2026-06-15T10:00:00+00:00"
    And a credit of 460.00 EUR on "income:contribution:sam" occurred at "2026-06-16T10:00:00+00:00"
    When I explain the settlement variance for asOf "2026-06-28" using the real contributions query
    Then the result is success
    And follow-through attribution is "per-partner"
    And follow-through for "Alex" has suggested 500.00 EUR, actual 480.00 EUR, and delta 20.00 EUR
    And follow-through for "Sam" has suggested 500.00 EUR, actual 460.00 EUR, and delta 40.00 EUR
    # fails if the adapter's account→partner mapping or the service's delta arithmetic is wrong, or the baseline uses the wrong month's suggestion

  Scenario: Follow-through, totals-only fallback
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And settlement accounts:
      | account                       | partner |
      | income:contribution:alex     | Alex    |
      | income:contribution:unmapped |         |
    And a credit of 480.00 EUR on "income:contribution:alex" occurred at "2026-06-15T10:00:00+00:00"
    And a credit of 50.00 EUR on "income:contribution:unmapped" occurred at "2026-06-20T10:00:00+00:00"
    When I explain the settlement variance for asOf "2026-06-28" using the real contributions query
    Then the result is success
    And follow-through attribution is "totals-only"
    And follow-through totalActual is 530.00 EUR
    # fails if unattributed credits are dropped (invariant 8) or per-partner mode is claimed with incomplete attribution (invariant 7)

  Scenario: Corrections net out of actuals
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And settlement accounts:
      | account                   | partner |
      | income:contribution:alex | Alex    |
    And a credit of 500.00 EUR on "income:contribution:alex" occurred at "2026-06-10T10:00:00+00:00"
    And that credit is corrected to 450.00 EUR occurred at "2026-06-12T10:00:00+00:00"
    When I explain the settlement variance for asOf "2026-06-28" using the real contributions query
    Then the result is success
    And follow-through totalActual is 450.00 EUR
    # fails if SqliteContributionQuery sums only credit-side entries instead of net credits−debits

  Scenario: Currency mismatch fails
    Given split window Alex 50% and Sam 50% valid from "2024-01-01"
    And a recurring rule "Rent" in category "Rent" for 1000.00 EUR monthly valid from "2024-01-01"
    And a hand-built contribution of 500.00 USD attributed to "Alex"
    When I explain the settlement variance for asOf "2026-06-28"
    Then the result is failure
    # fails if cross-currency values are silently mixed

  Scenario: Config settlement section validated
    Given an accounting config with splits Alex and Sam
    And a settlement section naming partner "Charlie" absent from the splits roster
    When the config is parsed
    Then config parsing fails with an error containing "settlement"
    Given a settlement section listing the account "income:contribution:alex" twice
    When the config is parsed
    Then config parsing fails with an error containing "duplicate account"
    # fails if the zod schema accepts an unknown partner, a duplicate account, or leaks names
