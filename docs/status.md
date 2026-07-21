# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

- **Epic 1** — complete. Stories 1.1–1.4 (project scaffold, Money, Ledger, Config) shipped.
- **Epic 2** — complete. Stories 2.1–2.5 (Ingest + Tagging + Commit) shipped.
- **Epic 3** — **complete.** Stories 3.1 (Versioned Split Rules) + 3.2 (Buffer State Reader) + 3.3 (Recurring Cost Forecast) + 3.4 (Safe Monthly Transfer Calculator) + 3.5 (Status CLI Command) shipped.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-16 shipped.
- **Epic 4** (Trust, Transparency & Lifecycle — corrections, audit trail, dissolution) — **defined** (story-4.0), **story-4.1 shipped** (FR23 audit-trail spine — `DomainEventRecorder` port + append-only `domain_events` store + `TransactionIngested`, recorded at the app boundary (B1) on ingest commit; closes #155), **story 4.2 shipped in full** (split 4.2a domain + 4.2b CLI): `Transaction.kind`/`correctsId`, pure `CorrectionService` (reverse-and-correct, now with a reversal-target guard + a ≥1-changed-field guard), `TransactionCorrected` in the event union, migration 006 (kind-conditioned `idempotency_hash` CHECK), atomic hash-free `saveCorrection` (4.2a), and the `correct` CLI command (explicit flags, `--json`, `--amount` parsed string→cents with no float intermediate, `--date` DST-safe string splicing) that loads the original, calls `CorrectionService`, persists, and records `TransactionCorrected` at the app boundary (4.2b). Scoped to the two-entry expense shape (>2-entry → #183).
- **Epic 4 — COMPLETE** (2026-07-17). All five stories shipped: 4.1 (audit-trail spine), 4.2a/b (corrections), 4.3a/b (settlement variance `explain`), 4.4a/b (global JSON contract), 4.5a/b/c (config-change detection · export bundle · proof-gated wipe). The event family is closed — `TransactionIngested`, `TransactionCorrected`, `ConfigChanged`, `DataExported`, `DissolutionPerformed` (receipt-only) — FR14/FR19/FR20/FR21/FR23 all done. Final slice: story-4.5c (PR #234) — `dissolve` erases the ledger only past byte-based bundle verification, strict staleness (a config edit since export is a *detected* staleness cause via the ambient observation), and typed-DISSOLVE/`--confirm`; durable `0600` receipt before any deletion; `accounting.yaml` survives.
- **Post-Epic-4 batch — COMPLETE** (2026-07-19). The enforcement-freeze's planned unfreeze point, fully executed: **h12** evals-lite ([#165](https://github.com/xavierbriand/accounting/issues/165) — disposition rates over 688 findings, spec-version headers, data-driven checklist demotions), **h13** subtraction ([#164](https://github.com/xavierbriand/accounting/issues/164) — first rule-expiry walk: 6 tombstoned, R22 closed, drift-scan Check G, Try-funnel), **h14** thesis refresh ([#166](https://github.com/xavierbriand/accounting/issues/166) — corpus currency + Part D field chapters). The overdue product bugs also shipped: **story-E** ([#93](https://github.com/xavierbriand/accounting/issues/93)/[#103](https://github.com/xavierbriand/accounting/issues/103) — same-run re-application of remembered ingest rules). Per-story detail lives in the [status fragments](status.d/).
- **Epic 5** (Year-in-Review & Annual Planner) — **defined** (story-5.0, PR [#248](https://github.com/xavierbriand/accounting/pull/248)): intent interview reframed the epic to an **agent-mediated annual planning conversation** (couple + agent; CLI = deterministic engine; plan file = working state **and** durable intent record, read next year as plan-vs-actual; ledger assumed complete, graceful < 12-month degradation). FR24/25/27 amended, **FR28 minted** (agent ritual guidance → Story 5.5); story cards 5.1–5.5 in [epics.md](epics.md).
- **Next:** **story 5.1** (Year-in-Review Analyzer — Phase 1 opens with the grouping-heuristic research spike) · restore-from-bundle ([#232](https://github.com/xavierbriand/accounting/issues/232)) · Module 6 teach-out ([#100](https://github.com/xavierbriand/accounting/issues/100)).

### Non-product initiatives

- **Harness engineering curriculum** — skill-development track on agentic engineering. Modules 1–5 shipped (drift-scan, primitives, lanes, evals-lite, metrics); Module 6 (teach-out) is the remaining end-state, unblocked now that a product epic has run the full loop. Field chapters from the 2026-05→07 interval live in Part D. See [docs/learning/harness-engineering.md](learning/harness-engineering.md).

## Refresh trigger

Update this file in the same commit as the retrospective for any story that:

- ships an epic-level milestone, OR
- starts a new epic, OR
- changes the "Next" line.

Routine maint-story merges drop a fragment under [`docs/status.d/`](status.d/) — never edit the log block in this file.

## Status log

Per-story log entries live in [`docs/status.d/`](status.d/) — newest first by filename (`ls -r docs/status.d/`).
