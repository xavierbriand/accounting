# Story B (#74) — Load `autoTagRules` from `accounting.yaml`; remove `DEFAULT_RULES`

## Context

The auto-tag rules that turn `UBER TRIP` into `Transport` are hardcoded today in `src/core/ingest/auto-tag-rules.ts` as `DEFAULT_RULES`. The CLI never overrides them. The `--non-interactive` error message at [src/cli/commands/ingest-command.ts:230](../../src/cli/commands/ingest-command.ts) already tells users to *"update accounting.yaml's auto-tag-rules"* — but that YAML section does not exist; the message is aspirational.

Story B makes YAML the **only** source. The hardcoded defaults are deleted; the previous values move to `accounting.example.yaml` purely as illustration. With no rules in YAML (or none matching), every transaction lands in `Uncategorized` — consistent with Story A: the user defines categories inline.

This is **Story B** of the inline-categories sequence (A: [#73](https://github.com/xavierbriand/accounting/issues/73), now merged; C: [#75](https://github.com/xavierbriand/accounting/issues/75)). Story C will add YAML write-back from the inline-define prompt.

**Epic / FR alignment.** Epic 2 / Story 2.4 (Interactive Ingest Command) — FR6 ("System can automatically tag transactions based on exact merchant name matches from previous history"; see [docs/prd.md:246](../prd.md)). Story B externalises the rule source so users can extend it without code changes.

### Maintenance sub-loop (§ 6.7) run 2026-04-28 pre-planning

- **Working tree:** clean; new branch `claude/story-B` created from `origin/main` at `3b087ef` (post-Story-A merge).
- **Open issues:** 11 open. #73 (Story A) still flagged OPEN even though PR 78 merged — pinging the user to close. #75 (Story C) is the successor. Issue #80 (proposal for product-dev-loop optimisation agent) is process; not blocking. Seven `deferred-suggestion` items unchanged.
- **Open PRs:** 1 — Dependabot [#81 typescript-eslint 8.59.0 → 8.59.1](https://github.com/xavierbriand/accounting/pull/81). Patch-level dev-dep; routine merge per § 6.7. Flagged for user — does not block Story B.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Decision:** proceed.

### User decisions taken before planning (interactively)

Per `feedback_planning_clarifying_questions.md`, surfaced before writing this plan:

- **Q1 — YAML category names go through Story A's validator:** the same five rules (length, forbidden chars `:` `/` `\`, reserved tokens `Uncategorized` `Asset` `Income` `Expense` `Liability`, case-insensitive) apply to `category` strings in YAML. Catches typos at parse-time and stays consistent with the inline-define UX.
- **Q2 — Local `accounting.yaml` is NOT touched by this PR.** Instead the PR description includes a copy-pasteable diff for the user to apply manually post-merge.
- **Q3 — `--non-interactive` error message sharpened** to also surface Story A's inline-define path: *"Run without --non-interactive to review them (you can define new categories inline), or re-ingest after updating accounting.yaml's auto-tag-rules."*
- **Q4 — `accounting.example.yaml` uses 1:1 migration** of the existing `DEFAULT_RULES`: one pattern per category, alternations preserved (e.g. `"netflix|spotify|prime|disney|apple\\.com|abonnement"`).

Plus two decisions taken silently with no objection:
- **Empty pattern strings rejected** (`patterns: ['']`). `z.array(z.string().min(1)).min(1)` covers both empty arrays and empty strings inside.
- **`TEST_RULES` constant** in `transaction-builder.test.ts` to avoid inlining a rules array in every test.

## Production-code surface (R2)

- **Move (no behaviour change):** `validateNewCategoryName` and `RESERVED_TOKENS` relocate from `src/cli/utils/interactive.ts` → `src/core/categories/category-name.ts`. Signatures unchanged. CLI re-imports from the new path. Justification: Story B's schema layer needs the same validator; CLI → Core dependency rule forbids `infra/` importing from `cli/`.
- **`AppConfig` gains** `readonly autoTagRules: readonly AutoTagRule[]` (field 8). The `AutoTagRule` interface itself is unchanged: `{ pattern: RegExp; category: string }`.
- **`TransactionBuilder` constructor** drops the `= DEFAULT_RULES` default on the second parameter; `rules: readonly AutoTagRule[]` becomes required.
- **`DEFAULT_RULES` deleted.** No replacement.
- **`src/cli/program.ts:103-104`:** the `transactionBuilder` factory now passes `config.autoTagRules` instead of `undefined`.
- **No new public CLI surface** (no flags, no JSON shape change). The non-interactive error wording changes, which is user-visible but narrowly scoped.

## Behaviour

### YAML schema — grouped, flat-internally

```yaml
autoTagRules:                                  # optional; default []
  - category: AutoInsurance                    # validated via validateNewCategoryName
    patterns:                                  # array; min 1; each non-empty; each valid /i regex
      - "altima|courtage"
      - "axa.*auto"
  - category: Entertainment
    patterns:
      - "netflix|spotify|disney"
      - "steam|epic games"
```

Internally flattened by `parseRawConfig` to the existing flat shape (`{ pattern: RegExp; category: string }[]`) so [transaction-builder.ts:21](../../src/core/ingest/transaction-builder.ts) (`tagDescription`) is unchanged. **YAML order is preserved** — first match wins, deterministically.

### Validation pipeline (Zod schema → superRefine → parseRawConfig transform)

1. **Structural (Zod):** `autoTagRules: z.array(GroupSchema).optional().default([])`. `GroupSchema = z.object({ category: z.string(), patterns: z.array(z.string().min(1)).min(1) }).strict()`. This rejects empty arrays, empty strings, missing keys, extra keys.
2. **Category-name shape (superRefine):** for each group, call `validateNewCategoryName(category, [])` and surface `Result.fail` as `path: [i, 'category']`. Empty `existing` array — duplicate detection doesn't apply to YAML rules (two rules with the same category are intentional, not a bug).
3. **Regex compile (superRefine):** for each pattern, attempt `new RegExp(pattern, 'i')` inside a try/catch and surface failures as `path: [i, 'patterns', j]`.
4. **`parseRawConfig` transform:** Zod-validated input → flat `AutoTagRule[]`. Pattern strings re-compiled to `RegExp` (safe — superRefine already proved compile success).

**Locale-determinism (FR22-spirit):** category-name comparisons in `validateNewCategoryName` already use `String.prototype.toLowerCase()` (ASCII-only). Inherited from Story A; no new locale risk.

### `--non-interactive` message (Q3-b)

Old (line 230): *"Run without --non-interactive to review them, or re-ingest after updating accounting.yaml's auto-tag-rules."*
New: *"Run without --non-interactive to review them (you can define new categories inline), or re-ingest after updating accounting.yaml's auto-tag-rules."* — adds the Story A discoverability hook.

## Gherkin scenarios (R6)

```gherkin
Feature: autoTagRules loaded from accounting.yaml

  Scenario: schema accepts grouped rules and flattens them in YAML order
    Given a YAML config with autoTagRules grouped by category
      | category | patterns                            |
      | Transport| ["uber\\|bolt", "taxi"]              |
      | Groceries| ["carrefour"]                       |
    When parseRawConfig is invoked
    Then AppConfig.autoTagRules has length 3
    And the order is [Transport/uber|bolt, Transport/taxi, Groceries/carrefour]
    And every .pattern is a RegExp with the /i flag
    And fails if the grouped→flat transform breaks order or omits flags (guards parseRawConfig flatten loop).

  Scenario: schema defaults missing autoTagRules to []
    Given a YAML config with no autoTagRules section
    When parseRawConfig is invoked
    Then AppConfig.autoTagRules equals []
    And fails if the missing key throws or yields undefined (guards .optional().default([])).

  Scenario: schema rejects an empty patterns array
    Given a YAML config with one rule whose patterns: []
    When parseRawConfig is invoked
    Then it returns Result.fail citing 'autoTagRules.0.patterns'
    And fails if z.array(...).min(1) is missing (guards "at least one pattern per category").

  Scenario: schema rejects an empty pattern string
    Given a YAML config with one rule whose patterns: [""]
    When parseRawConfig is invoked
    Then it returns Result.fail citing 'autoTagRules.0.patterns.0'
    And fails if z.string().min(1) is missing inside the array (an empty string compiles to a regex matching every description, silently mis-tagging everything).

  Scenario: schema rejects an uncompilable regex pattern
    Given a YAML config with patterns: ["[invalid"]
    When parseRawConfig is invoked
    Then it returns Result.fail citing 'autoTagRules.0.patterns.0' with the regex error
    And fails if regex compile is not pre-validated in superRefine (the runtime new RegExp in transform would throw uncaught).

  Scenario: schema rejects a reserved category token (case-insensitive)
    Given a YAML config with category: 'Expense'
    When parseRawConfig is invoked
    Then it returns Result.fail citing "autoTagRules.0.category: 'Expense' is reserved"
    And fails if Story A's validateNewCategoryName is not applied to YAML categories (guards Q1-a consistency).

  Scenario: schema rejects a category containing path-separator characters
    Given a YAML config with category: 'Expense/Sub'
    When parseRawConfig is invoked
    Then it returns Result.fail citing autoTagRules.0.category and naming ':', '/', '\\'
    And fails if forbidden-char rule is bypassed (would corrupt the Expense:<category> account path).

  Scenario: TransactionBuilder receives rules from config (no DEFAULT_RULES fallback)
    Given an AppConfig.autoTagRules containing one rule { pattern: /uber/i, category: 'Transport' }
    When the ingest factory in program.ts constructs a TransactionBuilder
    Then the builder's rules === config.autoTagRules (reference-equality)
    And fails if program.ts:104 still passes undefined (guards the wiring change).

  Scenario: DEFAULT_RULES symbol fully removed from src/
    Given the TypeScript source post-merge
    When `git grep -n DEFAULT_RULES src/` is run
    Then no match exists
    And fails if any vestige remains, ensuring the issue's "delete DEFAULT_RULES" is honoured end-to-end.
```

The DEFAULT_RULES grep scenario is enforced by a unit test that runs `git ls-files src/` + reads each file; the scenario doubles as an executable assertion against accidental re-introduction.

## Files to change

- **[src/core/categories/category-name.ts](../../src/core/categories/category-name.ts)** *(new)* — relocate `validateNewCategoryName` + `RESERVED_TOKENS` from `src/cli/utils/interactive.ts`. Pure; signatures preserved verbatim.
- **[src/cli/utils/interactive.ts](../../src/cli/utils/interactive.ts)** — drop the local definitions; re-import `validateNewCategoryName` and `RESERVED_TOKENS` from `@core/categories/category-name.js`. Re-export `RESERVED_TOKENS` (Story A's tests import it from this module).
- **[tests/unit/cli/utils/interactive.test.ts](../../tests/unit/cli/utils/interactive.test.ts)** — update import path from `interactive.js` → `@core/categories/category-name.js` for the validator + tokens. Pure path swap.
- **[src/core/config/app-config.ts](../../src/core/config/app-config.ts)** — add `readonly autoTagRules: readonly AutoTagRule[]` to `AppConfig`. Re-export `AutoTagRule` from `@core/ingest/auto-tag-rules.js` for downstream consumers (config schema needs the type).
- **[src/infra/config/config-schema.ts](../../src/infra/config/config-schema.ts)** — add `AutoTagRuleGroupSchema`, attach to `RawConfigSchema` with optional+default+superRefine; in `parseRawConfig`, append the flatten loop after the existing `buffers`/`recurring` transforms.
- **[src/core/ingest/auto-tag-rules.ts](../../src/core/ingest/auto-tag-rules.ts)** — delete `DEFAULT_RULES`. Keep the `AutoTagRule` interface (still imported by `transaction-builder.ts`, `app-config.ts`, the config schema).
- **[src/core/ingest/transaction-builder.ts](../../src/core/ingest/transaction-builder.ts)** — drop the `= DEFAULT_RULES` default on the constructor's second parameter. Drop the `import { DEFAULT_RULES }` line.
- **[src/cli/program.ts](../../src/cli/program.ts)** — line 104: replace `new TransactionBuilder(accounts, undefined, nodeUuidGen)` with `new TransactionBuilder(accounts, config.autoTagRules, nodeUuidGen)`. The `config` is already in scope.
- **[src/cli/commands/ingest-command.ts](../../src/cli/commands/ingest-command.ts)** — line 230: sharpen wording per Q3-b.
- **[accounting.example.yaml](../../accounting.example.yaml)** — append `autoTagRules:` section per Q4-a (1:1 migration of the 8 DEFAULT_RULES categories, single pattern each, alternations preserved).
- **`accounting.yaml`** — **NOT TOUCHED** per Q2. The PR description includes a copy-pasteable diff (same content as the example.yaml addition) for the user to apply manually.
- **[tests/unit/core/ingest/auto-tag-rules.test.ts](../../tests/unit/core/ingest/auto-tag-rules.test.ts)** — **deleted**. The file tests `DEFAULT_RULES`, which no longer exists.
- **[tests/unit/core/ingest/transaction-builder.test.ts](../../tests/unit/core/ingest/transaction-builder.test.ts)** — extract a `TEST_RULES` constant at top of file mirroring the 2-3 patterns the tests actually exercise (Transport/uber, Groceries/carrefour, etc.); replace every `new TransactionBuilder(accounts, undefined, seqIdGen)` with `new TransactionBuilder(accounts, TEST_RULES, seqIdGen)`.
- **[tests/unit/infra/config/config-schema.test.ts](../../tests/unit/infra/config/config-schema.test.ts)** — add Story B test cases per the Gherkin scenarios above (happy path, default-empty, empty-array reject, empty-string reject, bad-regex reject, reserved-category reject, forbidden-char reject).
- **[tests/unit/core/ingest/no-default-rules.test.ts](../../tests/unit/core/ingest/no-default-rules.test.ts)** *(new)* — one tiny test that walks `src/` and asserts `git grep -L DEFAULT_RULES` covers every file (Gherkin scenario 9).

## Reuse / what already exists

- **`validateNewCategoryName` (Story A)** in `src/cli/utils/interactive.ts` — relocated to Core in this story; reused unchanged.
- **`Result<T, E>`** from `@core/shared/result.js`.
- **`parseRawConfig` Zod-then-transform pattern** at `src/infra/config/config-schema.ts:259-275` (Money/buffers transform) — mirrored for autoTagRules flatten.
- **`superRefine` PII-safe error pattern** from splits validation (`src/infra/config/config-schema.ts:168-194`) — error messages cite paths, not values, by convention.
- **`formatZodError`** at `src/infra/config/config-schema.ts:242-248` — emits `path: message` lines; auto-handles `[i, 'patterns', j]`.

**R3 (tool-bundle import audit):** N/A — no new framework.
**R4 (composition-root subprocess test):** **applies.** [src/cli/program.ts](../../src/cli/program.ts:104) is touched; per the rule, a subprocess test must verify the wiring. The existing `tests/integration/cli/ingest-commit.test.ts` (and the `program.ts`-level harness if one exists) covers ingest end-to-end — the Story B test plan adds a subprocess smoke that boots the dist build with a config containing one autoTagRule and confirms a matching transaction is tagged accordingly. Implementer pins the exact harness location during Phase 3.

## Scope guardrails

- **No** YAML write-back from CLI — that's Story C.
- **No** UX change to `selectCategory` or the inline-define flow.
- **No** new dependencies.
- **No** migration of `accounting.yaml` (user's local copy) — diff supplied in PR description.

## Slicing & commits (target 7–9, per **R13**)

1. `refactor(core/categories): relocate validateNewCategoryName + RESERVED_TOKENS to core` *(no behaviour change; updates Story A imports + tests; tests stay green)*
2. `test(infra/config): autoTagRules schema accepts grouped rules and flattens — failing`
3. `feat(infra/config): autoTagRules zod schema + parseRawConfig flatten — minimal green`
4. `test(infra/config): autoTagRules rejects empty array, empty string, bad regex, bad category — failing` *(adds the superRefine cases)*
5. `feat(infra/config): autoTagRules superRefine validation (regex compile + category-name shape) — minimal green`
6. `test(core/ingest): TransactionBuilder requires explicit rules; DEFAULT_RULES grep returns empty — failing`
7. `feat(core/ingest)+(cli): remove DEFAULT_RULES; constructor param required; program.ts wires config.autoTagRules — minimal green` *(also deletes auto-tag-rules.test.ts and updates transaction-builder.test.ts to pass TEST_RULES; bundles the wiring change)*
8. `chore(config): autoTagRules in accounting.example.yaml + sharpened --non-interactive message`
9. `refactor: <pending Phase-4 classification>` — **R-rule pending from Story A retro:** authored *after* Phase-4, not pre-stated empty. If Phase-4 surfaces no work, this slice is omitted entirely; if it surfaces work, this slice carries it.

**R11 disposition:** per Story A retro Try-list ("defer the empty refactor commit until *after* Phase-4 classification"), Story B does **not** pre-author an empty slice 9. Slice 9 is added only if Phase-4 produces fix-now items.

## Verification

- `npm run lint && npm run build && npm test` green locally and in CI.
- 100% branch coverage on the new schema branches in `config-schema.ts` (the autoTagRules superRefine and the flatten transform).
- **Subprocess smoke test (R4):** dist boot + ingest end-to-end with a one-rule YAML; verify the tagged outcome.
- **Manual:** with `accounting.yaml` patched per the diff in the PR description, `npm run ingest` auto-tags as before. Empty/missing `autoTagRules` → every transaction `Uncategorized`; Story A's inline `+ Define new category…` recovers the UX.

## Risks / open questions

- **None blocking.** The Q1 decision (apply Story A's category validator to YAML) means a user who today has a category called `Expense` (or `Asset`/`Income`/`Liability`) in their planned YAML will be rejected at parse time. Story A merged 2026-04-28 with no such category in the codebase, and the user confirmed the validation is desired. Recovery: rename to a non-reserved leaf (e.g., `Expenses` plural).
- **Local-config drift between user and example.** Story B asks the user to apply the diff manually. If they skip it, the next ingest produces 100% `Uncategorized` (Story A's inline-define path still works). Recovery is a one-paste copy from the example.

## Suggestion log (Phase 2 critical review — P1/P2/P3)

_Populated after the `plan-reviewer` sub-agent runs; each finding tagged `adopt` / `defer` (with issue link) / `reject` (with rationale)._

## Local `accounting.yaml` patch (Q2 — manual application)

To be appended to the PR description; reproduced here for the plan's record:

```diff
--- accounting.yaml
+++ accounting.yaml
@@ end-of-file @@
+
+autoTagRules:
+  - category: Transport
+    patterns:
+      - "uber|bolt|taxi|freenow"
+  - category: Groceries
+    patterns:
+      - "carrefour|monoprix|auchan|intermarche|biocoop|leclerc"
+  - category: Fuel
+    patterns:
+      - "total|shell|bp|esso|station service"
+  - category: Restaurant
+    patterns:
+      - "restaurant|cafe|bar|brasserie|snack"
+  - category: Utilities
+    patterns:
+      - "edf|engie|veolia|orange|sfr|free|bouygues"
+  - category: BankingFees
+    patterns:
+      - "cotisation|frais bancaires|agios"
+  - category: Insurance
+    patterns:
+      - "assurance|mutuelle"
+  - category: Subscriptions
+    patterns:
+      - "netflix|spotify|prime|disney|apple\\.com|abonnement"
```
