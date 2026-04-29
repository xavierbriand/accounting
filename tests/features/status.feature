Feature: accounting status CLI command (Story 3.5)

  Scenario: default JSON output composes buffers + transfer + forecast for next month
    Given a status config with splits Alex 0.6 Sam 0.4, buffer Vacation target 1200 balance 600 targetDate "2026-12-01", recurring Netflix monthly 12.99 EUR validFrom "2026-01-15"
    When I run the status command with --json --as-of 2026-04-29
    Then exit code is 0
    And stdout is valid JSON with keys asOf, window, buffers, transfer, forecast
    And asOf is "2026-04-29"
    And window.from is "2026-05-01" and window.to is "2026-05-31"
    And buffers has one entry with name "Vacation" and status "below"
    And transfer.totalRequired and transfer.perPartner.Alex and transfer.perPartner.Sam are present and non-empty
    And forecast contains one entry with date "2026-05-15" and name "Netflix"
    # fails if any required key is missing, the window is mis-computed, or the JSON shape drifts.

  Scenario: default human output renders three labeled sections with Conversational-CFO prose
    Given a status config with splits Alex 0.6 Sam 0.4, buffer Vacation target 1200 balance 600 targetDate "2026-12-01", recurring Netflix monthly 12.99 EUR validFrom "2026-01-15"
    When I run the status command with --as-of 2026-04-29
    Then exit code is 0
    And stdout contains "Buffers" and "Transfer" and "Forecast" section headers
    And stdout contains "Vacation" and "below" and "Netflix"
    And stdout contains the prose phrase "Total transfer for May 2026"
    And stdout contains "Alex" and "Sam" with their per-partner amounts
    # fails if a section is missing, the prose is template-empty, or status colors don't render.

  Scenario: --as-of injection makes the output deterministic
    Given a status config with splits Alex 0.6 Sam 0.4, buffer Vacation target 1200 balance 600 targetDate "2026-12-01", recurring Netflix monthly 12.99 EUR validFrom "2026-01-15"
    When I run the status command with --json --as-of 2026-04-29
    And I run the status command with --json --as-of 2026-04-29 again
    Then both invocations produce byte-identical stdout
    # fails if the CLI reads Date.now() despite --as-of being set.

  Scenario: --from / --to override the default window
    Given a status config with splits Alex 0.6 Sam 0.4, buffer Vacation target 1200 balance 600 targetDate "2026-12-01", recurring Netflix monthly 12.99 EUR validFrom "2026-01-15"
    When I run the status command with --json --as-of 2026-04-29 --from 2026-07-01 --to 2026-09-30
    Then exit code is 0
    And window.from is "2026-07-01" and window.to is "2026-09-30"
    And forecast contains entries on 2026-07-15, 2026-08-15, 2026-09-15
    # fails if --from / --to are ignored or if the calculator window is decoupled from the forecast window.

  Scenario: stale targetDate renders buffers and warns about the calc failure inline
    Given a status config with splits Alex 0.6 Sam 0.4, buffer Car target 500 balance 200 targetDate "2026-04-01" (stale), no recurring rules
    When I run the status command with --as-of 2026-04-29
    Then exit code is 0
    And stdout contains buffer table row for "Car" with status "below"
    And stdout contains "Suggested action" and references "Car" and "targetDate"
    And the transfer section does not contain "Total transfer for"
    # fails if the buffer table is suppressed by the calc error, or the suggested action doesn't name the bucket.

  Scenario: invalid --as-of format exits with code 2
    Given a minimal valid status config with one split and no buffers
    When I run the status command with --as-of not-a-date
    Then exit code is 2
    And stderr contains "must be ISO 8601" and "got"
    # fails if invalid input is accepted or surfaces as an unrecoverable runtime error (exit 1) instead of an input error (exit 2).
