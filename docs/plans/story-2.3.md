# Epic 2, Story 2.3 — Transaction Builder & Auto-Tagging Domain Service

## Context

Stories 2.1 (CSV parser) and 2.2 (idempotency filter) are merged. Story 2.3 consumes the `fresh` `IngestItem`s that survive dedup and turns each one into a balanced double-entry `Transaction` via regex-based auto-tagging + a CoA-style account-name scheme. No persistence (Story 2.5), no CLI (Story 2.4).

**Problem.** `IngestItem` carries `{ sourceAccount, occurredAt, direction, description, amount }` but no category and no opposing ledger account. Turning this into a valid double-entry requires (a) deciding the *category* (`Expense:Transport`, `Income:Refund`, etc.) via description regex, (b) deciding the *opposing real account* based on the source-account type (bank vs card), and (c) handling the BPCE card-settlement special case from issue #26 (the monthly "PAIEMENT CARTE X####" lines on the main account must be classified as internal transfers — not as expenses — to avoid double-counting against the per-card granular statements).

**Maintenance sub-loop** (pre-planning, CLAUDE.md § 6.7): `npm audit` clean, zero Dependabot PRs, 13 open issues (all deferred or dependencies). Story 2.2's retro action A already landed (plans live in `docs/plans/`; this file is proof). CLAUDE.md § 1 "Current position" line needs a one-line refresh to "Next story: 2.4" as commit 1.

## Story (verbatim from [docs/epics.md](docs/epics.md))

> As a System, I want to auto-assign categories to transactions and convert them into balanced double-entry sets, so that raw bank lines become valid accounting entries.
>
> **AC1:** matches "Uber" to the "Transport" bucket via regex rules.
> **AC2:** creates a `Transaction` with two entries: Debit `Expense:Transport`, Credit `Liabilities:CreditCard` (or the bank-source equivalent).
> **AC3:** verifies `Sum(Debits) == Sum(Credits)` — inherited from existing [Transaction.create()](src/core/ledger/transaction.ts:49) invariants.

FR coverage: **FR6** (auto-tagging by description), **FR15** (double-entry consistency). Walks QA invariant "Every recorded transaction satisfies `sum(debits) == sum(credits)`" + "No silent data loss — no line is dropped silently."

## Selected solution

Three Core concerns + one config change, no new ports.

- **Config additions** — two new `AccountConfig` fields:
  - `type: 'bank' | 'card'` (required enum). Determines the opposing ledger account: bank IngestItems map to `Assets:Bank:<id>`, card IngestItems to `Liabilities:CreditCard:<id>`.
  - `cardSuffix?: string` — optional, required **only when `type: 'card'`**. Explicit last-4 digits matching the bank's "PAIEMENT CARTE Xnnnn" line (e.g., `"1234"`). Revised per Plan agent pushback: the first draft matched the suffix against `id.endsWith(…)`, which silently collides if a bank account id also ends in those 4 digits (e.g., `bank-91234` vs `card-1234` → both end in `1234`). Explicit `cardSuffix` is unambiguous, documents the real BPCE field, and survives id rename.

- **Account-name convention** — CoA-style colon-delimited strings, established in Story 2.3 because nothing writes to `transaction_entries.account` yet:
  - Category accounts: `Expense:<Category>`, `Income:<Category>` (e.g., `Expense:Transport`, `Income:Refund`).
  - Real accounts: `Assets:Bank:<sourceAccount-id>`, `Liabilities:CreditCard:<sourceAccount-id>` (e.g., `Assets:Bank:main-12345678901`, `Liabilities:CreditCard:card-1234`). The id comes straight from `AccountConfig.id`, so whatever the user named it in YAML is what appears in the ledger. This keeps a single source of truth and avoids a secondary rename table.
  - Internal transfer (issue #26 settlements): same `Assets:Bank:...` + `Liabilities:CreditCard:...` but double-entry is *between the two real accounts*, no category. No `Expense:` or `Income:` side.
  - Constants live in `src/core/ingest/account-names.ts` as tiny pure helpers: `bankAccount(id)`, `cardAccount(id)`, `expenseAccount(category)`, `incomeAccount(category)`. Avoids magic strings scattered through the builder.

- **Auto-tagger** — hardcoded seed rule list in `src/core/ingest/auto-tag-rules.ts`. Each rule is `{ pattern: RegExp, category: string, direction?: 'inflow' | 'outflow' }`. Applied in order against the (already-normalised by Story 2.2's canonicalizer-style) description; first match wins. Seed covers ~8 categories that map to typical BPCE bank descriptions the user's real data contains (GROCERIES, TRANSPORT, FUEL, RESTAURANT, UTILITIES, BANKING-FEES, INSURANCE, SUBSCRIPTIONS). No match → `Uncategorized` category, `confidence: 'low'`. User customisation of rules is explicitly **out of scope** (YAGNI; Story 2.4's interactive tagging loop will let the user override per-item, which is more ergonomic than a YAML rule editor).

- **TransactionBuilder** — Core class `src/core/ingest/transaction-builder.ts`. Constructor DI on `AppConfig.accounts` (readonly array; Core doesn't depend on ConfigService port because the accounts list is already a value passed in by the caller). Method `build(item: IngestItem): Result<BuildOutcome>` where:
  ```ts
  interface BuildOutcome {
    readonly transaction: Transaction;
    readonly category: string;          // e.g. "Transport" or "Uncategorized" or the special "InternalTransfer"
    readonly confidence: 'high' | 'low'; // 'low' when the rule matched Uncategorized; 'low' also for card-settlement-without-matching-card-config (see below)
    readonly classification: 'expense' | 'income' | 'internal-transfer';
  }
  ```
  Batch convenience: `buildAll(items): Result<{ built: BuildOutcome[]; failed: { item: IngestItem; reason: string }[] }>` — the ingestion pipeline (Story 2.4) needs this shape so one item's failure doesn't abort the batch. Per-item `Result.fail` only for genuinely unrecoverable cases (a `Transaction.create` invariant violation that shouldn't be possible given our inputs — but guard anyway).

- **Card-settlement classifier (issue #26)** — run *before* auto-tagging. Pattern: `^PAIEMENT\s+CARTE\s+X?(\d{4})(?:\s.*)?$` (case-insensitive; the description was NFC+trim+whitespace-collapsed upstream so simple). Match condition: `sourceAccount` has `type: 'bank'` AND description matches. When matched, the builder:
  1. Extracts the 4-digit suffix from the capture group.
  2. Looks for an `AccountConfig` where `type: 'card'` AND `cardSuffix === extracted`. Explicit field (not `id.endsWith(…)`) prevents the collision case a bank id ending in the same 4 digits would otherwise cause.
  3. If exactly one match: emit `{ classification: 'internal-transfer', category: 'InternalTransfer', confidence: 'high' }` with a `Transaction` debiting `Liabilities:CreditCard:<card-id>` and crediting `Assets:Bank:<sourceAccount-id>` for the full amount.
  4. If zero or multiple cards match the suffix: emit `{ classification: 'expense', category: 'Uncategorized', confidence: 'low' }` — fall back to the regular expense path. Story 2.4 will surface `confidence: 'low'` items for user review. Never silently classify as internal-transfer to a wrong card. (Hard-failing would lose the transaction entirely; the "Sunday Morning Audit" journey and QA "No silent data loss" both favour Uncategorized-with-review over hard-fail.)

- **Direction → debit/credit mapping** (single table, no cleverness):

  | sourceAccount.type | IngestItem.direction | Classification        | Debit                                | Credit                               |
  | ------------------ | -------------------- | --------------------- | ------------------------------------ | ------------------------------------ |
  | bank               | outflow              | expense               | `Expense:<Category>`                 | `Assets:Bank:<id>`                   |
  | bank               | inflow               | income                | `Assets:Bank:<id>`                   | `Income:<Category>`                  |
  | card               | outflow              | expense               | `Expense:<Category>`                 | `Liabilities:CreditCard:<id>`        |
  | card               | inflow               | income (refund)       | `Liabilities:CreditCard:<id>`        | `Income:<Category>`                  |
  | bank + PAIEMENT    | outflow              | internal-transfer     | `Liabilities:CreditCard:<card-id>`   | `Assets:Bank:<id>`                   |

### Types

```ts
// src/core/ingest/types.ts — addition
export type Classification = 'expense' | 'income' | 'internal-transfer';
export type Confidence = 'high' | 'low';

export interface BuildOutcome {
  readonly transaction: Transaction;
  readonly category: string;
  readonly classification: Classification;
  readonly confidence: Confidence;
}

export interface BuildBatchOutcome {
  readonly built: readonly BuildOutcome[];
  readonly failed: readonly { readonly item: IngestItem; readonly reason: string }[];
}
```

### Config change

```ts
// src/core/config/app-config.ts — addition
export interface AccountConfig {
  readonly id: string;
  readonly type: 'bank' | 'card';        // NEW
  readonly filenamePrefix: string;
  readonly cardSuffix?: string;          // NEW, required iff type === 'card' (cross-field refinement in Zod)
}
```

```ts
// src/infra/config/config-schema.ts — addition inside AccountConfigSchema + a superRefine
// - type: z.enum(['bank', 'card'])
// - cardSuffix: z.string().regex(/^\d{4}$/).optional()
// - superRefine: if type==='card' and !cardSuffix → 'cardSuffix is required for card accounts'
//                if type==='bank' and cardSuffix → 'cardSuffix must not be set on bank accounts'
//   Both messages must stay PII-safe (name the field, never echo the value).
```

```yaml
# accounting.example.yaml — edits
accounts:
  - id: main-12345678901
    type: bank
    filenamePrefix: "12345678901_"
  - id: card-1234
    type: card
    cardSuffix: "1234"
    filenamePrefix: "carte_1234_"
```

### TransactionBuilder signature

```ts
// src/core/ingest/transaction-builder.ts
export class TransactionBuilder {
  constructor(
    private readonly accounts: readonly AccountConfig[],
    private readonly rules: readonly AutoTagRule[] = DEFAULT_RULES,
    private readonly idGen: () => string = defaultUuidGen,
  ) {}
  build(item: IngestItem): Result<BuildOutcome> { … }
  buildAll(items: readonly IngestItem[]): Result<BuildBatchOutcome> { … }
}
```

- `idGen` default is injected for deterministic testing (tests pass a stub sequence generator). Production wires `crypto.randomUUID` from a thin Infra factory — or we inline `crypto.randomUUID()` and note it as a Core dependency on a Node built-in. **Decision:** `idGen` is a Core port/function type (no `crypto` import in Core); Infra provides a `nodeUuidGen` (file `src/infra/crypto/node-uuid-gen.ts`, 3 LOC). Mirrors the `HashFn` port shape from Story 2.2.

### Auto-tag rule seed

```ts
// src/core/ingest/auto-tag-rules.ts
export interface AutoTagRule {
  readonly pattern: RegExp;
  readonly category: string;
}
export const DEFAULT_RULES: readonly AutoTagRule[] = [
  { pattern: /uber|bolt|taxi|freenow/i, category: 'Transport' },
  { pattern: /carrefour|monoprix|auchan|intermarche|biocoop|leclerc/i, category: 'Groceries' },
  { pattern: /total|shell|bp|esso|station service/i, category: 'Fuel' },
  { pattern: /restaurant|cafe|bar|brasserie|snack/i, category: 'Restaurant' },
  { pattern: /edf|engie|veolia|orange|sfr|free|bouygues/i, category: 'Utilities' },
  { pattern: /cotisation|frais bancaires|agios/i, category: 'BankingFees' },
  { pattern: /assurance|mutuelle/i, category: 'Insurance' },
  { pattern: /netflix|spotify|prime|disney|apple.com|abonnement/i, category: 'Subscriptions' },
];
```

Rules are deliberately broad-brush and French-biased because the user's real data is BPCE. A later story (or issue) will add more as patterns emerge. The PRD doesn't require a rich taxonomy in MVP — the "Sunday Morning Audit" loop assumes ~5 interactive reviews per 150 transactions; a wide-net `Uncategorized` is acceptable.

## Rationale (vs alternatives)

- **CoA-style colon-delimited account names** vs enum/integer account ids. KISS — strings are debuggable in DB dumps, align with Ledger / Plaintext Accounting conventions (hledger, ledger-cli), and future `Epic:Explain` output reads naturally. A formal `accounts` table (issue #17's territory) is post-MVP.
- **Hardcoded auto-tag rules in Core** vs YAML-loaded user-customizable rules. YAGNI. Story 2.4's interactive tagging per-item is more ergonomic than editing a YAML dictionary. If a user wants custom rules before 2.4 lands, they can open a PR — it's one line per rule.
- **"Uncategorized" fallback with `confidence: 'low'`** vs hard-fail on unmatched. QA "No silent data loss" favours never dropping a transaction. The "Sunday Morning Audit" journey explicitly describes the user reviewing flagged items; that's the mechanism.
- **Explicit `cardSuffix` field on AccountConfig** vs deriving from id via `endsWith(…)`. The plan agent caught the collision case: if a future bank account id ends in the same 4 digits as a card's suffix, `endsWith` silently lights up on the wrong account, and the user sees an Uncategorized fallback (multi-match) for a transaction that should have been an internal transfer. Explicit `cardSuffix` also documents what the field represents (the real BPCE pattern) and survives id rename.
- **`AccountConfig.type` as a required field** vs optional + default 'bank'. Explicit > implicit. The user is declaring a real-world account; making them name its type prevents the "forgot to set type on the card and got Uncategorized'd" surprise.
- **`idGen` as a Core port (function type)** vs hardcoded `crypto.randomUUID()` in Core. Core-depends-on-nothing rule — `crypto.randomUUID` is Node, Infra territory. Port lets tests inject a deterministic sequence. Same pattern as `HashFn` from Story 2.2.
- **Batch method `buildAll` returns `{ built, failed }` rather than `Result<BuildOutcome[]>`**. One item's Transaction.create failure shouldn't abort a 150-row batch — parallel to Story 2.1's per-row parse-stage errors. The per-item reason is reported to the caller (Story 2.4 CLI) which can show the user what failed.
- **Card-settlement classifier runs BEFORE auto-tagging** (not as a rule in the list). The classifier needs `sourceAccount.type == 'bank'` AND a match against the card-account registry — it's a structural classifier, not a description-only regex. Mixing it into `AutoTagRule[]` would require each rule to take the full IngestItem + accounts array, bloating the type. Keep the rule list simple and dispatch from the builder.
- **Not adding a port for "is this an internal transfer"** — the classifier is a pure function of `(item, accounts)`. No IO. Keep it a module-local helper.

## Critical files to create / touch

| Path | Change |
| --- | --- |
| `CLAUDE.md` | **edit** — refresh § 1 "Current position" to `Epic 2 ... Next story: 2.4 — Interactive Ingest Command (CLI)` (`chore(docs)` commit at top of branch) |
| `src/core/config/app-config.ts` | **edit** — add `type: 'bank' \| 'card'` to `AccountConfig` |
| `src/infra/config/config-schema.ts` | **edit** — Zod `z.enum(['bank', 'card'])` on `type`; propagate to `parseRawConfig` |
| `accounting.example.yaml` | **edit** — add `type: bank` / `type: card` lines on example accounts |
| `src/core/ingest/types.ts` | **edit** — add `Classification`, `Confidence`, `BuildOutcome`, `BuildBatchOutcome` |
| `src/core/ingest/account-names.ts` | **new** — pure helpers: `bankAccount(id)`, `cardAccount(id)`, `expenseAccount(cat)`, `incomeAccount(cat)` |
| `src/core/ingest/auto-tag-rules.ts` | **new** — `AutoTagRule` type + `DEFAULT_RULES` seed |
| `src/core/ports/uuid-gen.ts` | **new** — `UuidGen = () => string` port |
| `src/core/ingest/transaction-builder.ts` | **new** — `TransactionBuilder` class; `build()` + `buildAll()`; card-settlement classifier; direction→debit/credit table |
| `src/infra/crypto/node-uuid-gen.ts` | **new** — thin wrapper over `crypto.randomUUID` |
| `tests/unit/infra/config/config-schema.test.ts` | **edit** — cover new `type` field (required, enum validation, PII-safe error) |
| `tests/integration/infra/config/config-service.test.ts` | **edit** — fixture yaml includes `type:` lines |
| `tests/unit/core/ingest/account-names.test.ts` | **new** — one unit test per helper; round-trip property |
| `tests/unit/core/ingest/auto-tag-rules.test.ts` | **new** — each seed rule matches a known BPCE-style description and misses a decoy; Uncategorized fallback |
| `tests/unit/core/ingest/transaction-builder.test.ts` | **new** — the four direction/type rows of the table, card-settlement match + mismatch, batch `built`/`failed` split, Transaction invariants propagate, `buildAll` preserves order |
| `tests/unit/infra/crypto/node-uuid-gen.test.ts` | **new** — minimal: returns a string, uniqueness property, v4 format check |

Reuses: `Transaction.create()` + `Entry` ([src/core/ledger/transaction.ts](src/core/ledger/transaction.ts)) — the double-entry invariant check is already there; we just supply correct entries. `Result.ok/fail` ([src/core/shared/result.ts](src/core/shared/result.ts)). `IngestItem` + `AppConfig` shapes from Stories 2.1/2.2. **No new deps** — `crypto.randomUUID` is Node built-in (Node 20+).

**Not in scope:** no persistence (Story 2.5), no CLI interaction (Story 2.4), no user-customisable rules (YAGNI; 2.4's interactive override is the MVP affordance), no per-account currency cross-transaction enforcement (issue #17, still deferred), no confidence-score numeric scale (binary high/low suffices for Story 2.4's low-confidence prompt).

## Gherkin scenarios

Story 2.3 has no CLI surface — scenarios map 1:1 to unit tests (one `describe` per scenario, one `it` per assertion). Each carries a "fails if …" note.

```gherkin
Feature: Transaction builder & auto-tagging

  Scenario: AC1/AC2 — expense on a bank account, matched rule
    Given a bank-type AccountConfig 'main-1' and a card-type AccountConfig 'card-1234'
    And an IngestItem { sourceAccount: 'main-1', direction: 'outflow', amount: 20.00 EUR,
                        description: 'UBER TRIP 2026', occurredAt: '2026-04-20T00:00:00+02:00' }
    When builder.build(item) runs
    Then the result is Result.ok
    And outcome.classification == 'expense'
    And outcome.category == 'Transport'
    And outcome.confidence == 'high'
    And outcome.transaction has two entries: debit 'Expense:Transport' 20.00 EUR; credit 'Assets:Bank:main-1' 20.00 EUR
    # fails if: the uber rule isn't in DEFAULT_RULES, or the bank→outflow row of the direction table is wrong,
    # or Transaction.create's sum(debits)==sum(credits) invariant rejects the entries

  Scenario: expense on a card account routes to CreditCard liability
    Given a bank-type 'main-1' and a card-type 'card-1234'
    And an IngestItem { sourceAccount: 'card-1234', direction: 'outflow', amount: 42.00 EUR,
                        description: 'CARREFOUR MARKET' }
    When builder.build runs
    Then outcome.category == 'Groceries'
    And transaction entries are: debit 'Expense:Groceries' 42.00 EUR; credit 'Liabilities:CreditCard:card-1234' 42.00 EUR
    # fails if: the card→outflow row routes to Assets:Bank instead

  Scenario: income/refund on a card account reverses the sides
    Given a card-type 'card-1234'
    And an IngestItem { sourceAccount: 'card-1234', direction: 'inflow', amount: 15.00 EUR,
                        description: 'REMBOURSEMENT MUTUELLE' }
    When builder.build runs
    Then outcome.category == 'Insurance'
    And outcome.classification == 'income'
    And entries are: debit 'Liabilities:CreditCard:card-1234' 15.00 EUR; credit 'Income:Insurance' 15.00 EUR
    # fails if: inflow on a card is treated as expense (would wrongly increase the CC liability)

  Scenario: unmatched description → Uncategorized with confidence=low
    Given an IngestItem with description 'WEIRD MERCHANT XYZ' (matches no rule)
    When builder.build runs
    Then outcome.category == 'Uncategorized'
    And outcome.confidence == 'low'
    And outcome.classification == 'expense' (or 'income', per direction)
    # fails if: unmatched items get dropped (silent data loss), or confidence reports 'high'

  Scenario: AC/#26 — PAIEMENT CARTE on main account maps to internal transfer
    Given a bank-type 'main-1' and a card-type 'card-1234'
    And an IngestItem { sourceAccount: 'main-1', direction: 'outflow', amount: 523.45 EUR,
                        description: 'PAIEMENT CARTE X1234 AVRIL' }
    When builder.build runs
    Then outcome.classification == 'internal-transfer'
    And outcome.category == 'InternalTransfer'
    And outcome.confidence == 'high'
    And entries are: debit 'Liabilities:CreditCard:card-1234' 523.45 EUR; credit 'Assets:Bank:main-1' 523.45 EUR
    # fails if: the classifier doesn't run, or it runs against card-sourced items (should only fire on bank sources),
    # or the suffix isn't resolved back to card-1234's id

  Scenario: PAIEMENT CARTE with ambiguous/unknown suffix → Uncategorized expense, not silent internal-transfer
    Given a bank-type 'main-1' and NO card-type account with suffix 9999
    And an IngestItem { sourceAccount: 'main-1', direction: 'outflow', amount: 100 EUR,
                        description: 'PAIEMENT CARTE X9999' }
    When builder.build runs
    Then outcome.classification == 'expense'
    And outcome.category == 'Uncategorized'
    And outcome.confidence == 'low'
    # fails if: the classifier silently guesses a card, or hard-fails the whole item (silent data loss)

  Scenario: batch buildAll preserves input order and splits built/failed
    Given 5 IngestItems, one of which triggers a Transaction.create invariant violation
    When builder.buildAll(items) runs
    Then outcome.built.length == 4
    And outcome.failed.length == 1
    And built items appear in the input's relative order
    And failed.item references the 3rd input item (by reference identity)
    # fails if: one bad item aborts the batch, or ordering is lost

  Scenario: batch buildAll assigns a distinct Transaction.id per item
    Given 5 valid IngestItems
    When builder.buildAll(items) runs
    Then the 5 built Transactions all have distinct .id values
    # fails if: idGen is called once in the constructor and reused, or a cached UUID leaks across items
    # (silent at the Transaction-level; would only surface as a UNIQUE violation at Story 2.5's INSERT)

  Scenario: Transaction.description preserves the original IngestItem.description verbatim
    Given an IngestItem with description 'UBER TRIP 2026-04-20' matched to category 'Transport'
    When builder.build runs
    Then transaction.description === 'UBER TRIP 2026-04-20' (the original, NOT 'Transport' or a transformed string)
    # fails if: the category leaks into description, or the builder rewrites the description
    # (would corrupt the audit trail — QA § Coherence / Conversational CFO truthfulness)

  Scenario: Transaction.occurredAt is passed through unchanged
    Given an IngestItem with occurredAt '2026-04-20T00:00:00+02:00'
    When builder.build runs
    Then transaction.occurredAt === '2026-04-20T00:00:00+02:00' (same string, no reformat)
    # fails if: the builder re-parses and re-serialises the timestamp (determinism risk), or
    # strips the offset (Story 2.2's idempotency hash depends on the exact string)
```

## Plan for Sonnet (commit slices — adapter-story sizing per § 6.6)

Target 7–8 commits. Slice per distinct external concern.

1. `chore(docs): refresh CLAUDE.md § 1 current-position line (Story 2.3 maintenance)` — one-liner to `Next story: 2.4`.
2. `test(config): AccountConfig.type enum validation — failing (Story 2.3)` — extend existing config tests with `type` required + enum; update fixtures.
3. `feat(config): AccountConfig.type minimal green (Story 2.3)` — add the field to AppConfig, Zod schema, example YAML.
4. `test(ingest): TransactionBuilder + auto-tagger obvious basics — failing (Story 2.3)` — tests for account-name helpers, the four-row direction table, auto-tag seed match + Uncategorized fallback, `buildAll` built/failed split + order preservation. Introduce the new Core files as empty skeletons so the test compiles.
5. `feat(ingest): TransactionBuilder + auto-tagger minimal green (Story 2.3)` — implement `account-names.ts`, `auto-tag-rules.ts` seed, `TransactionBuilder.build` + `buildAll`. Wire through `UuidGen` port (Core type) and `NodeUuidGen` adapter (Infra).
6. `test(ingest): card-settlement classifier — failing (Story 2.3)` — tests for matching-suffix success, ambiguous-suffix fallback, card-sourced item not classified, non-matching regex ignored.
7. `feat(ingest): card-settlement classifier minimal green (Story 2.3)` — add the classifier step that runs before auto-tagging; resolve suffix against `accounts`.
8. `refactor(ingest): tidy TransactionBuilder (Story 2.3)` or empty-refactor commit per § 6.4 if nothing to clean.

Estimated 7–8 commits. No green-on-landing expected — the card classifier (slice 6-7) is a distinct counterintuitive rule that won't fall out of slice 5's "obvious basics".

### Deps pre-authorised

None. `node:crypto.randomUUID` is built-in.

### Verification (end-to-end)

- `npm run lint && npm run build && npm test` all green.
- Each Gherkin scenario has ≥1 matching test.
- 100% branch coverage on `src/core/ingest/transaction-builder.ts`, `auto-tag-rules.ts`, `account-names.ts` (all Core).
- Manual: no user-facing surface; deferred to Story 2.4's CLI.

## Risks & deferrals

- **Auto-tag rule seed is deliberately small (8 categories), hardcoded in Core, no YAML override.** Flag per Plan agent: if Story 2.4's interactive loop is deferred past the next sprint, or if the user needs to ingest historical data before 2.4 lands, they'll have to edit TS to add a rule. Mitigation cost is tiny (one commit per rule). **Trigger condition:** if Story 2.4 slips more than one iteration past Story 2.3, file a YAML-override issue. Additions meanwhile are one-line PRs.
- **Per-account currency consistency (#17) still deferred.** Story 2.3 doesn't enforce cross-transaction currency consistency per account. It will use `item.amount.currency` (already single-currency per item per Story 2.1's contract). A future story (or the #17 resolution) will add the `accounts` table with a `currency` column.
- **Card-settlement classifier is locale-aware** — matches French "PAIEMENT CARTE Xnnnn" pattern. When a second bank format lands (issue #23), similar rules for that format will need adding. File a small issue at review time noting this dependency if it isn't already captured under #26.
- **The `idGen` port's default in production** needs to be wired at the CLI assembly point (Story 2.4). Story 2.3 ships the port + adapter; Story 2.4 consumes.

## Carryovers resolved

- Story 2.2 retro action A — plan at `docs/plans/story-2.3.md` (this file). ✓
- Story 2.2 retro action B — Phase 4 will explicitly audit "this test fails if …" notes against the production path.
