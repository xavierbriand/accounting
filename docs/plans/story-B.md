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

**PII note.** YAML category names are user-typed labels (the user authors their own `accounting.yaml`); error messages may echo them verbatim (e.g. `'Expense' is reserved`) without conflicting with [docs/security-checklist.md](../security-checklist.md)'s redaction rules. This mirrors the carve-out applied to Story A's inline-define path. Bank-origin PII (IBANs, bank IDs, partner names) remains subject to the no-echo convention used in `splits` validation.

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

  Scenario: TransactionBuilder uses the rules array it is constructed with (unit-tier)
    Given a TransactionBuilder constructed with rules = [{ pattern: /uber/i, category: 'Transport' }]
    When build() runs against a description containing "UBER TRIP"
    Then the outcome's category is 'Transport' with confidence 'high'
    And fails if TransactionBuilder ignores the injected rules array (guards the in-process tagging contract).

  Scenario: ingest CLI subprocess wires config.autoTagRules into TransactionBuilder (R4 — composition root)
    Given a stub accounting.yaml whose autoTagRules contains { category: 'Transport', patterns: ["uber"] }
    And a CSV containing one description "UBER TRIP 2026"
    When the dist build is invoked via spawnCli
    Then the run reports one matching transaction tagged 'Transport'
    And fails if program.ts:104 passes undefined or omits config.autoTagRules (guards the composition-root wiring; in-process unit tests cannot prove this end-to-end path).

  Scenario: two YAML groups with the same category produce two separate flat rule entries
    Given autoTagRules with two groups, both category 'Transport', each with one distinct pattern
    When parseRawConfig is invoked
    Then AppConfig.autoTagRules has length 2 with both entries category='Transport'
    And no merge / no rejection occurs
    And fails if duplicate-category groups are silently merged or rejected (guards the documented "duplicates allowed by design" decision — see § Behaviour).

  Scenario: DEFAULT_RULES symbol fully removed from src/
    Given the TypeScript source post-merge
    When fs.readdirSync('src/', { recursive: true }) walks every .ts file
    Then no file contains the literal token DEFAULT_RULES
    And fails if the constant remains anywhere (guards complete removal per the issue).

  Scenario: parseRawConfig flatten preserves order and length (property test)
    Given an arbitrary array of groups with arbitrary non-empty patterns
    When parseRawConfig flattens
    Then flat.length === sum(groups[i].patterns.length)
    And for every group i and pattern index j, flat[offset(i)+j].category === groups[i].category and flat[offset(i)+j].pattern.source comes from groups[i].patterns[j]
    And fails if the flatten loop reorders, drops, or duplicates entries (guards the order-preservation invariant).
```

The DEFAULT_RULES "grep" scenario is enforced via Node `fs.readdirSync('src/', { recursive: true })` + `fs.readFileSync` per `.ts` file (no `git`-CLI, no `.git`-directory dependency — portable across shallow clones and CI runners). The flatten property test uses `fast-check` to generate group/pattern arrays and assert order + length.

## Files to change

- **[src/core/categories/category-name.ts](../../src/core/categories/category-name.ts)** *(new)* — relocate `validateNewCategoryName` + `RESERVED_TOKENS` from `src/cli/utils/interactive.ts`. Pure; signatures preserved verbatim.
- **[src/cli/utils/interactive.ts](../../src/cli/utils/interactive.ts)** — drop the local definitions; re-import `validateNewCategoryName` and `RESERVED_TOKENS` from `@core/categories/category-name.js`. Re-export `RESERVED_TOKENS` (Story A's tests import it from this module).
- **[tests/unit/cli/utils/interactive.test.ts](../../tests/unit/cli/utils/interactive.test.ts)** — update import path from `interactive.js` → `@core/categories/category-name.js` for the validator + tokens. Pure path swap.
- **[src/core/config/app-config.ts](../../src/core/config/app-config.ts)** — add `readonly autoTagRules: readonly AutoTagRule[]` to `AppConfig`. Import `AutoTagRule` from `@core/ingest/auto-tag-rules.js`. **No re-export** — `config-schema.ts` imports `AutoTagRule` directly from `auto-tag-rules.js` to avoid a transitive `app-config.ts → config-schema.ts` import edge that could become circular if a future story has the schema return its own derived types.
- **[src/infra/config/config-schema.ts](../../src/infra/config/config-schema.ts)** — add `AutoTagRuleGroupSchema`, attach to `RawConfigSchema` with `optional().default([])` and a single `superRefine` covering both category-shape (`validateNewCategoryName(group.category, [])`) and per-pattern regex compile (`new RegExp(p, 'i')` in try/catch). In `parseRawConfig`: (a) append the flatten loop after the existing `buffers`/`recurring` transforms; (b) **add `autoTagRules` to the `Result.ok({...})` return object** so the new field reaches `AppConfig`. Import `AutoTagRule` directly from `@core/ingest/auto-tag-rules.js`.
- **[src/core/ingest/auto-tag-rules.ts](../../src/core/ingest/auto-tag-rules.ts)** — delete `DEFAULT_RULES`. Keep the `AutoTagRule` interface (still imported by `transaction-builder.ts`, `app-config.ts`, the config schema).
- **[src/core/ingest/transaction-builder.ts](../../src/core/ingest/transaction-builder.ts)** — drop the `= DEFAULT_RULES` default on the constructor's second parameter. Drop the `import { DEFAULT_RULES }` line.
- **[src/cli/program.ts](../../src/cli/program.ts)** — line 104: replace `new TransactionBuilder(accounts, undefined, nodeUuidGen)` with `new TransactionBuilder(accounts, config.autoTagRules, nodeUuidGen)`. The `config` is already in scope.
- **[src/cli/commands/ingest-command.ts](../../src/cli/commands/ingest-command.ts)** — line 230: sharpen wording per Q3-b.
- **[accounting.example.yaml](../../accounting.example.yaml)** — append `autoTagRules:` section per Q4-a (1:1 migration of the 8 DEFAULT_RULES categories, single pattern each, alternations preserved).
- **`accounting.yaml`** — **NOT TOUCHED** per Q2. The PR description includes a copy-pasteable diff (same content as the example.yaml addition) for the user to apply manually.
- **[tests/unit/core/ingest/auto-tag-rules.test.ts](../../tests/unit/core/ingest/auto-tag-rules.test.ts)** — **deleted**. The file tests `DEFAULT_RULES`, which no longer exists.
- **[tests/unit/core/ingest/transaction-builder.test.ts](../../tests/unit/core/ingest/transaction-builder.test.ts)** — extract a `TEST_RULES` constant at top of file mirroring the 2-3 patterns the tests actually exercise (Transport/uber, Groceries/carrefour, etc.); replace every `new TransactionBuilder(accounts, undefined, seqIdGen)` with `new TransactionBuilder(accounts, TEST_RULES, seqIdGen)`.
- **[tests/unit/infra/config/config-schema.test.ts](../../tests/unit/infra/config/config-schema.test.ts)** — add Story B test cases per the Gherkin scenarios above (happy path, default-empty, empty-array reject, empty-string reject, bad-regex reject, reserved-category reject, forbidden-char reject).
- **[tests/unit/core/ingest/no-default-rules.test.ts](../../tests/unit/core/ingest/no-default-rules.test.ts)** *(new)* — walks `src/` via `fs.readdirSync('src/', { recursive: true })` (Node 20+) filtered to `.ts` files, reads each with `fs.readFileSync`, and asserts the literal token `DEFAULT_RULES` is absent. No shell-out, no `git`-CLI, no `.git`-directory dependency.

- **[tests/unit/infra/config/config-schema.flatten-property.test.ts](../../tests/unit/infra/config/config-schema.flatten-property.test.ts)** *(new)* — fast-check property test for the autoTagRules flatten transform: arbitrary groups → flat preserves order, `length === sum(groups[i].patterns.length)`, every entry's `category` and `pattern.source` round-trip from input. Uses safe regex inputs (alphanumerics + simple `|`) to avoid spurious compile failures.

- **[tests/_helpers/inline-config.ts](../../tests/_helpers/inline-config.ts)** — extend `writeStubYaml` with an optional `autoTagRules?: Array<{ category: string; patterns: string[] }>` override and emit the YAML section when provided. Update the existing `tests/integration/cli/ingest-end-to-end-wiring.test.ts` to pass at least one rule (e.g., `[{ category: 'Transport', patterns: ['uber'] }]`) so its tagging assertions remain meaningful post-merge — without this update, the test still passes numerically (5/5 low-confidence still satisfies exit 2) but no longer guards what it intended to guard.

- **[tests/integration/cli/ingest-autotag-wiring.test.ts](../../tests/integration/cli/ingest-autotag-wiring.test.ts)** *(new — R4 subprocess smoke)* — runs `spawnCli(['ingest', '--file', csvPath, '--non-interactive'], { cwd: tmpDir })` against a tmp `accounting.yaml` (via `writeStubYaml` with one autoTagRule for `Transport: uber`) and a one-row CSV with description `UBER TRIP 2026`. Asserts the dist-built CLI tags it as `Transport`. Mirrors the harness pattern from `tests/integration/cli/ingest-end-to-end-wiring.test.ts`.

- **[docs/architecture.md](../architecture.md)** — add `core/categories/` to the `src/core/` tree fragment near line 86, between `core/ingest/` and `core/ledger/`, with one line: `│   │   ├── categories/        # category-name validator (shared by Story A CLI + Story B schema)`.

## Reuse / what already exists

- **`validateNewCategoryName` (Story A)** in `src/cli/utils/interactive.ts` — relocated to Core in this story; reused unchanged.
- **`Result<T, E>`** from `@core/shared/result.js`.
- **`parseRawConfig` Zod-then-transform pattern** at `src/infra/config/config-schema.ts:259-275` (Money/buffers transform) — mirrored for autoTagRules flatten.
- **`superRefine` PII-safe error pattern** from splits validation (`src/infra/config/config-schema.ts:168-194`) — error messages cite paths, not values, by convention.
- **`formatZodError`** at `src/infra/config/config-schema.ts:242-248` — emits `path: message` lines; auto-handles `[i, 'patterns', j]`.

**R3 (tool-bundle import audit):** N/A — no new framework.
**R4 (composition-root subprocess test):** **applies.** [src/cli/program.ts](../../src/cli/program.ts:104) is touched. The harness is pinned: `spawnCli` from [tests/_helpers/spawn-cli.ts:25](../../tests/_helpers/spawn-cli.ts) (drives the dist build) + `writeStubYaml` from [tests/_helpers/inline-config.ts:21](../../tests/_helpers/inline-config.ts) (extended this story to accept an `autoTagRules` override). New test file: `tests/integration/cli/ingest-autotag-wiring.test.ts` (see § Files to change).

## Scope guardrails

- **No** YAML write-back from CLI — that's Story C.
- **No** UX change to `selectCategory` or the inline-define flow.
- **No** new dependencies.
- **No** migration of `accounting.yaml` (user's local copy) — diff supplied in PR description.

## Slicing & commits (target 8–10, per **R13**)

1. `refactor(core/categories): relocate validateNewCategoryName + RESERVED_TOKENS to core; update architecture.md` *(no behaviour change; updates Story A imports + tests; tests stay green)*
2. `test(infra/config): autoTagRules schema accepts grouped rules, flattens, defaults to [] — failing`
3. `feat(infra/config): autoTagRules zod schema + parseRawConfig flatten + property test — minimal green`
4. `test(infra/config): autoTagRules rejects empty array, empty string, bad regex, bad category, accepts duplicate categories — failing` *(adds the superRefine cases + duplicate-allowed scenario)*
5. `feat(infra/config): autoTagRules superRefine (regex compile + validateNewCategoryName) — minimal green`
6. `test(core/ingest): TransactionBuilder uses injected rules; no DEFAULT_RULES in src/ — failing`
7. `feat(core/ingest)+(cli): remove DEFAULT_RULES; constructor param required; program.ts wires config.autoTagRules — minimal green` *(also deletes auto-tag-rules.test.ts and updates transaction-builder.test.ts to pass TEST_RULES; bundles the wiring change)*
8. `test(integration/cli): ingest-autotag-wiring subprocess (R4) + writeStubYaml accepts autoTagRules — failing`
9. `feat(integration/cli): writeStubYaml autoTagRules override + ingest-autotag-wiring spawnCli smoke — minimal green` *(updates the existing ingest-end-to-end-wiring test stub call to include rules so it keeps guarding what it intends)*
10. `chore(config): autoTagRules in accounting.example.yaml + sharpened --non-interactive message`
11. `refactor: <pending Phase-4 classification>` — **R-rule pending from Story A retro:** authored *after* Phase-4, not pre-stated empty. Omitted if Phase-4 produces no work.

**Slice count:** 10 expected commits in the green path (slice 11 deferred). Within R13's 6–10 ceiling at the upper end; the additional R4 subprocess pair (slices 8+9) and the property-test inclusion in slice 3 push the total. Justified by R4 applicability + the writeStubYaml hygiene fix that was missed in the initial plan and surfaced by Phase 2 review.

**R11 disposition:** per Story A retro Try-list ("defer the empty refactor commit until *after* Phase-4 classification"), Story B does **not** pre-author an empty slice 11. Slice 11 is added only if Phase-4 produces fix-now items.

## Verification

- `npm run lint && npm run build && npm test` green locally and in CI.
- 100% branch coverage on the new schema branches in `config-schema.ts` (the autoTagRules superRefine and the flatten transform).
- **Subprocess smoke test (R4):** dist boot + ingest end-to-end with a one-rule YAML; verify the tagged outcome.
- **Manual:** with `accounting.yaml` patched per the diff in the PR description, `npm run ingest` auto-tags as before. Empty/missing `autoTagRules` → every transaction `Uncategorized`; Story A's inline `+ Define new category…` recovers the UX.

## Risks / open questions

- **None blocking.** The Q1 decision (apply Story A's category validator to YAML) means a user who today has a category called `Expense` (or `Asset`/`Income`/`Liability`) in their planned YAML will be rejected at parse time. Story A merged 2026-04-28 with no such category in the codebase, and the user confirmed the validation is desired. Recovery: rename to a non-reserved leaf (e.g., `Expenses` plural).
- **Local-config drift between user and example.** Story B asks the user to apply the diff manually. If they skip it, the next ingest produces 100% `Uncategorized` (Story A's inline-define path still works). Recovery is a one-paste copy from the example.
- **ReDoS via untrusted YAML.** YAML patterns are compiled with `new RegExp(p, 'i')`. A pathological pattern (e.g. nested quantifiers) could exhibit catastrophic backtracking. The user authors their own `accounting.yaml`, so this is a self-inflicted misconfiguration risk, not an attacker-controlled input — out of scope for [docs/security-checklist.md](../security-checklist.md). Flagged for transparency only.
- **PR-description diff drift.** The Q2 manual-apply diff in the PR description duplicates `accounting.example.yaml`'s new `autoTagRules` block. If the example is later edited, the PR description diff becomes stale. Acceptable cost for a one-time post-merge user task; the next time the example changes, the contributor regenerates the diff in the new PR.

## Suggestion log (Phase 2 critical review — P1/P2/P3)

Findings from `plan-reviewer` on commit `d13dc47`. Resolutions: `adopt` (plan rewritten), `defer` (linked issue), `reject` (rationale).

| # | Phase | Finding (one-line) | Resolution | Link / reason |
| - | ----- | ------------------ | ---------- | ------------- |
| 1 | P1 | R4 subprocess harness location was deferred to Sonnet | adopt | Pinned to `tests/_helpers/spawn-cli.ts` + new `tests/integration/cli/ingest-autotag-wiring.test.ts`; named in § Files-to-change and § R4 callout. |
| 2 | P1 | R7 — old Scenario 8's `fails if` claimed wiring coverage that an in-process unit test cannot deliver | adopt | Split into a unit-tier scenario (TransactionBuilder uses injected rules) + a separate R4 scenario (subprocess wires config.autoTagRules) so each `fails if` matches its mechanism. |
| 3 | P1 | Old Scenario 9 used `git ls-files` (`.git`-dependency, brittle on shallow CI) | adopt | Reworded to use Node `fs.readdirSync(..., { recursive: true })` + `fs.readFileSync`; new test file pinned to `tests/unit/core/ingest/no-default-rules.test.ts`. |
| 4 | P1 | R6/R12/R13 compliance & FR/Epic citation | acknowledge | Compliant. |
| 5 | P2 | PII echo of YAML category names not addressed | adopt | Added "PII note" paragraph in § Behaviour, mirroring Story A's carve-out. |
| 6 | P2 | `writeStubYaml` (no `autoTagRules` field) drift would silently weaken existing `ingest-end-to-end-wiring` test post-merge | adopt | Added `tests/_helpers/inline-config.ts` to § Files-to-change with an explicit `autoTagRules` override; the existing wiring test gets one rule injected so it keeps guarding what it intended. |
| 7 | P2 | Append-only/migration/Money invariants | acknowledge | N/A — no ledger, no migration, no Money. |
| 8 | P3 | New `core/categories/` namespace not in [docs/architecture.md](../architecture.md) | adopt | Added architecture.md edit to § Files-to-change (one-line entry between `core/ingest/` and `core/ledger/` near line 86). |
| 9 | P3 | Duplicate-category groups intentional but lacked a Gherkin scenario | adopt | New scenario "two YAML groups with the same category produce two separate flat rule entries" added to the Gherkin section. |
| 10 | P3 | `AutoTagRule` import path ambiguity (re-export via `app-config.ts` vs direct from `auto-tag-rules.ts`) — risk of circular imports | adopt | Pinned to direct import from `@core/ingest/auto-tag-rules.js`; `app-config.ts` does **not** re-export. § Files-to-change updated. |
| 11 | P3 | Flatten transform's order/length invariant has no property test | adopt | New file `tests/unit/infra/config/config-schema.flatten-property.test.ts` (fast-check) + new Gherkin scenario for the flatten property; bundled into slice 3 with the feat. |
| 12 | P3 | `parseRawConfig`'s `Result.ok({...})` return-object update for the new `autoTagRules` field not explicitly listed | adopt | § Files-to-change for `config-schema.ts` now spells out (a) flatten loop AND (b) include `autoTagRules` in the return object. |
| 13 | P3 | ReDoS exposure via untrusted YAML — checklist disposition | adopt | Documented in § Risks as self-inflicted misconfiguration, not an attacker surface; no schema change. |
| 14 | P3 | Slice 1 `refactor:` with no preceding `test:` (R10) — defended by no-behaviour-change | acknowledge | Compliant. |

**DoR check.** All 14 findings have a non-blank Resolution (11 `adopt` + 3 `acknowledge` + 0 `defer` + 0 `reject`). Zero deferred → no GitHub issues filed.

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
