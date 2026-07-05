# Model note — story-4.0

*(Template: [docs/templates/model-note.md](../../templates/model-note.md). Epic-4 **defining** session — issue #156. It models the two `*(forthcoming)*` concepts (correction, audit trail) and slices Epic 4 into stories; no code lands here. The numbered Epic-4 stories (4.1+) derive their `## Domain model` sections from this note — R24.)*

## Domain question

How does a partner correct a past transaction without erasing history — and how does the system record every meaningful action (import, correction, rule change, dissolution) as an immutable audit trail — both expressed as plain immutable domain events in Core, recorded through a `DomainEventRecorder` port?

## Terms

Glossary deltas (user signs off wording before they land — R25):

- **Used:** Ledger, Transaction, Entry, Double-entry invariant, Money, Partner.
- **Added:** **Correction** (promoted from the reserved *Soft edit*; the accounting-idiomatic term — "soft edit" is dropped, including as the CLI verb, which becomes `correct`), **Audit trail / domain event** (promoted from *forthcoming*), **Reversal** (new), **Correcting entry** (new). **Dissolution** reserved *(forthcoming)* for story 4.5.
- **Changed:** none.

## Model

One bounded context (**Shared Finances**); correction lives in the **Ledger** module, audit-trail events are a cross-cutting tactical pattern within the context — no new bounded context, no split-tripwire change.

**Correction shape — reverse-and-correct.** A correction writes *two* new balanced transactions and never touches the original (accounting practice: a *reversing entry* backs the error out, a *correcting entry* posts the truth — FR14: "a Reversal and a Correction entry"):

- a **Reversal** — the original mirrored (debits ↔ credits swapped), netting the original to zero;
- a **Correcting entry** — the fully corrected transaction, written fresh.

Tactical roles:

- `Transaction` (**aggregate root**, [src/core/ledger/transaction.ts](../../../src/core/ledger/transaction.ts)) gains `correctsId?: string` and `kind: 'original' | 'reversal' | 'correcting'`. Existing invariants (≥ 2 entries, non-negative amounts, single currency, debits == credits) unchanged; `kind` defaults to `'original'`.
- `CorrectionChanges` (**value object**) — the requested field deltas (any of amount, account/category, date, description).
- `CorrectionService` (**domain service**) — pure: `correct(original, changes, ids): Result<{ reversal: Transaction; correcting: Transaction; event: TransactionCorrected }>`. Takes the original, the changes, and injected ids (reversal + correcting entry); returns two aggregates + the event. **No `idempotencyHash` parameter** — the correction path never speaks ingest-ACL vocabulary (boundary flag from #155 respected). `correctsId`/`kind` are general ledger-correction vocabulary, not ingest vocabulary, so growing `Transaction` with them keeps the firewall intact.
- Domain events — plain immutable value objects in a new `src/core/events/`, recorded via the `DomainEventRecorder` port (#155, [architecture.md § Domain events](../../architecture.md)); Infra persists append-only. No base class, no dispatcher, no event sourcing.

**Correction date.** Reversal + correcting entry both carry the **original** transaction's `occurredAt`. This preserves receipt truth, keeps a past period's settlement math stable, and needs **no clock in Core** — the service stays pure and deterministic.

**Event-timestamp boundary note.** The correction *ledger rows* carry the original date (no Core clock). The audit *event's* recording timestamp — "when this correction was performed" — is a system event (UTC) stamped at the boundary where `record()` is called (Infra clock), not inside `CorrectionService`. This resolves the apparent date tension while keeping Core clock-free. The recorder call-site (inside-service vs app-boundary — B2/B1) is **decided at story-4.1 Phase 1**; likely hybrid: record inside the service for ledger-mutating events (atomic with the rows), at the app boundary for app-level facts (config change, dissolution).

## Invariants

Each becomes a property or unit test in story-4.2 (correction):

1. Reversal + original net to zero on every account (property test over random balanced originals).
2. The correcting entry is balanced — inherits `Transaction.create` (debits == credits).
3. Correcting-entry currency == original currency; a cross-currency correction is `Result.fail`, never a warning.
4. `correctsId` on the reversal and the correcting entry resolves to an existing transaction.
5. The three-row group's net ledger effect equals a single transaction with the corrected values (observational equality — "as if edited"; property test).
6. Reversal and correcting entry carry the original's `occurredAt` (date-preservation).
7. Every correction carries a non-empty `reason`.
8. A correcting entry may itself be the target of a later correction; the `correctsId` chain resolves to the current value (chaining, unlimited).

## Events

Past-tense, glossary vocabulary; plain value objects.

- **`TransactionCorrected`** — emitted by a correction. Core-produced fields: `type`, `targetTransactionId`, `producedTransactionIds` (reversal + correcting-entry ids), `changedFields[]`, `reason` (required). The recording timestamp is applied at the boundary (see event-timestamp note). No `actor` field — actor is not recorded (no auth system; a self-declared actor would be misleading precision).

Named here for the slicing, defined by their own stories:

- **`TransactionIngested`** — story 4.1 (first event; proves the recorder + append-only store).
- **`ConfigChanged`**, **`DissolutionPerformed`** — story 4.5.

## Rejected alternatives

- **Adjusting-delta** (one signed-difference transaction) — leanest, but category/account/date/description edits have no clean money delta; loses to the all-fields scope.
- **Correction as a separate aggregate** (a `Correction` root + repository) — a second aggregate and write path for a thin concept; `reason`/link live fine on `Transaction` + the event.
- **Today's date for corrections** — would need a clock in Core and could retroactively shift a past month's safe-transfer figure; original-date preserves receipt truth.
- **Recording actor** — no auth exists; an unverified self-declared actor is misleading precision. Revisit if an identity mechanism arrives.
- **Collapse-by-default visibility** — every consumer would have to honor a superseded-row filtering protocol; showing all three rows matches append-only transparency and still nets to corrected reality.

## Sign-off

- User: approved with the story-4.0 plan (plan-mode approval, 2026-07-05); term rename to **Correction** / **Correcting entry** approved in session.
