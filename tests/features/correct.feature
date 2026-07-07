Feature: Correct a past transaction via the correct CLI command

  Scenario: Correct an amount (happy path, human output)
    Given a persisted two-entry original transaction
    When I run correct with amount "45.30" and reason "wrong amount on receipt"
    Then the correct command exits with code 0
    And correct stdout reports the reversal id, the correcting id, and changed fields "amount"
    And the DB holds the original plus a reversal and a correcting transaction
    And one TransactionCorrected event is recorded naming the target, the produced ids, changed fields, and reason
    # fails if: the command doesn't call saveCorrection + record against the real DB,
    # or misreports changed fields.

  Scenario: --json output, multiple changed fields
    Given a persisted two-entry original transaction
    When I run correct with amount "45.30", category "Insurance", reason "wrong amount and category", and json output
    Then the correct command exits with code 0
    And correct stdout is a single JSON document with changedFields "amount,account"
    # fails if: the JSON is missing a field, only reports one of the two changed fields,
    # or human prose leaks into stdout under --json.

  Scenario: Reason required
    Given a persisted two-entry original transaction
    When I run correct with amount "10.00" and a blank reason
    Then the correct command exits with code 2
    And no transaction rows are written beyond the original
    And no TransactionCorrected event is recorded
    # fails if: the command proceeds without a reason. Tested against the zod
    # boundary (parseCorrectOptions) in-process, per R7 — commander's own
    # requiredOption('--reason', ...) enforcement is exercised transitively by
    # scenario 8's real subprocess run (see docs/plans/story-4.2b.md Deviations).

  Scenario: Transaction not found
    Given a fresh migrated correct DB
    When I run correct for a missing transaction with amount "10.00" and reason "test"
    Then the correct command exits with code 2
    And correct stderr names the missing transaction id
    And no transaction rows are written
    And no TransactionCorrected event is recorded
    # fails if: the command crashes uncaught or silently no-ops with exit 0.

  Scenario: Reject correcting a reversal
    Given a persisted reversal-kind transaction
    When I run correct on the reversal with amount "10.00" and reason "test"
    Then the correct command exits with code 2
    And correct stderr cites that a reversal cannot be corrected
    And no additional transaction rows are written
    And no TransactionCorrected event is recorded
    # fails if: the new guard is missing and a reversal gets corrected.

  Scenario: No fields to correct
    Given a persisted two-entry original transaction
    When I run correct with only reason "just checking"
    Then the correct command exits with code 2
    And correct stderr cites that at least one field must be corrected
    And no transaction rows are written beyond the original
    # fails if: the service accepts and persists a no-op correction.

  Scenario: saveCorrection write failure
    Given a persisted two-entry original transaction
    And saveCorrection is rigged to fail for this run
    When I run correct with amount "45.30" and reason "test"
    Then the correct command exits with code 4
    And correct stderr contains no raw idempotency-hash value
    And no TransactionCorrected event is recorded
    # fails if: the command records an event despite the write failing, or leaks
    # an unredacted DB error to stderr.

  Scenario: Clearing a description to empty text (closes #185)
    Given a persisted two-entry original transaction with description "Transport"
    When I run correct with description "" and reason "typo cleanup"
    Then the correct command exits with code 0
    And the correcting entry's description is empty
    And correct stdout reports changed fields "description"
    # fails if: the empty-string clear is silently dropped from the correcting
    # entry or omitted from changedFields.

  Scenario: Full CLI journey through the real binary (composition-root, subprocess, R4)
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    And the CSV has been committed interactively
    When I run correct as a subprocess on the first committed transaction with category "Insurance" and reason "miscategorized" and json output
    Then the process exits with code 0
    And the subprocess JSON output matches the correct command's documented shape
    And a direct DB read confirms the reversal and correcting rows and the recorded TransactionCorrected event
    # fails if: correct isn't actually wired into program.ts, or any DI seam is
    # broken end-to-end (the class of bug per-unit tests can't catch).
