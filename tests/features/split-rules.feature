Feature: Versioned split rules (Story 3.1)

  Scenario: active ratios resolve to the latest window whose validFrom <= date
    Given a config with two split windows:
      | validFrom  | partner | ratio |
      | 2024-01-01 | Alex    | 0.5   |
      | 2024-01-01 | Sam     | 0.5   |
      | 2026-03-15 | Alex    | 0.6   |
      | 2026-03-15 | Sam     | 0.4   |
    When I look up the active splits as of "2026-04-20"
    Then the active ratios are Alex 0.6 and Sam 0.4
    And looking up the active splits as of "2026-03-15" also returns 0.6 / 0.4 (start-inclusive)
    And looking up the active splits as of "2026-03-14" returns 0.5 / 0.5 (end-exclusive)
    And looking up the active splits as of "2023-12-31" returns Result.fail with "precedes earliest split window"
    # fails if: SplitRulesService picks the wrong window — off-by-one, picks first match
    # instead of latest applicable, treats interval as fully-closed, or silently
    # extrapolates past the earliest validFrom (the 2023-12-31 line guards that). Clock
    # purity is owned by the slice 5 (g) regex assertion, not by this scenario.

  Scenario: a configuration with two windows sharing a validFrom is rejected at parse
    Given a config has two split windows both starting on "2024-01-01"
    When the configuration is loaded
    Then loading fails with an error citing the duplicate validFrom by index
    And the error message contains no stack trace and no Zod-internal type name
    # fails if: Zod schema accepts duplicate validFrom values (downstream getSplitsAsOf
    # would silently pick whichever sorts first — non-deterministic). Also fails if
    # the error surfaces "ZodError" or a stack trace instead of formatZodError's output.

  Scenario: partner roster must be identical across all windows (path-cited, PII-safe)
    Given a config where window 0 has partners "Alex, Sam"
    And window 1 has partners "Alex, Jordan"
    When the configuration is loaded
    Then loading fails with an error citing the offending window by index
    And the error message does NOT echo any partner name verbatim
    # fails if: parseRawConfig accepts windows with non-identical partner sets, allowing
    # the parsed config to ship mismatched rosters into any downstream consumer. Also
    # fails if the error message echoes a partner name — partner names are user-controlled
    # and treated as PII per the existing Story-1.4 test pattern
    # ([config-schema.test.ts:67] expects "not.toContain('Alex')").
