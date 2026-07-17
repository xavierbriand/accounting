# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

- **Epic 1** — complete. Stories 1.1–1.4 (project scaffold, Money, Ledger, Config) shipped.
- **Epic 2** — complete. Stories 2.1–2.5 (Ingest + Tagging + Commit) shipped.
- **Epic 3** — **complete.** Stories 3.1 (Versioned Split Rules) + 3.2 (Buffer State Reader) + 3.3 (Recurring Cost Forecast) + 3.4 (Safe Monthly Transfer Calculator) + 3.5 (Status CLI Command) shipped.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-16 shipped.
- **Epic 4** (Trust, Transparency & Lifecycle — corrections, audit trail, dissolution) — **defined** (story-4.0), **story-4.1 shipped** (FR23 audit-trail spine — `DomainEventRecorder` port + append-only `domain_events` store + `TransactionIngested`, recorded at the app boundary (B1) on ingest commit; closes #155), **story 4.2 shipped in full** (split 4.2a domain + 4.2b CLI): `Transaction.kind`/`correctsId`, pure `CorrectionService` (reverse-and-correct, now with a reversal-target guard + a ≥1-changed-field guard), `TransactionCorrected` in the event union, migration 006 (kind-conditioned `idempotency_hash` CHECK), atomic hash-free `saveCorrection` (4.2a), and the `correct` CLI command (explicit flags, `--json`, `--amount` parsed string→cents with no float intermediate, `--date` DST-safe string splicing) that loads the original, calls `CorrectionService`, persists, and records `TransactionCorrected` at the app boundary (4.2b). Scoped to the two-entry expense shape (>2-entry → #183).
- **Epic 4 — COMPLETE** (2026-07-17). All five stories shipped: 4.1 (audit-trail spine), 4.2a/b (corrections), 4.3a/b (settlement variance `explain`), 4.4a/b (global JSON contract), 4.5a/b/c (config-change detection · export bundle · proof-gated wipe). The event family is closed — `TransactionIngested`, `TransactionCorrected`, `ConfigChanged`, `DataExported`, `DissolutionPerformed` (receipt-only) — FR14/FR19/FR20/FR21/FR23 all done. Final slice: story-4.5c (PR #234) — `dissolve` erases the ledger only past byte-based bundle verification, strict staleness (a config edit since export is a *detected* staleness cause via the ambient observation), and typed-DISSOLVE/`--confirm`; durable `0600` receipt before any deletion; `accounting.yaml` survives.
- **Next (user's pick):** **Epic 5** (Year-in-Review & Annual Planner — fully unblocked; 5.4's `ConfigChanged` dependency shipped in 4.5a) · the **post-Epic-4 harness batch** ([#164](https://github.com/xavierbriand/accounting/issues/164) subtraction, [#165](https://github.com/xavierbriand/accounting/issues/165) evals-lite, [#166](https://github.com/xavierbriand/accounting/issues/166) thesis refresh — the enforcement-freeze's planned unfreeze point) · the **product bugs queued for "Epic 4 start"** and now overdue ([#93](https://github.com/xavierbriand/accounting/issues/93)/[#103](https://github.com/xavierbriand/accounting/issues/103)) · restore-from-bundle ([#232](https://github.com/xavierbriand/accounting/issues/232)). **Story-4.5a shipped** (PR #230): config-change detection — `ConfigChanged` (origin `'external'`) recorded ambiently on every ledger-opening command with a verbatim identity-keyed diff, PII-safe-by-construction Configuration invariant + parse-time IBAN/card tripwire, `config_state` (migration 007); FR23's audit-trail triad complete; unblocks Epic-5 Story 5.4 and #203's `explain` labelling. **Story-4.4 shipped in full — FR20 complete** (4.4a PR #214: ingest `--non-interactive`/`--json` commits unless a decision is pending, closes #181; 4.4b PR #216: global JSON contract — uniform `{command, ok, data}`/`{command, ok: false, error}` envelope on stdout/stderr, camelCase + `Money.toString()` conventions, 8-code error registry, contract doc at [cli-json-contract.md](cli-json-contract.md) kept current by new rule R31), per the LLM-agents-as-consumer reframe. **FR19 shipped in full** as story-4.3a (settlement-variance domain, PR #204) + 4.3b (`explain` CLI, PR #210): *reframed by user interview* from correction narration to the settle-ritual variance report — see [epics.md](epics.md) Story 4.3 and the [story-4.3 model note](domain/model-notes/story-4.3.md). **Epic 5** (Year-in-Review & Annual Planner) scaffolded — Stories 5.1 / 5.2a / 5.2b / 5.3 are read-only and unblocked, but Story 5.4 sequences after FR23 (Audit Trail) completes (needs 4.1 + the `ConfigChanged` event from 4.5). See [epics.md](epics.md).

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
