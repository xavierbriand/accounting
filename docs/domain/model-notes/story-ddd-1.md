# Model note — story-ddd-1

*(Template: [docs/templates/model-note.md](../../templates/model-note.md). This first note is retrospective: it names the model already latent in the shipped system rather than designing a new one.)*

## Domain question

What is the domain model this system has been quietly using since Epic 1 — and what should each piece be called so both partners, and every agent, use the same words?

## Terms

- **Added (glossary seed):** Ledger, Transaction, Entry, Double-entry invariant, Money, Partner, Split rule, Validity window, Buffer, Buffer status, Recurring rule, Forecast occurrence, Safe transfer, Line item, Idempotency hash, Canonicalization, Snapshot; reserved *(forthcoming)*: Soft edit, Audit trail / domain event.
- **Used / changed:** none pre-existed in written form.

## Model

One bounded context, **Shared Finances** (see [context-map.md](../context-map.md)). Tactical roles, named from existing code:

- `Transaction` — **aggregate root** (`src/core/ledger/transaction.ts`); `Entry` a value object inside it; consistency boundary = one balanced transaction.
- `Money` — **value object** (`src/core/shared/money.ts`); `BufferState`, `ForecastOccurrence`, `LineItem`, `SafeTransferCalculation` — value objects.
- `SplitRulesService`, `BufferStateService`, `RecurringForecastService`, `SafeTransferCalculator`, `IdempotencyService` — **domain services** (stateless policy/derivation).
- Ports (`TransactionRepository`, `BufferLedgerQuery`, …) — **repositories**/gateways; ingest canonicalization — **anti-corruption layer**; validity window — house temporal-versioning pattern.

## Invariants

All already enforced and tested; recorded here as the model's ground truth:

1. Double-entry: `sum(debits) == sum(credits)` at construction (property-tested).
2. Transaction: ≥ 2 entries, non-negative amounts, single currency.
3. Allocation: split parts re-sum to the total to the cent (Largest Remainder, property-tested).
4. Currency mismatch is `Result.fail`, never a warning.
5. Ledger rows are never updated or deleted.
6. Every date resolves to exactly one rule version per rule kind (validity windows: no gap, no overlap).

## Events

None emitted today. The append-only ledger is already event-shaped; explicit domain events (plain value objects via a `DomainEventRecorder` port) are reserved for Epic 4 (FR23 audit trail, FR19/20 soft edits) — see [architecture.md § Domain events](../../architecture.md).

## Rejected alternatives

- Multiple bounded contexts now — no second language community exists; recorded as an Epic-5 tripwire instead.
- Marker abstractions (`AggregateRoot`/`ValueObject` base types) — naming lives in docs and reviews; the type system gains nothing today.
- Retrofit folder restructure of `src/core/` — churn without behaviour change; module names live in the context map.

## Sign-off

- User: approved with the story-ddd-1 plan (plan-mode approval, 2026-07-03).
