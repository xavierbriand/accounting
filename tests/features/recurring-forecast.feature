Feature: Recurring cost forecast (Story 3.3)

  Scenario: monthly forecast — window upper bound exactly matches an occurrence
    Given a config with one recurring rule:
      | name    | category      | cadence | amount | validFrom  |
      | Netflix | Subscriptions | monthly | 12.99  | 2026-01-15 |
    When I forecast between "2026-03-01" and "2026-05-15"
    Then the result is success
    And the forecast lists exactly:
      | name    | expectedDate | amount     |
      | Netflix | 2026-03-15   | 12.99 EUR  |
      | Netflix | 2026-04-15   | 12.99 EUR  |
      | Netflix | 2026-05-15   | 12.99 EUR  |
    # fails if cadence stepping is wrong, the closed-interval `to` boundary is exclusive (May 15 row missing), or sort order drifts.

  Scenario: amendments shift amount mid-window
    Given a config with one recurring rule:
      | name | category | cadence | amount | validFrom  |
      | Rent | Rent     | monthly | 1000   | 2024-01-01 |
    And rule "Rent" has amendments:
      | validFrom  | amount |
      | 2026-07-01 | 1050   |
    When I forecast between "2026-05-01" and "2026-09-30"
    Then the forecast lists exactly:
      | name | expectedDate | amount      |
      | Rent | 2026-05-01   | 1000.00 EUR |
      | Rent | 2026-06-01   | 1000.00 EUR |
      | Rent | 2026-07-01   | 1050.00 EUR |
      | Rent | 2026-08-01   | 1050.00 EUR |
      | Rent | 2026-09-01   | 1050.00 EUR |
    # fails if amendment selection picks the wrong tier on the boundary, or applies amendments before validFrom.

  Scenario: validTo expires the rule mid-window
    Given a config with one recurring rule:
      | name      | category      | cadence | amount | validFrom  | validTo    |
      | OldStream | Subscriptions | monthly | 9.99   | 2025-03-15 | 2026-08-15 |
    When I forecast between "2026-06-01" and "2026-10-31"
    Then the forecast lists exactly:
      | name      | expectedDate | amount    |
      | OldStream | 2026-06-15   | 9.99 EUR  |
      | OldStream | 2026-07-15   | 9.99 EUR  |
      | OldStream | 2026-08-15   | 9.99 EUR  |
    # fails if validTo is treated as exclusive (Aug-15 row missing) or ignored entirely (Sep-15 / Oct-15 leaking in).

  Scenario: quarterly cadence
    Given a config with one recurring rule:
      | name     | category  | cadence   | amount | validFrom  |
      | CarInsur | Insurance | quarterly | 250    | 2026-01-15 |
    When I forecast between "2026-01-01" and "2026-12-31"
    Then the forecast lists expectedDates "2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15" each at 250.00 EUR
    # fails if quarterly stepping is wrong (e.g., +3 days instead of +3 months).

  Scenario: annual cadence with Feb-29 leap-year clamp
    Given a config with one recurring rule:
      | name   | category | cadence | amount | validFrom  |
      | Domain | Hosting  | annual  | 15     | 2024-02-29 |
    When I forecast between "2025-01-01" and "2028-12-31"
    Then the forecast lists expectedDates "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29" each at 15.00 EUR
    # fails if DoM overflow rebounds (e.g., 2025-02-28 -> 2026-03-01) or fails to recover Feb-29 in the next leap year.

  Scenario: invalid YAML rejected at parse with a path-cited error
    Given a config where the second recurring rule has cadence "fortnightly"
    When the recurring config is parsed
    Then loading fails with an error containing "recurring.1.cadence"
    # fails if the cadence enum is missing, or the path-citation drops the index.
    # NB: step renamed from `When the configuration is loaded` to avoid quickpickle ambiguity collision with split-rules.steps.ts (mirrors Story 3.2 buffer-status step rename).
