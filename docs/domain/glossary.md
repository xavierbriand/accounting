# Glossary — the ubiquitous language

Every term the system speaks, defined for both partners — not just the one who codes. Entry shape: **Everyday definition** (one plain sentence) → **Example** (concrete, with numbers) → **Technical notes** (type, location, pattern, invariants).

User-authored; agents propose changes but never edit this file directly (see [README.md](README.md)). Terms marked *(forthcoming)* are reserved for Epic 4 and will be defined in its first modeling session.

Example names (Alex, Sam) are fixtures, never real people.

---

## Ledger

**Everyday definition.** The permanent household record of everything that happened with our money — nothing in it is ever erased or rewritten.

**Example.** The €54.30 supermarket run on April 21st is in the ledger forever. If we later realize it was actually €45.30, we don't edit it — we add a correction that puts the difference right.

**Technical notes.** Append-only SQLite tables (`src/infra/db/`), written through `TransactionRepository`. No `UPDATE`/`DELETE` on ledger rows — corrections are new balancing entries ([architecture.md § Ledger — append-only](../architecture.md)).

## Transaction

**Everyday definition.** One money event — a purchase, a salary, a transfer — recorded with where the money came from and where it went.

**Example.** "Groceries €54.30 on 2026-04-21": €54.30 leaves the joint account, €54.30 lands in the groceries category. Both sides are recorded together, always in balance.

**Technical notes.** **Aggregate root** — `Transaction` class in [src/core/ledger/transaction.ts](../../src/core/ledger/transaction.ts). Private constructor; `static create(draft): Result<Transaction>` enforces: ≥ 2 entries, non-negative amounts, single currency, debits == credits. Timestamps are ISO 8601 *with offset* to preserve receipt truth.

## Entry

**Everyday definition.** One side of a transaction — money leaving one place (a debit) or arriving somewhere (a credit).

**Example.** The groceries transaction has two entries: debit "expense: groceries" €54.30, credit "asset: joint account" €54.30.

**Technical notes.** **Value object** inside the Transaction aggregate — `Entry` interface (`account`, `side: 'debit' | 'credit'`, `amount: Money`), immutable, no identity of its own. Only reachable through its transaction.

## Double-entry invariant

**Everyday definition.** Every transaction must balance: the money going out equals the money coming in, to the cent, always.

**Example.** A €1,200.00 salary must appear as €1,200.00 credited to income and €1,200.00 debited to the account it lands in — €1,199.99 anywhere is rejected outright.

**Technical notes.** `sum(debits) == sum(credits)` checked in Core at construction time ([src/core/ledger/transaction.ts](../../src/core/ledger/transaction.ts)) — the repository can never receive an unbalanced transaction. Property-tested.

## Money

**Everyday definition.** An amount in a specific currency, stored exactly — the system never does approximate math on money.

**Example.** €10.00 is stored as 1000 cents + "EUR". Splitting €10.00 three ways gives €3.34 + €3.33 + €3.33 — the parts always re-add to exactly €10.00.

**Technical notes.** **Value object** — [src/core/shared/money.ts](../../src/core/shared/money.ts), immutable Dinero wrapper. Integer cents + ISO 4217 code (dual-column in storage); banker's rounding; allocations via Largest Remainder; cross-currency ops return `Result.fail` (mismatch is a failure, not a warning). Never `+ - * /` on monetary values.

## Partner

**Everyday definition.** One of the two people in the couple. The system exists to keep things fair between them.

**Example.** Alex and Sam. Alex earns more this year, so Alex covers 60% of shared costs and Sam 40%.

**Technical notes.** Identified by name in `accounting.yaml`; the partner roster is fixed across split-rule windows. PII rule: real names/IBANs never in fixtures or logs.

## Split rule

**Everyday definition.** The agreement about how shared costs divide between partners, valid from a given date until the agreement changes.

**Example.** From January 2026: Alex 60% / Sam 40%. From July 2026, after Sam's raise: 50/50. June expenses still split 60/40 — the old agreement applies to its own period.

**Technical notes.** Versioned rule resolved by `SplitRulesService` (**domain service**, [src/core/splits/split-rules-service.ts](../../src/core/splits/split-rules-service.ts)) using the validity window pattern. Ratios allocate via `Money.allocate` (Largest Remainder) so parts sum to the total.

## Validity window

**Everyday definition.** The period during which a particular version of a rule applies — from its start date until the next version begins.

**Example.** The 60/40 split starting January 1st is in force until the 50/50 split starts July 1st. There is no gap and no overlap — every date has exactly one applicable rule.

**Technical notes.** Our temporal-versioning pattern ([architecture.md § Versioning for rules](../architecture.md)): `validFrom` only; `validTo` is implicit (next window's `validFrom`; last window open-ended). No overlap-or-gap bugs by construction. Enables historical recalculation without event sourcing.

## Buffer

**Everyday definition.** A named pot of money set aside for a purpose — a cushion for surprises or a fund for something planned.

**Example.** "Car repairs" buffer: target €1,500 by December. "Vacation" buffer: target €3,000 by June, capped at €3,500 so we don't over-save into it.

**Technical notes.** Defined in `accounting.yaml` (target, optional cap, `targetDate`); balances derived from the ledger via the `BufferLedgerQuery` port. Domain type `BufferState` ([src/core/buffers/buffer-state.ts](../../src/core/buffers/buffer-state.ts)), a **value object**.

## Buffer status

**Everyday definition.** Whether a buffer is where it should be: still filling, on track, or overfull.

**Example.** Car-repairs buffer at €900 of €1,500 → *below*. At €1,500 → *on-target*. At €1,600 with a €1,500 cap → *above-cap* (the excess can flow back).

**Technical notes.** `BufferStatus = 'below' | 'on-target' | 'above-cap'`, derived by `BufferStateService` (**domain service**, [src/core/buffers/buffer-state-service.ts](../../src/core/buffers/buffer-state-service.ts)).

## Recurring rule

**Everyday definition.** A cost we know returns on a rhythm — rent monthly, insurance yearly — that the system projects forward so it's never a surprise.

**Example.** Rent: €1,400 monthly on the 1st. Car insurance: €720 every January. An *amendment* records the rent rising to €1,450 from September.

**Technical notes.** Cadence + amount + category in `accounting.yaml`; amendments follow the validity window pattern. Projected by `RecurringForecastService` (**domain service**, [src/core/recurring/recurring-forecast-service.ts](../../src/core/recurring/recurring-forecast-service.ts)); cadence math in [src/core/recurring/cadence.ts](../../src/core/recurring/cadence.ts).

## Forecast occurrence

**Everyday definition.** One predicted future bill — a specific cost expected on a specific date.

**Example.** "Rent, €1,400, expected 2026-08-01" is one occurrence; the same rule also yields the September and October occurrences.

**Technical notes.** **Value object** — `ForecastOccurrence` ([src/core/recurring/forecast-occurrence.ts](../../src/core/recurring/forecast-occurrence.ts)): name, category, `expectedDate`, `amount: Money`.

## Safe transfer

**Everyday definition.** The amount each partner should move to the joint account this month so that everything coming — bills, buffer top-ups — is covered without over-transferring.

**Example.** August needs €2,340 total: €1,400 rent + €720 insurance + €220 buffer top-ups. At 60/40 that's Alex €1,404, Sam €936.

**Technical notes.** `SafeTransferCalculation` ([src/core/transfer/safe-transfer-calculation.ts](../../src/core/transfer/safe-transfer-calculation.ts)): `totalRequired`, `perPartner` map, `lineItems`. Computed by `SafeTransferCalculator` (**domain service**); per-partner splits use the window-resolved split rule.

## Line item

**Everyday definition.** One row of the safe-transfer explanation — a single reason money is needed, so the total is never a mystery.

**Example.** "Forecast · 2026-08-01 · housing · Rent · €1,400 → Alex €840 / Sam €560" is one line item; the buffer top-up for car repairs is another.

**Technical notes.** **Value object** — `LineItem` ([src/core/transfer/line-item.ts](../../src/core/transfer/line-item.ts)): `kind: 'forecast' | 'buffer-topup'`, date, category, description, `gross`, `perPartnerSplit`.

## Idempotency hash

**Everyday definition.** A fingerprint of each imported bank row, so importing the same statement twice can never create duplicate records.

**Example.** Re-importing March's CSV after a laptop swap: all 47 rows are recognized by fingerprint and skipped; the ledger stays clean.

**Technical notes.** Computed by `IdempotencyService` ([src/core/ingest/idempotency-service.ts](../../src/core/ingest/idempotency-service.ts)) over canonicalized row content via the `HashFn` port; known hashes persisted through `HashRepository`.

## Canonicalization

**Everyday definition.** Translating each bank's messy export format into the one clean shape the system understands.

**Example.** The bank writes `"21/04/2026;CB CARREFOUR 54,30-"`; canonicalization turns it into date 2026-04-21, description "CB CARREFOUR", amount −€54.30.

**Technical notes.** **Anti-corruption layer** between bank CSV dialects and the domain — [src/core/ingest/canonicalize.ts](../../src/core/ingest/canonicalize.ts) plus the `CsvParser` port. Malformed rows are skipped and reported individually at parse stage; valid rows commit atomically (two-stage batch policy, [prd.md](../prd.md)).

## Snapshot

**Everyday definition.** A safety copy of the database taken before anything risky, so we can always step back to the moment before.

**Example.** Before committing an 82-row import, the system snapshots the database; if the commit fails halfway, nothing is lost.

**Technical notes.** Atomic, fail-safe pre-commit backup via the `SnapshotService` port; the append-only spirit applied to files.

---

## Reserved for Epic 4

## Soft edit *(forthcoming)*

**Everyday definition.** Fixing a mistake without erasing history — the correction is itself a recorded event.

**Technical notes.** Reversal + new balancing entries per the append-only decision; vocabulary to be modeled in Epic 4's first Phase-0 session (FR19/FR20).

## Audit trail / domain event *(forthcoming)*

**Everyday definition.** The answer to "why does it say that?" — a trace of every meaningful thing the system did, in order.

**Technical notes.** Domain events as plain value objects recorded via a Core port ([architecture.md § Domain events](../architecture.md)); to be modeled in Epic 4's first Phase-0 session (FR23, FR14).
