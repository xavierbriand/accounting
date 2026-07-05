Feature: Audit trail records domain events for meaningful actions (FR23)

  Scenario: Committing an ingest batch records a TransactionIngested event
    Given a fresh migrated DB and accounting.yaml at a temp dir
    And a BPCE CSV copied to that temp dir as "bpce-valid_real.csv"
    When I run scripted ingest confirming the batch on "bpce-valid_real.csv"
    Then the process exits with code 0
    And the audit trail holds one TransactionIngested event
    And its payload lists the committed transaction ids and source account
    # fails if: the ingest path does not call recorder.record(...) after saveBatch
    # succeeds (guards the B1 wiring in commitBatch + the program.ts composition-root
    # construction). commitBatch/saveBatch is reached only via the interactive confirm
    # path (ingest-command.ts:164) — --non-interactive/--json never call commitBatch
    # for any fixture (pre-existing, out of scope for 4.1). This scenario drives the
    # interactive path via --scripted-prompts (NODE_ENV=test).
