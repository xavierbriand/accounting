Feature: Safe monthly transfer calculator (Story 3.4)

  Scenario: forecast-only window with stable splits
    Given a transfer config with splits:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.6   |
      | 2024-01-01 | Sam     | 0.4   |
    And one recurring rule:
      | name    | category      | cadence | amount | validFrom  |
      | Netflix | Subscriptions | monthly | 12.99  | 2026-01-15 |
    And no buffer buckets
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-05-31"
    Then the result is success
    And totalRequired is 12.99 EUR
    And Alex contributes 7.79 EUR and Sam contributes 5.20 EUR
    And lineItems lists exactly:
      | kind     | date       | category      | gross     |
      | forecast | 2026-05-15 | Subscriptions | 12.99 EUR |
    # fails if forecast composition is wrong, allocation drifts (sum != gross), or partner names misalign with the split rules.

  Scenario: split rule changes mid-window — per-occurrence application
    Given a transfer config with splits:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.5   |
      | 2024-01-01 | Sam     | 0.5   |
      | 2026-05-15 | Alex    | 0.8   |
      | 2026-05-15 | Sam     | 0.2   |
    And one recurring rule:
      | name | category | cadence | amount | validFrom  |
      | Rent | Rent     | monthly | 1000   | 2024-01-01 |
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-06-30"
    Then the May 1 line item shows split 50/50: Alex 500 EUR, Sam 500 EUR
    And the June 1 line item shows split 80/20: Alex 800 EUR, Sam 200 EUR
    # fails if a single split is applied to all occurrences instead of per-occurrence lookup.

  Scenario: buffer top-up across a multi-month window
    Given a transfer config with splits:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.5   |
      | 2024-01-01 | Sam     | 0.5   |
    And one buffer:
      | name     | account                | target | targetDate | currentBalance |
      | Vacation | assets:buffer:vacation | 1200   | 2026-12-01 | 0              |
    And no recurring rules
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-08-31"
    Then totalRequired is exactly 685.72 EUR
    And Alex contributes 342.88 EUR and Sam contributes 342.84 EUR
    And lineItems contains exactly 4 buffer-topup entries dated 2026-05-01, 2026-06-01, 2026-07-01, 2026-08-01 each at 171.43 EUR gross
    # fails if monthsRemaining miscounts (should be 7: enumerateMonthStarts(2026-04-28, 2026-11-30) = [May 1..Nov 1]),
    # or LRM allocation drifts (sum of 7 fills = exactly 1200.00 EUR, first 4 = 685.72 EUR), or splits aren't applied per-month.

  Scenario: stale targetDate with shortfall fails the calculation
    Given a config with one buffer:
      | name | account           | target | targetDate | currentBalance |
      | Car  | assets:buffer:car | 500    | 2026-04-01 | 200            |
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-05-31"
    Then the result is failure
    And the error contains "Car" and "2026-04-01" and the phrase "set a new targetDate"
    # fails if the calculator silently produces zero or attempts to fill in one month when the deadline has passed.

  Scenario: buffer at or above target produces no line items even with a stale targetDate
    Given a config with one buffer:
      | name | account           | target | targetDate | currentBalance |
      | Car  | assets:buffer:car | 500    | 2026-04-01 | 600            |
    When I calculate for window asOf="2026-04-28" from="2026-05-01" to="2026-05-31"
    Then the result is success
    And totalRequired is 0 EUR
    And lineItems is empty
    # fails if the stale-targetDate check fires when no shortfall exists, or if over-funding generates negative line items.
