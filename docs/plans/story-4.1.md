# Story 4.1 — DomainEventRecorder Port & Append-Only Event Store

## Context

Epic 4 (Trust, Transparency & Lifecycle) needs an immutable, ordered **audit trail** (FR23):
every meaningful action recorded as a plain domain event. Story-4.0 (the Epic-4 defining
session, issue #156) modelled the vocabulary and sliced the epic; this story ships the
**spine** — the `DomainEventRecorder` port (#155) + an append-only Infra event store — wired
to the simplest existing action (ingest) emitting the first event, `TransactionIngested`.
Every later event (4.2 `TransactionCorrected`, 4.5 `ConfigChanged`/`DissolutionPerformed`,
Epic-5 Story 5.4) depends on this port.

**FR/NFR:** FR23 (Audit Trail) — the spine only; later events complete the coverage.

**Deferred-decision resolved here (from story-4.0 model note § Event-timestamp boundary):**
the recorder **call-site** for a ledger-mutating event. Decided **B1 (app-boundary)** — see
Selected solution.

### Maintenance sub-loop (§ 6.7) run 2026-07-05 pre-planning

- **Sibling work check.** `gh pr list --state open` → none. `gh issue list --state open` → 34
  open issues reviewed; #155 (this port) and #156 (Epic-4 def) are the parents, not competitors.
  No open PR/issue is building the event store. No overlap.
- **Story-id uniqueness.** `git ls-tree -r origin/main … | grep story-4.1` → none. No open PR
  branch named story-4.1. Id free.
- **Working tree clean.** `git status` clean; branch `story-4.1` cut from `origin/main` (HEAD c1712e1).
- **Open issues.** 34 open; `deferred-suggestion` items remain relevant; none block this story.
- **Backlog refinement.** Not re-run this sub-loop (last pass current); tracker coordinating.
- **Open PRs.** None (no Dependabot in flight).
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** clear. Full lane (touches `src/core/` + new migration).

## Story

> As the **System**, I want a Core `DomainEventRecorder` port with an append-only Infra event
> store, wired first to the ingest path emitting a `TransactionIngested` event, so that every
> meaningful action from here on can be recorded as an immutable, ordered audit trail (FR23) —
> starting with the simplest existing action to prove the pattern.

## Domain model

Derives from the Phase-0 model note [docs/domain/model-notes/story-4.0.md](../domain/model-notes/story-4.0.md)
(R24 — Epic-4 numbered stories derive their Domain-model section from the 4.0 note; no fresh
model-session for 4.1, whose events the 4.0 note already models).

- **Glossary terms used:** Audit trail / domain event, `TransactionIngested`, Ledger, Transaction,
  Partner, Money. All already in [docs/domain/glossary.md](../domain/glossary.md) (promoted from
  *forthcoming* in story-4.0). **No new vocabulary → no glossary edit this story.**
- **Tactical roles introduced:**
  - `DomainEvent` / `TransactionIngested` — **plain immutable value objects** in a new
    `src/core/events/`. No base class, no dispatcher, no event sourcing (architecture.md §
    Domain events).
  - `DomainEventRecorder` — **Core port** (`src/core/ports/`); Infra persists append-only.
- **Invariants the diff must not violate:**
  1. Core stays pure — `src/core/events/` and the port import no Node APIs, no `better-sqlite3`,
     no clock. The recording timestamp is **not** a Core field.
  2. Append-only — the event store is INSERT-only; no `UPDATE`/`DELETE` (ledger rule extends to
     the audit trail).
  3. Ordered — events carry a monotonic sequence (autoincrement id) so they read in order.
  4. Event payload carries **no raw PII** (no descriptions; account ids and transaction ids only).
- **Events emitted:** `TransactionIngested` (first event; proves the recorder + store).

## Selected solution

**A Core `DomainEventRecorder` port + a `SqliteDomainEventRecorder` writing to a new append-only
`domain_events` table, recorded at the app boundary (B1) after a successful ingest batch commit.**

Four pieces:

1. **Core event value objects** — `src/core/events/domain-event.ts`:
   ```ts
   export interface TransactionIngested {
     readonly type: 'TransactionIngested';
     readonly transactionIds: readonly string[];
     readonly sourceAccount: string;
   }
   export type DomainEvent = TransactionIngested;   // union grows in 4.2 / 4.5
   ```
   Domain fields only — **no timestamp** (no clock in Core).

2. **Core port** — `src/core/ports/domain-event-recorder.ts`:
   ```ts
   export interface DomainEventRecorder {
     record(event: DomainEvent): Result<void>;
   }
   ```

3. **Infra store** — migration `005-domain-events.sql` + `SqliteDomainEventRecorder`. The recorder
   stamps the **recording timestamp** into a `recorded_at` column (UTC ISO, system event) at
   `record()` time and serializes the event's domain fields to a JSON `payload`. Ordering via
   autoincrement `seq`. **Column named `recorded_at`, not `occurred_at`** — deliberately distinct
   from `transactions.occurred_at` (receipt-truth transaction date): the audit column is a system
   clock value (closer to `transactions.created_at`), and reusing `occurred_at` would be a
   same-name-different-meaning collision across the schema (P3 review).

4. **Wiring (B1)** — `commitBatch` (ingest) calls `recorder.record(TransactionIngested{…})`
   **immediately after** `saveBatch` succeeds, built from the committed outcomes' transaction ids
   + source account. Composition root (`program.ts`) constructs `new SqliteDomainEventRecorder(db)`.

**Call-site = B1 (app-boundary), decided here.** Rationale: ingest is orchestrated at the app
boundary with **no Core domain service**, so the boundary is its natural seam; keeps
`DomainEventRecorder` cleanly separate from `TransactionRepository` (no event vocabulary leaking
into the ingest-ACL port — respects the #155 firewall note); leanest path that proves the
port + store end-to-end, matching the story's "simplest action to prove the pattern" charter.
This is consistent with the 4.0 note's *hybrid* model, not a contradiction of its "atomic with
the rows" line: that line targets **domain-service-mediated** ledger mutations (4.2's
`CorrectionService` returns `{reversal, correcting, event}` together and will record atomically),
which ingest is not.

**Known limitation (documented, deferred):** B1 is **not atomic** — a process crash between the
batch commit and `record()` leaves a committed batch with no ingest event. Low impact: rare, and
a re-run is idempotent (duplicates skipped) so no double ledger rows; the audit gap is
recoverable. A `UnitOfWork`/atomic-record path is deferred to story 4.2, where a ledger-mutating
event genuinely needs it. → Phase-2 deferred issue.

**Alternatives set aside:**
- **B2 (atomic inside `saveBatch`)** — grows the `TransactionRepository` port with event
  vocabulary (mixes ingest-ACL + audit concerns the model note keeps apart) or needs a
  `UnitOfWork` port now; more machinery than a spine story warrants.
- **Per-transaction events** (N events per ingest) — noisier; the meaningful *action* is the
  ingest run, so one batch-level event with `transactionIds[]` mirrors it (and mirrors
  `TransactionCorrected`'s `producedTransactionIds[]`).
- **Per-event-type columns** — a wide table per event shape; JSON `payload` keeps the store
  schema-stable as event types grow, matching "plain value objects."

## Production-code surface (R2)

**New files:**
- `src/core/events/domain-event.ts` — `DomainEvent` union + `TransactionIngested`.
- `src/core/ports/domain-event-recorder.ts` — `DomainEventRecorder` interface.
- `src/infra/db/migrations/005-domain-events.sql` — append-only `domain_events` table, `PRAGMA user_version = 5`.
- `src/infra/db/repositories/sqlite-domain-event-recorder.ts` — `SqliteDomainEventRecorder`.

**Changed signatures / wiring:**
- `IngestCommandDeps` (`src/cli/commands/ingest-command.ts`) — add
  `readonly domainEventRecorder: DomainEventRecorder`.
- `commitBatch` — **two** signature changes (both called out in slice 5): (a) its deps `Pick`
  grows `'domainEventRecorder'`; (b) a **new `sourceAccount: string` parameter** threaded in from
  `runIngestCommand` (which holds `account.id`) — `BuildOutcome` carries no `sourceAccount`, so it
  can't be derived from `outcomes` alone. The event is built inside `commitBatch` from the
  committed outcomes' `transaction.id`s + `sourceAccount`.
- `src/cli/program.ts` — construct `SqliteDomainEventRecorder(db)`, pass into ingest deps.
  (**program.ts touched → R4 composition-root subprocess test required.**)

**Output-format changes:** none (no read surface yet; ingest stdout/stderr unchanged).

**DB schema:**
```sql
CREATE TABLE domain_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,     -- monotonic order
  event_type  TEXT NOT NULL,
  recorded_at TEXT NOT NULL,                          -- UTC ISO, stamped at record() (system clock, NOT receipt truth)
  payload     TEXT NOT NULL                           -- JSON of domain fields
);
PRAGMA user_version = 5;
```
Append-only: INSERT-only by convention (mirrors `transactions`/the ledger — no DB trigger there
either; convention-only is house style, not a regression).

**Forward pointer (Zod):** 4.1 has no read surface, so the JSON `payload` is write-only here. The
future story that *reads* `domain_events.payload` back out must Zod-validate it at the Infra
boundary (never in Core) before reconstructing an event — noted so the consumer story picks it up.

## Gherkin acceptance scenarios

Feature file: `tests/features/audit-trail.feature`. The `correct`/read surfaces arrive later; 4.1
is observed by inspecting the `domain_events` table after a real ingest.

```gherkin
Scenario: Ingesting a statement records a TransactionIngested event
  Given a fresh migrated database and a valid single-row BPCE statement
  When I ingest it non-interactively
  Then the audit trail holds one TransactionIngested event
  And its payload lists the committed transaction id and source account
```
- **fails if:** the ingest path does not call `recorder.record(...)` after `saveBatch` succeeds
  (guards the B1 wiring in `commitBatch` + the `program.ts` composition-root construction).
- **classification:** **subprocess** (real CLI via `program.ts`, real SQLite) — this is the R4
  composition-root test.
- **fixture note (R6/R7 honesty):** the existing `ingest-end-to-end-wiring.test.ts` uses a
  low-confidence fixture and asserts **exit 2** — it never reaches `commitBatch`. This scenario
  needs a **new single-row fixture whose row auto-tags high-confidence** (matches an auto-tag rule
  in the stub `accounting.yaml`) so `ingest --non-interactive` reaches a successful commit
  (**exit 0**) and thus `record()`. Without that, the `fails if` clause is never exercised.

```gherkin
Scenario: A failed batch commit records no event
  Given a fresh migrated database
  And a statement whose commit will fail (simulated saveBatch failure)
  When I run the ingest commit
  Then no event is recorded in the audit trail
```
- **fails if:** `record(...)` is called before/independently of `saveBatch` success (guards the
  "only on success" ordering in `commitBatch`).
- **classification:** **in-process** unit on `commitBatch` with a failing `transactionRepository`
  stub + a spy recorder (no subprocess — a pure ordering assertion).

Store-level append-only + ordering are covered by an **integration** test on
`SqliteDomainEventRecorder` (see Verification plan), not a Gherkin scenario (they assert on Infra
mechanics, not user-observable behaviour).

## Slice plan

Full lane, target 6–10 commits (R13); one slice = one behaviour. Subjects carry the story id
(§ 6.4, R12).

0. `chore(docs): story-4.1 plan + P1/P2/P3 review` — this plan + suggestion log (pre-Phase-3, not counted in behaviour slices).
1. `test/feat(db): story-4.1 domain_events append-only table — migration 005` — migration + idempotent-apply integration test, `user_version = 5`.
2. `test/feat(core): story-4.1 TransactionIngested event + DomainEventRecorder port` — Core value object + port; unit test on event shape + a Core-purity assertion (no forbidden imports).
3. `test/feat(infra): story-4.1 SqliteDomainEventRecorder append-only, ordered, UTC-stamped` — integration test (real SQLite): record two events → strictly increasing `seq`, UTC `recorded_at`, JSON payload round-trips (no raw PII); insert-only.
4. `test/feat(cli): story-4.1 ingest records TransactionIngested on successful commit` — **subprocess** acceptance (R4): new high-confidence single-row fixture → exit 0 → one `domain_events` row; wire `SqliteDomainEventRecorder` through `program.ts` + thread `sourceAccount`/recorder into `commitBatch`.
5. `test/feat(cli): story-4.1 no event on failed batch commit` — **in-process** `commitBatch` unit with a failing `transactionRepository` stub + spy recorder → recorder never called (the success-ordering guard, unbundled from slice 4).
6. `refactor(events): story-4.1 <cleanup>` — or empty slot with justification (R11) if none needed.
7. `chore(retro): story-4.1 Keep/Change/Try + status fragment` — retro + `docs/status.d/` fragment (advances the "Next" line → status.md edit; R17).

7 counted behaviour slices (was 6 — slice 4 unbundled into 4+5 per P3 review; now mid-band of R13's 6–10).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| B1 non-atomicity (crash between commit and `record`) | Documented limitation; idempotent re-run bounds impact. **Deferred issue:** atomic-record via `UnitOfWork` when 4.2's `CorrectionService` needs it. |
| Migration ordering quirk (001/002 don't bump `user_version`; 003/004 do) | 005 sets `PRAGMA user_version = 5` like 003/004; idempotent-apply test asserts no re-run. |
| PII leaking into `payload` | Payload carries only `transactionIds` + `sourceAccount` (account id, not a name/IBAN); no descriptions. Assert in the recorder test. |
| `program.ts` regression (R4) | Composition-root subprocess acceptance test exercises the wired recorder end-to-end. |

Deferred follow-ups each get a GitHub issue at Phase-2 tagging.

## Verification plan

- `npm run lint && npm run build && npm test` green (DoD 1).
- **Migration idempotency (DoD 2):** integration test runs `005` twice → second run a no-op
  (`user_version` already 5); table + schema assertions.
- **Append-only + ordering:** integration test on `SqliteDomainEventRecorder` — two `record()`
  calls → `seq` strictly increasing, `recorded_at` parses as UTC ISO, `payload` JSON round-trips,
  payload holds no descriptions (PII assertion), no update/delete path exposed.
- **B1 wiring (R4):** subprocess ingest via `program.ts` on a real temp DB → assert one
  `domain_events` row with the committed transaction id.
- **Ordering-on-failure:** in-process `commitBatch` unit with a failing repo stub → recorder spy
  never called.
- **Core purity:** unit/lint assertion that `src/core/events/` + the port import no `better-sqlite3`,
  no Node APIs, no clock.
- **100% branch coverage on new `src/core/` files** (DoD; event value object + port are trivial
  but covered).

## Suggestion log

<!-- Filled at Phase 2 (plan-reviewer + sibling-overlap in parallel). Every row tagged ADOPT / DEFER (issue link) / REJECT (reason) / ACKNOWLEDGE. -->

Phase 2 ran `plan-reviewer` + `sibling-overlap` in parallel. `sibling-overlap`: **no overlap**
(#155/#156 confirmed parents; #93/#103/#104/#107/#109/#110 are categorize/auto-tag scoped, not
`commitBatch`; #77 is `transaction_entries` indexing — no migration-number/goal collision). Of
`plan-reviewer`'s 31 findings, most confirm conformance (P1/P2/P3 "conforms", 8 N/A rule-tags);
the actionable ones:

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P3 naming-drift: `domain_events.occurred_at` collides semantically with `transactions.occurred_at` (receipt-truth) — it's a system recording clock | **ADOPT** | Column renamed `recorded_at`; distinctness noted in Selected solution + schema. |
| 2 | P1: existing `ingest-end-to-end-wiring.test.ts` hits exit 2 (low-confidence) and never reaches `commitBatch`; the subprocess scenario needs a fixture that reaches a successful commit or its `fails if` is never exercised | **ADOPT** | Fixture note added to scenario 1 (new high-confidence single-row fixture → exit 0); called out in slice 4. |
| 3 | P1: threading `sourceAccount` into `commitBatch` is a second signature change (new parameter), not just a deps-`Pick` widen — under-stated in Production-code surface | **ADOPT** | Production-code surface now enumerates both `commitBatch` changes; slice 4 names the param. |
| 4 | P3 slice health: slice 4 bundled 6 sub-changes; 6 counted slices sat at the low edge of R13 | **ADOPT** | Slice 4 split into 4 (success wiring + acceptance) and 5 (failure-ordering unit) → 7 slices, mid-band. |
| 5 | P3 Zod forward-pointer: a future story reading `payload` back needs boundary validation; plan didn't note it | **ADOPT** | Forward-pointer note added under the schema (Zod at Infra boundary on read-back; out of scope for 4.1). |
| 6 | P2 coherence: B1 non-atomicity is a narrow tension with QA "every action leaves a traceable entry" | **DEFER** | [#180](https://github.com/xavierbriand/accounting/issues/180) — atomic-record via `UnitOfWork`, designed in 4.2 (`CorrectionService`). QA invariant read as holding in the successful case; documented limitation. |
| 7 | P3 soft: use `Result.flatMap`/`map` for the `saveBatch → record` chain in `commitBatch` | **REJECT** | `commitBatch` uses explicit `isFailure` branching throughout for per-branch stderr messaging; a mid-function combinator would break house style. CLI-boundary code — combinator use is optional, not a purity rule. |
| 8 | P3: append-only is convention-only (no DB trigger) | **ACKNOWLEDGE** | Matches the existing `transactions`/ledger house style (no trigger there either); consistent, not a regression. Noted in schema. |
| 9 | P3: migration SQL field-comment necessity | **ACKNOWLEDGE** | Phase-4 comment-necessity check (per engineering-standards § Style). Comments kept brief and label-style, mirroring 002/004. |

No un-tagged findings; the one DEFER links [#180](https://github.com/xavierbriand/accounting/issues/180).

## DoR checklist

- [x] Phase 0 (Model): derives from story-4.0 model note (R24); no fresh model-session (events already modelled there); no glossary delta this story.
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): findings triaged above; DEFER links #180.
- [ ] Draft PR with template sections 1–6 filled (on approval).
