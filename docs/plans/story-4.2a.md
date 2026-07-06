# Story 4.2a — Correction Domain (Reverse-and-Correct)

## Context

Story 4.2 (Correction) is split into **4.2a — the correction domain** (this plan) and
**4.2b — the `correct` CLI command + boundary wiring** (follow-up). The split follows
CLAUDE.md §6.6 (>~3 scenarios → split) and the epic's own pre-authorization
("Split 4.2a/4.2b if > 3 scenarios") — the story-4.0 invariants + FR14 acceptance criteria
clearly exceed three scenarios. **User-confirmed 2026-07-06.**

**4.2a delivers the pure domain + schema + persistence** for reverse-and-correct: a partner
can model a correction (reversal + correcting entry, original untouched) and persist the two
new rows atomically. **4.2b** adds the user-facing `correct` command (explicit flags —
user-confirmed 2026-07-06), loads the original, calls this domain service, persists via
`saveCorrection`, and records the `TransactionCorrected` event at the app boundary (the B1
pattern from story-4.1). Targets **FR14** (Correction). **Lane: Full** (touches `src/core/`,
DB schema, migration).

Domain shape derives from the Epic-4 defining note
([story-4.0](../domain/model-notes/story-4.0.md)) per R24 — no fresh model-session, same
precedent as story-4.1. Carries the story-4.0 fork decisions: reverse-and-correct; original
`occurredAt` on both new rows (see the date-correction clarification below); **required**
free-text reason; all three rows visible by default; no actor recorded; corrections may
themselves be corrected (unlimited `correctsId` chain).

### Maintenance sub-loop (§ 6.7) run 2026-07-05 pre-planning

- **Sibling work check.** `gh pr list --state open` → **none open.** `gh issue list --state
  open` reviewed: no issue targets the correction workflow. Adjacent-but-non-overlapping:
  #180 (atomic audit-event UnitOfWork — the B1 non-atomicity gap deferred from 4.1) applies
  to **4.2b's** event recording, not this domain slice; #181/#93/#103 (ingest bugs,
  unrelated path).
- **Story-id uniqueness.** `git ls-tree -r origin/main … | grep story-4.2` → no
  `docs/plans/`, `docs/retrospectives/`, or `docs/status.d/` file exists for `4.2`, `4.2a`,
  or `4.2b`. No open PR branch carries the id. **`story-4.2a` is free.**
- **Working tree clean.** `git status` clean; branch `story-4.2a` cut fresh from `main`
  (0e14d7f, story-4.1 merged).
- **Open issues.** 30+ open; scanned — none block or overlap. Deferred-suggestion backlog
  (#77 index, #88 symlink, etc.) unrelated to the correction path.
- **Open PRs.** None. No Dependabot bumps pending.
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** ✅ clean surface, no overlap, model pre-decided in 4.0.

## Story

> As a **User**, I want the system to model and persist a correction of a past transaction —
> a reversal plus a correcting entry, without erasing the original — so that (once the
> `correct` command lands in 4.2b) I can fix mistakes while the full history stays on the
> record.

## Domain model

Derives from the Phase-0 model note [story-4.0](../domain/model-notes/story-4.0.md) (R24).

- **Glossary terms used:** Correction, Reversal, Correcting entry, Audit trail / domain
  event, `TransactionCorrected`, Ledger, Transaction, Entry, Double-entry invariant, Money,
  Partner. **All already in [glossary.md](../domain/glossary.md)** (promoted from
  *forthcoming* in story-4.0; the Audit-trail entry already names `TransactionCorrected`).
  **No new vocabulary → no glossary edit this story.**
- **Aggregates / value objects / services touched:**
  - `Transaction` (**aggregate root**, [transaction.ts](../../src/core/ledger/transaction.ts))
    gains `correctsId?: string` and `kind: 'original' | 'reversal' | 'correcting'`
    (default `'original'`). Existing invariants (≥2 entries, non-negative amounts, single
    currency, debits == credits) unchanged.
  - `CorrectionChanges` (**value object**, new) — the requested field deltas: any of
    `amount` (a `Money`), `account` (category), `date` (occurredAt), `description`.
  - `CorrectionService` (**domain service**, new, pure) —
    `correct(original, changes, ids, reason): Result<{ reversal, correcting, event }>`.
    Injected `ids = { reversalId, correctingId }` keep Core clock-/uuid-free.
  - **Entry-shape scope (Phase-2 P1 finding — adopted).** `Transaction` has no
    transaction-level `amount`/`account`; those live per-`Entry`. 4.2a scopes the service to
    the canonical **two-entry expense shape** the ingest builder produces (one debit
    `Expense:Category`, one credit `Liabilities:…`): an `amount` change retargets **both**
    entries to the new amount (debits == credits preserved); an `account` change retargets the
    **debit (expense-category) side** only. An original with **>2 entries** (a genuine split)
    returns `Result.fail` — split-correction is deferred to
    [#183](https://github.com/xavierbriand/accounting/issues/183). No current data path
    produces >2-entry transactions, so this is scope-tightening, not a live gap.
  - **`reason` redaction (Phase-2 P2 finding — adopted, split across slices).** `reason` is
    PII-adjacent (glossary: "redacted in logs by default"). In 4.2a, Core `Result.fail`
    messages **must never echo `reason` text**. The `TransactionCorrected` event carries
    `reason` in its payload; log/error-boundary redaction at the `record()` call site is
    **4.2b's** concern (noted in Risks).
  - `TransactionCorrected` (**domain event**, new) — added to the `DomainEvent` union in
    [domain-event.ts](../../src/core/events/domain-event.ts).
  - `TransactionRepository` (**port**) gains
    `saveCorrection(reversal, correcting): Result<void>` — an atomic, hash-free, append-only
    two-row write (correction rows never speak ingest-ACL vocabulary — story-4.0 firewall).
- **Date-correction clarification** *(proposed delta to the 4.0 note's "Correction date" /
  Invariant 6; user-approved 2026-07-06 — to be reconciled into the note at retro):* the
  **reversal always** carries the original `occurredAt` (nets the original out in its own
  period). The **correcting entry** carries the original `occurredAt` **by default**, but the
  **corrected date** when `date` is among the changed fields. The note's "both carry the
  original occurredAt" is the default (non-date-correction) case.
- **Invariants the diff must not violate** (from the 4.0 note — each → a property or unit
  test here):
  1. Reversal + original net to zero on every account (**property**).
  2. Correcting entry is balanced — inherits `Transaction.create` (debits == credits).
  3. Correcting-entry currency == original currency; cross-currency → `Result.fail`.
  4. `correctsId` on both new rows resolves to an existing transaction (FK; **integration**).
  5. Three-row group's net effect == a single transaction with the corrected values
     (observational equality — **property**).
  6. Reversal carries original `occurredAt`; correcting entry preserves it unless `date` is
     corrected (date-correction clarification above).
  7. Every correction carries a non-empty `reason`.
  8. A correcting entry may itself be corrected; `correctsId` chain is unlimited.
- **Events emitted (by the service, returned — not recorded here):** `TransactionCorrected`
  with Core fields `type`, `targetTransactionId`, `producedTransactionIds` (reversalId +
  correctingId), `changedFields[]`, `reason`. The recording timestamp + the actual `record()`
  call are **4.2b's** boundary concern (no Core clock).

## Selected solution

Grow the existing `Transaction` aggregate with `kind` + `correctsId` and add a pure
`CorrectionService` that, given the original + requested changes + injected ids + reason,
returns the reversal, the correcting entry, and the `TransactionCorrected` event. Persist via
a new atomic `saveCorrection` repo method. This keeps the correction path entirely inside the
Ledger module (no new bounded context, no new aggregate) and the service pure/deterministic.

**Alternatives set aside** (from the 4.0 note — recorded, not re-litigated):
- *Adjusting-delta* (one signed-difference txn) — no clean money delta for
  category/date/description edits.
- *Correction as a separate aggregate* — a second write path for a thin concept; `reason`/link
  live fine on `Transaction` + the event.
- *Today's date for corrections* — needs a Core clock; breaks past-period settlement stability.

## Production-code surface (R2)

| File | Change |
| --- | --- |
| `src/core/ledger/transaction.ts` | `TransactionDraft` gains optional `kind?` + `correctsId?`; `Transaction` gains `kind`/`correctsId` fields + getters; `create()` defaults `kind='original'`, `correctsId=undefined`. Additive — existing callers unaffected. |
| `src/core/ledger/correction-changes.ts` *(new)* | `CorrectionChanges` type (all fields optional: `amount?`, `account?`, `date?`, `description?`). |
| `src/core/ledger/correction-service.ts` *(new)* | `CorrectionService.correct(original, changes, ids, reason): Result<{ reversal: Transaction; correcting: Transaction; event: TransactionCorrected }>`. Pure. |
| `src/core/events/domain-event.ts` | Add `TransactionCorrected` interface; extend `DomainEvent` union. |
| `src/core/ports/transaction-repository.ts` | Add `saveCorrection(reversal: Transaction, correcting: Transaction): Result<void>`. |
| `src/infra/db/migrations/006-correction-columns.sql` *(new)* | `ALTER TABLE transactions ADD COLUMN corrects_id TEXT REFERENCES transactions(id)`; `ADD COLUMN kind TEXT NOT NULL DEFAULT 'original' CHECK (kind IN ('original','reversal','correcting'))`; `PRAGMA user_version = 6`. Idempotent (runner gates on user_version). |
| `src/infra/db/repositories/sqlite-transaction-repo.ts` | `save`/`insert` write `kind`+`corrects_id`; `selectHeader` + `findById` read + reconstruct them; new `saveCorrection` (single SQL transaction, both rows, no idempotency hash). |

No CLI changes (4.2b). No output-format changes (the event is returned, not rendered, here).

## Gherkin acceptance scenarios

All **in-process** (R7), in two flavours: scenarios 1–6 + 8 are **pure-unit / property**
tests (in-memory, mocked/no ports); scenario 7 is an **integration** test against **real
SQLite** (still in-process — no subprocess spawn). None spawns a subprocess and `program.ts`
is untouched (R4 not triggered). CLI acceptance (`.feature`) lands in 4.2b.

1. **Correct an amount** — *Given* a balanced original transaction, *When* I correct its
   amount with a reason, *Then* a reversal (entries mirrored, original date), a correcting
   entry (new amount, original date), and a `TransactionCorrected` event are produced, and
   the original is unchanged.
   *fails if* `CorrectionService.correct` mutates the original or emits an unbalanced
   reversal/correcting pair.
2. **Correct a non-amount field (description/account)** — *Given* a two-entry original,
   *When* I correct only the description (or the debit-side account), *Then* the correcting
   entry reflects it (other entries copied unchanged), the reversal mirrors the original,
   `changedFields` names the field.
   *fails if* the service ignores non-amount changes, retargets the wrong entry's account, or
   misreports `changedFields`.
3. **Correct the date** — *Given* an original dated `D`, *When* I correct the date to `D'`,
   *Then* the correcting entry carries `D'` and the reversal carries `D`.
   *fails if* the correcting entry keeps the original date when `date` is corrected, or the
   reversal moves off `D`.
4. **Reason required** — *Given* an original, *When* I correct it with an empty/missing
   reason, *Then* `Result.fail` (invariant 7).
   *fails if* the service produces a correction with no reason.
5. **Cross-currency correction rejected** — *Given* a USD original, *When* the corrected
   amount is EUR, *Then* `Result.fail` citing currency mismatch (invariant 3).
   *fails if* a cross-currency correcting entry is produced instead of failing.
6. **Chaining** — *Given* a correcting entry from a prior correction, *When* I correct it,
   *Then* the new reversal + correcting entry carry `correctsId` = the correcting entry's id
   (invariant 8).
   *fails if* the `correctsId` chain breaks or points at the wrong id.
7. **Repo round-trip (integration, real SQLite)** — *Given* a persisted original, *When* I
   `saveCorrection(reversal, correcting)`, *Then* both rows persist atomically with
   `kind`/`corrects_id`, `findById` reconstructs them, and a bad `corrects_id` FK / a
   mid-batch failure rolls the pair back (invariant 4).
   *fails if* `saveCorrection` is non-atomic or the columns don't round-trip.
8. **Reject correcting a split (>2-entry) transaction** — *Given* an original with more than
   two entries, *When* I correct it, *Then* `Result.fail` citing that split-correction is
   unsupported (deferred to #183); nothing is produced.
   *fails if* the service silently mis-splits a >2-entry original instead of failing.

**Property tests** (fast-check): net-to-zero over random balanced two-entry originals
(inv 1); observational equality of the three-row group vs a single corrected transaction
(inv 5).

## Slice plan

Target 8–10 commits (R13 upper end — domain-dense single service). One slice = one
behaviour; § 6.4 rhythm, story id in every subject.

1. `test/feat(ledger): migration 006 — corrects_id + kind columns` (integration: columns
   exist, idempotent, user_version=6).
2. `test/feat(ledger): Transaction gains kind + correctsId (default original)`.
3. `test/feat(events): TransactionCorrected in DomainEvent union`.
4. `test/feat(ledger): CorrectionService — amount correction (reversal + correcting + event)`.
5. `test/feat(ledger): CorrectionService — field-change semantics (non-amount + date rule)`
   — one behaviour: applying `CorrectionChanges` to build the correcting entry (description,
   debit-side account, and the date-carry rule are one cohesive concern).
6. `test/feat(ledger): CorrectionService — input guards` — one behaviour: reject invalid
   corrections (empty reason, cross-currency amount, >2-entry split → #183).
7. `test/feat(ledger): core invariants as properties (net-to-zero + observational equality)`
   — one behaviour: the algebraic invariants of the three-row group.
8. `test/feat(ledger): saveCorrection atomic two-row write + findById round-trip`
   (integration).
9. `refactor(ledger): <extraction from review>` (or R11 empty slot with justification).

**R13 note (Phase-2 P3 finding — acknowledged):** slices 5–7 each group closely-related
assertions under **one behaviour** (field-change application; input-guard validation; the
invariant algebra) rather than one Gherkin line per commit — deliberate, to keep the
envelope in R13's 6–10 for a domain-dense single service. If Sonnet reports > 1 round, split
at the CorrectionService (4–7) / persistence (1–3, 8) seam.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| `saveCorrection` non-atomicity would allow a half-written correction (reversal without correcting entry). | Single `better-sqlite3` transaction wrapping both inserts; integration test asserts rollback on the second insert failing. |
| Idempotency firewall: correction rows must not acquire ingest hashes. | **Phase-3 discovery:** `idempotency_hash` is a **NOT NULL column on `transactions`** (migration 004), not a separate table — so hash-free correction rows collide with the constraint. **Resolution (Opus disposition):** migration 006 rebuilds `transactions` (SQLite 12-step, migration-004 idiom) to relax `idempotency_hash` to nullable **gated by a kind-conditioned CHECK** — `original` rows must have a hash, `reversal`/`correcting` rows must have NULL. This turns the story-4.0 ACL boundary into a DB-level invariant (strengthens, not weakens). `saveCorrection` inserts both rows with `idempotency_hash = NULL`. Multiple NULLs are distinct under SQLite UNIQUE, so no collision. |
| **#180 (B1 non-atomicity of ledger-write + event-record)** — inherited by 4.2b's `record()` call, **not** this slice (4.2a only *returns* the event). | Note in 4.2b plan; tracked by #180. No action here. |
| Date-correction clarification diverges from the literal 4.0 note. | Recorded as a proposed model-note delta (user-approved 2026-07-06); reconcile into the 4.0 note at retro (§5). |
| FK `corrects_id → transactions(id)` requires `PRAGMA foreign_keys = ON`. | **Confirmed** — `src/infra/db/sqlite-client.ts` sets `pragma('foreign_keys = ON')` at connect. Integration test still asserts a dangling `corrects_id` is rejected. |
| `reason` (PII-adjacent) could leak via a log/error path. | 4.2a: Core `Result.fail` messages never echo `reason` (asserted in the input-guard tests). Log/error-boundary redaction at the `record()` call site is **4.2b's** concern — noted for that plan. |
| Split-correction (>2-entry) capability is deferred. | Guarded by an explicit `Result.fail` (scenario 8) + tracking issue [#183](https://github.com/xavierbriand/accounting/issues/183). No live data path produces >2-entry transactions. |

Deferred follow-ups: [#183](https://github.com/xavierbriand/accounting/issues/183)
(split-correction capability); #180 stays open as the UnitOfWork story that closes the audit
non-atomicity window for ingest + correction (B1 confirmed for 4.2a — see suggestion log).

### Implementation notes for Phase 3 (Sonnet)

- `CorrectionService.correct` is a natural fit for `Result.all([...])`
  ([result.ts](../../src/core/shared/result.ts)) over the reversal + correcting-entry
  `Transaction.create` results, rather than sequential `isFailure` checks.
- Watch function size (≤50 LOC): `correct` bundles reason-validation, currency-validation,
  the >2-entry guard, reversal construction (side-swap), correcting-entry construction
  (delta application + date rule), and event construction. Extract private helpers
  (`buildReversal`, `buildCorrecting`) to stay under the limit.
- `saveCorrection` continues the existing adapter style — prepared statements +
  `db.transaction(...)` wrapping both inserts (as in `save`/`saveBatch`).

## Verification plan

- `npm run lint && npm run build && npm test` green (DoD 1).
- Migration 006 idempotent — run `npm run migrate` twice, second is a no-op (DoD 2).
- Every new Core invariant has a property test (inv 1, 5) or unit test (2–4, 6–8) (DoD 3).
- 100% branch coverage on new `src/core/` files (`correction-service.ts`,
  `correction-changes.ts`, Transaction additions, event union).
- Integration test on real SQLite for `saveCorrection` + `findById` round-trip and FK/rollback.
- No `any`, no TODO, no dead code; commits follow §6.4 with the story id.

## Suggestion log

Phase 2: `plan-reviewer` (P1/P2/P3, 31 findings — most confirmations/N-A) + `sibling-overlap`
in parallel. Substantive findings dispositioned below; pure confirmations omitted.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P1: `CorrectionChanges.amount`/`account` mapping onto a multi-entry `Transaction` is underspecified (no txn-level amount/account; >2-entry splits undefined). | **ADOPT** | Scoped to the two-entry expense shape: `amount`→both entries, `account`→debit side, >2-entry→`Result.fail`. New scenario 8 + Domain-model/Selected-solution spec. Split-correction capability deferred to [#183](https://github.com/xavierbriand/accounting/issues/183). |
| 2 | P3: split-seam mismatch — #180 expects the atomic (B2) record-with-rows seam designed in 4.2's `CorrectionService`, but the plan records at the boundary (B1) in 4.2b. | **ADOPT** (B1) | User decision 2026-07-06: 4.2a follows 4.1's shipped B1 pattern; #180 stays the dedicated UnitOfWork story (commented on #180 to supersede its "design in 4.2" framing). |
| 3 | P2: `reason` is PII-adjacent but no test/plan line addresses redaction. | **ADOPT** (split) | 4.2a: Core `Result.fail` never echoes `reason` (asserted in input-guard tests). Log/error-boundary redaction at `record()` is 4.2b's concern (Risks + Domain-model note). |
| 4 | P1: scenario 7 (real-SQLite integration) grouped under a blanket "all in-process (R7)" heading alongside pure-unit tests. | **ADOPT** | Reworded the R7 heading to distinguish pure-unit/property (1–6, 8) from real-SQLite integration (7); both in-process, no subprocess. |
| 5 | P3: R13 "one slice = one behaviour" tension — slices 5/6/7 each bundle two Gherkin/property behaviours. | **ACKNOWLEDGE** | Reframed 5/6/7 as one cohesive behaviour each (field-change application; input-guard validation; invariant algebra) to keep the envelope in R13's 6–10 for a domain-dense service; Sonnet-round split contingency retained. |
| 6 | P1: date-correction clarification is a substantive change to signed-off invariant 6, not a wording tweak. | **ACKNOWLEDGE** | Already flagged as a proposed model-note delta (user-approved); reconcile into the 4.0 note at retro (§5). |
| 7 | P3: `correct` is a natural `Result.all([...])` candidate over the two `Transaction.create` results. | **ACKNOWLEDGE** | Recorded as a Phase-3 implementation note for Sonnet. |
| 8 | P3: `correct` bundles many responsibilities — function-size (≤50 LOC) risk. | **ACKNOWLEDGE** | Phase-3 note: extract `buildReversal`/`buildCorrecting` helpers; watch at Phase 4. |
| 9 | sibling-overlap: #180 adjacent (coordinate-with 4.2b, not this slice); #155/#156 satisfied upstream; no file/goal collision. | **ACKNOWLEDGE** | No blocking overlap. #180 cross-referenced in 4.2b's future plan. |

No un-tagged items; the single deferred capability links [#183](https://github.com/xavierbriand/accounting/issues/183).

## DoR checklist

- [x] Phase 0 (Model): derives from [story-4.0 model note](../domain/model-notes/story-4.0.md) (R24); date-correction clarification recorded as a proposed delta (user-approved).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): findings triaged above; no un-tagged items; deferred → #183.
- [ ] Draft PR with template sections 1–6 filled.
