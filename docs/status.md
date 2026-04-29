# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

- **Epic 1** — complete. Stories 1.1–1.4 (project scaffold, Money, Ledger, Config) shipped.
- **Epic 2** — complete. Stories 2.1–2.5 (Ingest + Tagging + Commit) shipped.
- **Epic 3** — in progress. Stories 3.1 (Versioned Split Rules) + 3.2 (Buffer State Reader) + 3.3 (Recurring Cost Forecast) shipped.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-15 shipped.
- **Next:** Story 3.4 planning (Safe Monthly Transfer Calculator — see [epics.md](epics.md)).

## Refresh trigger

Update this file in the same commit as the retrospective for any story that:

- ships an epic-level milestone, OR
- starts a new epic, OR
- changes the "Next" line.

Routine maint-story merges drop a fragment under [`docs/status.d/`](status.d/) — never edit the log block in this file.

## Status log

Per-story log entries live in [`docs/status.d/`](status.d/) — newest first by filename (`ls -r docs/status.d/`).
