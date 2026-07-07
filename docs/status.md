# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

- **Epic 1** — complete. Stories 1.1–1.4 (project scaffold, Money, Ledger, Config) shipped.
- **Epic 2** — complete. Stories 2.1–2.5 (Ingest + Tagging + Commit) shipped.
- **Epic 3** — **complete.** Stories 3.1 (Versioned Split Rules) + 3.2 (Buffer State Reader) + 3.3 (Recurring Cost Forecast) + 3.4 (Safe Monthly Transfer Calculator) + 3.5 (Status CLI Command) shipped.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-16 shipped.
- **Epic 4** (Trust, Transparency & Lifecycle — corrections, audit trail, dissolution) — **defined** (story-4.0), **story-4.1 shipped** (FR23 audit-trail spine — `DomainEventRecorder` port + append-only `domain_events` store + `TransactionIngested`, recorded at the app boundary (B1) on ingest commit; closes #155), **story 4.2 shipped in full** (split 4.2a domain + 4.2b CLI): `Transaction.kind`/`correctsId`, pure `CorrectionService` (reverse-and-correct, now with a reversal-target guard + a ≥1-changed-field guard), `TransactionCorrected` in the event union, migration 006 (kind-conditioned `idempotency_hash` CHECK), atomic hash-free `saveCorrection` (4.2a), and the `correct` CLI command (explicit flags, `--json`, `--amount` parsed string→cents with no float intermediate, `--date` DST-safe string splicing) that loads the original, calls `CorrectionService`, persists, and records `TransactionCorrected` at the app boundary (4.2b). Scoped to the two-entry expense shape (>2-entry → #183).
- **Next:** **story-4.3** (Conversational-CFO explanations, FR19) — narrates *why* a number changed, drawing on correction + event data; depends on 4.2. Then 4.4 (global `--json`) / 4.5 (config-change + dissolution events). **Epic 5** (Year-in-Review & Annual Planner) scaffolded — Stories 5.1 / 5.2a / 5.2b / 5.3 are read-only and unblocked, but Story 5.4 sequences after FR23 (Audit Trail) completes (needs 4.1 + the `ConfigChanged` event from 4.5). See [epics.md](epics.md).

### Non-product initiatives

- **Harness engineering curriculum** — skill-development track on agentic engineering, sequenced cheapest-first across 6 modules. Tracked separately from product epics. See [docs/learning/harness-engineering.md](learning/harness-engineering.md).

## Refresh trigger

Update this file in the same commit as the retrospective for any story that:

- ships an epic-level milestone, OR
- starts a new epic, OR
- changes the "Next" line.

Routine maint-story merges drop a fragment under [`docs/status.d/`](status.d/) — never edit the log block in this file.

## Status log

Per-story log entries live in [`docs/status.d/`](status.d/) — newest first by filename (`ls -r docs/status.d/`).
