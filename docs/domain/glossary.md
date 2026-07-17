# Glossary — the ubiquitous language

Every term the system speaks, defined for both partners — not just the one who codes. Entry shape: **Everyday definition** (one plain sentence) → **Example** (concrete, with numbers) → **Technical notes** (type, location, pattern, invariants).

User-authored; agents propose changes but never edit this file directly (see [README.md](README.md)). Terms marked *(forthcoming)* are reserved for a later Epic-4 story and will be defined when it ships.

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

## Settlement

**Everyday definition.** The monthly moment when both partners square up: each moves their share to the joint account, and the couple checks how last month actually went.

**Example.** On August 1st, Alex moves €1,404 and Sam €936 to the joint account, and together they check July: the transfers landed as suggested, and the car buffer's top-up explains why August asks for more.

**Technical notes.** A domain moment, not a stored record — the `settle` write-command remains future PRD scope; story-4.3 ships the read model that powers the conversation (`src/core/settlement/`). See [model-notes/story-4.3.md](model-notes/story-4.3.md).

## Settlement variance

**Everyday definition.** The itemized story of why this month's suggested transfer differs from last month's, plus the follow-through check — every number backed by math either partner can recheck.

**Example.** "August asks €240 more than July: car insurance is due (+€720), June's one-off vet top-up dropped away (−€480). In July you actually sent €2,100, matching the suggestion."

**Technical notes.** **Value object** `SettlementVariance` (`src/core/settlement/`), assembled by `SettlementVarianceService` (**domain service**) from two `SafeTransferCalculation`s — the existing calculator run for this settlement window and the previous one — plus last month's Contributions. Pure read model: nothing persisted, no events. Penny-perfect by invariant: line deltas sum exactly to the total change (property-tested). See [model-notes/story-4.3.md](model-notes/story-4.3.md).

## Variance line

**Everyday definition.** One row of that story: a single cause (a bill, a buffer top-up) with its signed change, total and per partner. A cause is tracked month-to-month by the same name; a renamed rule honestly reads as one cause disappearing and a new one appearing.

**Example.** "Car insurance · new this month · +€720 → Alex +€432 / Sam +€288" is one variance line; "Vet top-up · gone · −€480" is another.

**Technical notes.** **Value object** `VarianceLine`: identity via `LineItemKey` (`kind`, `category`, `description` — exact match, total order for stable output), `presence: 'both' | 'this-only' | 'last-only'`, signed `Money` deltas (total and per partner). Per-partner deltas use each month's own window-resolved split rule, so a split change surfaces as movement even when the line's total is unchanged.

## Follow-through

**Everyday definition.** The check on what actually happened: last month's real transfers into the joint account versus this month's suggestion, partner by partner.

**Example.** "In July you sent €2,100 (Alex €1,260, Sam €840); August asks €2,340 — €240 more (Alex +€144, Sam +€96)."

**Technical notes.** **Value object** `FollowThrough` — always per-partner: every settlement account in `accounting.yaml` names its partner (roster-checked at config load), so every Contribution is attributed by construction. A totals-only fallback was modeled and then dropped at story-4.3a Phase 4 as unreachable (see the model note's Phase-4 refinement). `totalActual` always equals the ledger's net credit sum on the settlement account(s), so corrections net out by construction.

## Contribution

**Everyday definition.** One partner's real transfer into the joint account, as recorded in the ledger. (The word the status prose already uses: "Alex contributes €960".)

**Example.** July's two credits — Alex's €1,260 on the 1st, Sam's €840 on the 2nd — are July's contributions.

**Technical notes.** Read through the `ContributionQuery` **port**: credit entries on the settlement account(s) named in `accounting.yaml`'s `settlement:` section, attributed to partners by the account each transfer was tagged to at ingest (autoTagRules). Bank statement wording never enters the domain — the anti-corruption layer keeps it at the edge.

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

## Correction

**Everyday definition.** Fixing a past transaction by recording new balancing entries instead of erasing it — the original stays on the record, a reversal cancels it, and a correcting entry posts the truth alongside. Every correction says why it was made.

**Example.** The €54.30 supermarket run on April 21st was really €45.30. A correction leaves the €54.30 line untouched, adds a *reversal* that cancels it, and writes a *correcting entry* of €45.30 — all three dated April 21st, with the reason "wrong amount on the receipt". All three stay visible; together they net to €45.30.

**Technical notes.** **Reverse-and-correct** (accounting practice: a reversing entry backs the error out, a correcting entry posts the truth — FR14): `CorrectionService` (**domain service**) writes two new balanced transactions — a reversal and a correcting entry — via the append-only ledger; the original is never touched. The CLI verb is `correct` (FR14); "soft edit" is retired. `Transaction` carries `correctsId` + `kind` ([src/core/ledger/transaction.ts](../../src/core/ledger/transaction.ts)). The reversal always carries the original's `occurredAt`; the correcting entry carries it too **except when the date itself is corrected**, in which case the correcting entry takes the new date (the reversal still keeps the original date, so the original nets out in its own period). No clock in Core. Any field may change (amount, account/category, date, description); a free-text reason is **required** (PII-adjacent — redacted in logs). A correcting entry may itself be corrected (unlimited `correctsId` chain). Emits a `TransactionCorrected` domain event. See [model-notes/story-4.0.md](model-notes/story-4.0.md).

## Reversal

**Everyday definition.** A mirror-image entry that cancels an earlier transaction without deleting it — the same amounts, with debits and credits swapped.

**Example.** To correct the €54.30 groceries line, a reversal debits and credits the same accounts the opposite way, netting the original to zero.

**Technical notes.** One of the two transactions a correction writes (`kind: 'reversal'`, `correctsId` set); balanced like any `Transaction`; carries the original's date. The accounting term is a *reversing entry*.

## Correcting entry

**Everyday definition.** The corrected version of a transaction, written fresh next to the reversal so both the mistake and the fix stay on the record.

**Example.** After the reversal cancels the €54.30, the correcting entry records the true €45.30 — same date, corrected amount.

**Technical notes.** The second transaction a correction writes (`kind: 'correcting'`, `correctsId` set); itself correctable via a later correction (chaining). Standard bookkeeping term for the re-posting that fixes a booked error.

## Audit trail / domain event

**Everyday definition.** An in-order record of every meaningful thing the system did — a statement imported, a transaction corrected, a rule changed, the data wound down — so we can always answer "why does it say that?"

**Example.** Correcting the groceries amount records a "transaction corrected" event; next December's config apply records a "config changed" event. Read in order, they explain how today's numbers came to be.

**Technical notes.** Plain immutable value objects in Core (`src/core/events/`), recorded through the `DomainEventRecorder` port ([architecture.md § Domain events](../architecture.md), #155); Infra persists them append-only. No base class, no dispatcher, no event sourcing. Names are past-tense (`TransactionCorrected`, `TransactionIngested`, `ConfigChanged`, `DataExported`, `DissolutionPerformed`). The recording timestamp is a system event (UTC) stamped at the boundary; no actor is recorded (no auth system).

---

## Configuration (accounting.yaml)

**Everyday definition.** The household's own rule file — accounts, splits, buffers, recurring rules — written and owned by the couple.

**Example.** `accounts: [{ id: joint-dkb, … }]` — the couple's labels, never bank secrets.

**Technical notes.** **PII-safe by construction:** no field is designed to hold bank identifiers or other sensitive values; a parse-time tripwire rejects IBAN- and card-number-shaped strings anywhere in the file with a path-cited error. This invariant is what lets config-change diffs and the export bundle quote values verbatim. User-typed free text is the couple's own and is not policed. See [model-notes/story-4.5.md](model-notes/story-4.5.md).

## Config change

**Everyday definition.** The recorded fact that the household's rules file differs from what the system last saw — with exactly what changed, old and new.

**Example.** Raising the Car buffer target in a text editor; the next command notices and records "buffers: Car target €1,500 → €1,800".

**Technical notes.** Ambient detection at the app boundary on every command run: `ConfigChangeDetector` (pure domain service) diffs the live config against the last-seen state (`config_state` via the `ConfigStateStore` port; digest via `HashFn` over a canonical form — distinct from the ingest **Canonicalization** term). Emits `ConfigChanged` with `origin: 'external' | 'applied'`; Epic-5 `plan --apply` fills `'applied'`. Cosmetic YAML edits (key order, whitespace, comments) never emit. The sanctioned exception to story-3.5's read-only `status` criterion.

## Export bundle

**Everyday definition.** The portable archive of everything the household owns — ledger, audit trail, and a copy of the rules — readable by other tools.

**Example.** Before switching apps, the couple exports the bundle and opens the CSVs in a spreadsheet to check every year is there.

**Technical notes.** Machine-readable CSV + JSON, produced by `DataExporter`; identified by its manifest hash — the export-proof that later authorizes a wipe. Its own trail includes the `DataExported` event that produced it.

## Dissolution

**Everyday definition.** Winding the household's data down — exporting everything to a portable bundle, then securely resetting the ledger — as two deliberate, recorded acts.

**Example.** Moving to another tool: export the bundle, confirm the new tool reads it, and days later run the wipe with the export's proof; a receipt notes what happened and where the history lives.

**Technical notes.** Graceful Dissolution (FR21). Act 1: export (standalone — `DataExported`). Act 2: wipe, gated on a matching export-proof (`DissolutionPerformed`, persisted in the dissolution receipt, not the wiped DB). Wipes the SQLite DB + snapshots; preserves `accounting.yaml` and the receipt. Boundary-orchestrated via the `DataExporter`/`StoreReset` ports. See [model-notes/story-4.5.md](model-notes/story-4.5.md).

## Dissolution receipt

**Everyday definition.** The small note left behind after a wipe, so an empty app can still say what happened and where the history went.

**Example.** Opening the app after dissolution shows: wound down on 12 March, archive at `~/exports/household-2027`.

**Technical notes.** A local file holding the `DissolutionPerformed` event plus the bundle's manifest hash and location; written durably *before* the stores are reset; survives the wipe alongside `accounting.yaml`.
