# Story A (#73) — Inline new-category creation in ingest prompt

## Context

While ingesting a CSV, transactions whose description has no auto-tag rule fall through to `Uncategorized`. The interactive prompt offers only categories that some other transaction in the same batch already produced — there is no way to define a new one inline. Today the user must accept `Uncategorized`, finish the ingest, then manually patch the ledger.

This is **Story A** of a three-story sequence. Story A ships the immediate UX win — define a new category from inside the prompt — **without persistence**. Stories [#74 (B)](https://github.com/xavierbriand/accounting/issues/74) and [#75 (C)](https://github.com/xavierbriand/accounting/issues/75) cover loading rules from `accounting.yaml` and writing back new ones; both are out of scope here. New categories defined in this story are forgotten the moment the batch commits.

**Epic / FR alignment.** This is a UX enhancement to **Epic 2 / Story 2.4 (Interactive Ingest Command)** — see [docs/epics.md:169](../epics.md). Functional-requirements citation: **FR5** ("User can interactively Tag transactions" — [docs/prd.md:245](../prd.md)). FR6 (auto-tagging) is unchanged.

### Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning

- **Working tree:** clean; `claude/peaceful-babbage-bd209c` worktree, up to date with `origin/main` (no unmerged commits).
- **Open issues:** 10 open. #73 (this), #74 (Story B), #75 (Story C) form the sequence — proceed with A first as the spec dictates. Seven `deferred-suggestion` items remain stale-but-valid (no change). Issue #77 (buffer-state index) was filed today by the story-3.2 plan and is unrelated.
- **Open PRs:** one draft — #76 story-3.2 (Buffer State Reader). Not blocking; this story sits outside Epic 3.
- **`npm audit --audit-level=high`:** found 0 vulnerabilities.
- **Decision:** proceed to planning.

### User decisions taken before planning

- **ESC / Ctrl-C inside the new `input()` prompt:** catch `ExitPromptError` and re-show the `select` menu (option a). Cancelling the input does **not** abort ingest — only `Abort` does.
- **Reserved-name scope:** in addition to the `Uncategorized` sentinel, reject `Asset`, `Income`, `Expense`, `Liability` (case-insensitive). These are top-level account prefixes; allowing them as leaf categories would yield ambiguous account paths like `Expense:Expense`. *Note: this expands the issue body's case-sensitive `Uncategorized` rule to a case-insensitive five-token list — pre-approved by the user during planning.*
- **BDD scenario:** *judge during implementation* (option c). Add only if the parameterised step stays clean (≤ ~15 LOC); otherwise skip and rely on unit + manual coverage. Implementer flags the decision in the Sonnet return report.

## Production-code surface (R2)

- **New exported pure function** in `src/cli/utils/interactive.ts`:
  ```ts
  export function validateNewCategoryName(
    raw: string,
    existing: readonly string[],
  ): Result<string, string>;
  ```
  Returns the trimmed name on success; on failure returns a human-readable message. Imported only by `selectCategory` (for the `@inquirer/prompts` `validate` callback) and by the unit tests.
- **No change** to the `SelectCategoryResult` union or to the `InteractivePrompter` interface — the existing `{ action: 'change'; category: string }` variant already carries an arbitrary string.
- **No change** to the public CLI surface (no new flags, no JSON-shape change).

## Behaviour

`selectCategory()` gains a `+ Define new category…` choice between the `Change to:` options and the `Abort` option. Selecting it opens an `@inquirer/prompts` `input()` whose `validate` callback wraps `validateNewCategoryName`. On submit, `selectCategory` returns `{ action: 'change', category: <typed-and-trimmed> }`. The caller (`runInteractiveLoop` in `ingest-command.ts`) pushes the new name into its in-memory `categories` array so it appears as a `Change to: <name>` option for the *rest of this batch only*.

**PII note.** Category names are user-typed labels meant to surface in the user's own ledger (`Expense:<category>`). They are **not** bank identifiers, IBANs, or third-party PII — error messages may echo them verbatim (e.g. `"Already exists as 'Groceries'"`) without conflicting with the redaction rules in [docs/security-checklist.md](../security-checklist.md).

### Validation rules (in this order)

1. Trim leading/trailing whitespace; reject empty → `"Category name cannot be empty"`.
2. Reject length > 64 → `"Category name must be 64 characters or fewer"`.
3. Reject any of `:` `/` `\` → `"Category name cannot contain ':', '/' or '\\'"` (these become path separators in account paths like `Expense:AutoInsurance`).
4. Reject reserved tokens (case-insensitive whole-string match against the trimmed name): `Uncategorized`, `Asset`, `Income`, `Expense`, `Liability` → `"'<token>' is reserved"`. The latter four are top-level account prefixes; allowing them as leaf categories would produce ambiguous account paths like `Expense:Expense`. *Whole-string check — a name like `uncategorizedExpenses` is permitted.*
5. Reject case-insensitive duplicate of any name in `existing` → `"Already exists as '<canonical>'"` (suggesting the existing canonical-cased name).

Validation is a pure function returning `Result<string, string>` from `@core/shared/result.js`; the prompt's `validate` callback maps `Result.ok` → `true` and `Result.fail` → the error message string (the shape `@inquirer/prompts` expects). **Locale-determinism:** all case-insensitive comparisons use `String.prototype.toLowerCase()` (ASCII-only, locale-independent) — **not** `toLocaleLowerCase()`, which would couple correctness to runtime locale (e.g. Turkish dotless-i) and break determinism (FR22-spirit).

## Gherkin scenarios (R6)

```gherkin
Feature: Inline new-category creation in ingest prompt

  Scenario: validator accepts a fresh category name (happy path)
    Given the existing categories are ["Groceries", "Uncategorized"]
    When the user submits "AutoInsurance"
    Then validateNewCategoryName returns Result.ok("AutoInsurance")
    And fails if the validator rejects a non-reserved, non-duplicate, well-formed name (guards rule-pipeline correctness in src/cli/utils/interactive.ts).

  Scenario: validator trims whitespace and rejects empty input
    When the user submits "   "
    Then validateNewCategoryName returns Result.fail("Category name cannot be empty")
    And fails if a whitespace-only or empty submission slips through to the in-memory categories array (guards rule 1).

  Scenario: validator rejects path-separator characters
    Given existing categories are []
    When the user submits "Travel/Hotels"
    Then validateNewCategoryName returns Result.fail with a message naming ':', '/', and '\\'
    And fails if a separator-bearing name reaches the account-path concatenation in commit (guards rule 3 — the gate against account-path corruption).

  Scenario: validator rejects reserved account-prefix tokens (case-insensitive)
    Given existing categories are []
    When the user submits "expense"
    Then validateNewCategoryName returns Result.fail("'expense' is reserved")
    And fails if a top-level account prefix becomes a leaf category, producing "Expense:expense" (guards rule 4).

  Scenario: validator suggests the canonical case on duplicate
    Given existing categories are ["Groceries"]
    When the user submits "groceries"
    Then validateNewCategoryName returns Result.fail("Already exists as 'Groceries'")
    And fails if a case-variant duplicate is admitted, producing parallel categories (guards rule 5 + canonical-name suggestion).

  Scenario: selectCategory propagates a newly-defined name to the next iteration
    Given two low-confidence outcomes
    And the prompter returns "+ Define new category…" then "AutoInsurance" for outcome 1
    And the prompter returns "keep" for outcome 2
    When runInteractiveLoop processes both
    Then outcome 2's selectCategory is called with availableCategories containing "AutoInsurance"
    And outcome 1's resolved category is "AutoInsurance" with confidence "high"
    And fails if the new name is dropped between iterations (guards the categories-array push in src/cli/commands/ingest-command.ts:188).

  Scenario: ESC inside the input re-shows the select menu (cancel is local)
    Given selectCategory has shown its menu
    When the user picks "+ Define new category…" then presses ESC at the input
    Then ExitPromptError is caught
    And the select menu re-displays with the same currentCategory and availableCategories
    And the user can then pick "Abort" to abort ingest
    And fails if ESC at the input bubbles out of selectCategory and aborts the whole ingest (guards the cancel-is-local UX decision).
```

The `Scenario: user defines a new category mid-batch` end-to-end BDD scenario is conditional — see § "Files to change", `tests/features/ingest.feature` bullet.

## Files to change

- **[src/cli/utils/interactive.ts](../../src/cli/utils/interactive.ts)** —
  - Update the existing `@inquirer/prompts` import (line 1) to add `input`: `import { select, confirm, input } from '@inquirer/prompts';`.
  - Add a second import for the cancel-signal class: `import { ExitPromptError } from '@inquirer/core';`. *(Phase-4 deviation: `@inquirer/prompts@8.4.2` does not re-export `ExitPromptError`; only `@inquirer/core` does. `@inquirer/core` is now declared as a direct runtime dependency in [package.json](../../package.json) — see Suggestion log row 5 — so the import is on a first-party contract, not a transitive accident.)*
  - Add the `'__new__'` choice between change-options and `Abort` in the choices array (interactive.ts:20). Label: `'+ Define new category…'`.
  - After `select` returns, branch on `'__new__'`: call `input({ message: 'New category name:', validate: ... })`, validate via `validateNewCategoryName(raw, availableCategories)`, return `{ action: 'change', category: trimmed }`.
  - **ESC / Ctrl-C handling:** wrap the entire `select` + `input` flow in a `while (true)` loop. Catch `ExitPromptError` from the `input()` call; on catch, `continue` so the loop re-runs `select` from the top with the same `currentCategory` and `availableCategories`. The user lands back at the menu and can pick `Keep` / `Change to:` / `+ Define new category…` / `Abort`. Only `Abort` aborts ingest. (Loop, not recursion — clearer control flow, no stack growth, easier to read.)
  - Export `validateNewCategoryName` as a pure helper (kept in this file — it's short and used only here; no need for a sibling module).

- **[src/cli/commands/ingest-command.ts](../../src/cli/commands/ingest-command.ts)** — in `runInteractiveLoop` (ingest-command.ts:188):
  - When `answer.action === 'change'` and `answer.category` is not already in `categories`, push it. (The validator already rejected case-insensitive duplicates so a new name is genuinely new.) This makes the new name appear as `Change to: <name>` in subsequent iterations of the same batch.

- **[tests/unit/cli/utils/interactive.test.ts](../../tests/unit/cli/utils/interactive.test.ts)** *(new file)* — unit-test `validateNewCategoryName` exhaustively per the Gherkin scenarios above: empty/whitespace-only, oversize, each forbidden char, each reserved token (`Uncategorized`, `Asset`, `Income`, `Expense`, `Liability`) with both canonical and lowercased input plus a confirming `uncategorizedExpenses` non-match, case-insensitive dup with canonical-name suggestion, happy path. Property test (fast-check): names containing none of the forbidden chars and not matching reserved/duplicates always validate after trim.

- **[tests/unit/cli/commands/ingest-command.test.ts](../../tests/unit/cli/commands/ingest-command.test.ts)** — add a test using a sequenced fake prompter (`vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)`) covering Gherkin scenario "selectCategory propagates a newly-defined name to the next iteration":
  1. First call returns `{ action: 'change', category: 'AutoInsurance' }` (the brand-new name).
  2. Second call (next low-confidence outcome) is invoked with `availableCategories` containing `'AutoInsurance'` — assert via `prompter.selectCategory.mock.calls[1][2]`.
  3. Resolved outcome 1's `category` is `'AutoInsurance'` and `confidence` is `'high'`.

- **[tests/features/ingest.feature](../../tests/features/ingest.feature)** + **[tests/features/steps/ingest.steps.ts](../../tests/features/steps/ingest.steps.ts)** — *judge during implementation*. If a parameterised step that swaps the hard-coded auto-keep prompter at ingest.steps.ts:101 for a sequenced one stays clean (≤ ~15 LOC, no contortions), add `Scenario: user defines a new category mid-batch` and assert via the committed-ledger query that the debit row is `Expense:AutoInsurance`. If the step requires invasive plumbing, skip it — the unit-level coverage in `ingest-command.test.ts` plus manual verification is sufficient. Implementer flags the decision in the Sonnet return report.

## Reuse / what already exists (no new framework)

- `Result<T, E>` and combinators — `src/core/shared/result.ts` (Result.ok / Result.fail).
- `@inquirer/prompts` already a runtime dep (`select`, `confirm` already in use; `input` is from the same package). `@inquirer/core` is added as a *direct* dep (`^11.1.9`) for the `ExitPromptError` class only — it was already a transitive dep of `@inquirer/prompts`, so this is a declaration of an existing runtime presence, not a new framework. **R3** still N/A.
- `runInteractiveLoop`'s mutable local `categories` array (ingest-command.ts:188) is the natural place for in-memory persistence — no new state container needed.

## Scope guardrails

- **No** YAML read/write. **No** `autoTagRules` mutation. **No** persistence between batches (Stories B & C).
- **No** changes to `program.ts` → composition-root subprocess test (**R4**) does not apply.
- **No** new framework / library import → tool-bundle audit (**R3**) does not apply.

## Slicing & commits (target 6–8, per **R13**)

1. `test(cli/interactive): validateNewCategoryName rules — failing`
2. `feat(cli/interactive): validateNewCategoryName rules — minimal green`
3. `test(cli/interactive): selectCategory '+ Define new category…' branch — failing` *(via ingest-command test, sequenced prompter; covers happy path + ESC re-show)*
4. `feat(cli/interactive): wire input() prompt to define-new branch with ExitPromptError re-show — minimal green`
5. `test(cli/ingest): new category appears in subsequent prompts — failing`
6. `feat(cli/ingest): push new category into in-memory list — minimal green`
7. *(optional, per BDD-judgment-call above)* `test(features/ingest): user defines a new category mid-batch — failing` → green in same commit if tight.
8. `refactor(cli/interactive): <see R11 justification below, or empty>`

**R11 justification (slice 8).** The validator pipeline (rules 1–5) and the `select`/`input` loop are likely to surface small cleanups during code-review (rule-table extraction, error-string consolidation, helper for `'__new__'` sentinel). Slice 8 is reserved as a *prepared landing pad*. If code-review surfaces no improvement worth landing, slice 8 ships as an empty `refactor:` commit with the justification body "code-review surfaced no improvements; pipeline and loop already minimal" — which is the documented R11 use case. Pre-stating this avoids a Phase-4 negotiation about whether to skip slice 8.

## Verification

- `npm run lint && npm run build && npm test` green locally and in CI.
- 100% branch coverage on `validateNewCategoryName` — pure helper, ASCII-only, fully testable. *Note: this helper sits in `src/cli/utils/`, not `src/core/`, so the 100%-branch mandate from CLAUDE.md § 5 does not formally apply; we adopt it as a story-level target because the function is pure and the cost is trivial.*
- Property test (fast-check) for the validator: shrinkable inputs.
- Manual: `npm run ingest -- --file <bpce.csv>` against a fixture with at least one description that has no auto-tag rule (lands in `Uncategorized`). At the prompt pick `+ Define new category…`, type `AutoInsurance`, confirm batch. Then verify with `sqlite3 <db> "select account, amount_cents from transaction_entries where transaction_id = (select max(id) from transactions);"` that the debit row is `Expense:AutoInsurance`. Re-run ingest with another low-confidence row in the same batch and confirm the prompt offers `Change to: AutoInsurance`; cross-batch persistence is intentionally absent.

## Risks / open questions

- **None blocking.** The validation order is the only minor design choice; the order chosen above fails fastest on cheapest checks (trim/length/chars) before the case-insensitive scan over `existing`.
- **Stories B & C dependencies:** B will move category sourcing to YAML, which will eventually replace the `built.map((o) => o.category)` seed in `runInteractiveLoop`. Story A should keep that seeding logic untouched so B has a clean slot to refactor it.
- **Duplicate-detection scope (Story A only).** `existing` is the in-batch `categories` array (built from `built.map((o) => o.category)` plus `'Uncategorized'`). Auto-tag-rule names defined in `accounting.yaml` that produced **zero** transactions in the current batch are **not** in `existing` and therefore won't block creation of a same-named "new" category. This is acceptable for Story A (no YAML coupling yet). Story B (#74) will broaden the seed source to include all configured rule names — at which point this gap closes naturally. No defensive code in Story A.

## Suggestion log (Phase 2 critical review — P1/P2/P3)

Findings from the `plan-reviewer` sub-agent run on commit `489e678`. Each row is `adopt` (plan rewritten to incorporate), `defer` (linked issue), or `reject` (rationale).

| # | Phase | Finding (one-line) | Resolution | Link / reason |
| - | ----- | ------------------ | ---------- | ------------- |
| 1 | P1 | No FR/epic citation in plan Context | adopt | Added "Epic / FR alignment" paragraph citing Epic 2 / Story 2.4 + FR5. |
| 2 | P1 | No Gherkin scenarios; only prose unit-test descriptions (R6 gap) | adopt | New "Gherkin scenarios (R6)" section with 7 scenarios + `fails if` clauses each. |
| 3 | P1 | ESC/Ctrl-C re-show path has no documented test scenario | adopt | Added `Scenario: ESC inside the input re-shows the select menu` to Gherkin section. |
| 4 | P1 | Duplicate-detection scope: auto-tag-rule names not produced in batch escape the dup check | adopt | Documented in § Risks ("Duplicate-detection scope") with explicit note that Story B closes the gap. |
| 5 | P2 | PII risk for echoed category names not addressed | adopt | Added "PII note" paragraph in § Behaviour clarifying category names are user-assigned labels, not third-party PII. |
| 6 | P2 | Reserved-token escalation (case-insensitive 5-token vs issue body's case-sensitive single token) is undocumented scope expansion | reject | Pre-approved by user during planning (recorded in § "User decisions taken before planning"); not silent expansion. |
| 7 | P3 | "Core-adjacent" coverage label misleading; helper sits in CLI layer | adopt | § Verification reworded — explicitly notes 100% branch coverage is a story-level target, not a CLAUDE.md § 5 mandate. |
| 8 | P3 | `toLowerCase()` vs `toLocaleLowerCase()` not specified; locale-determinism risk | adopt | § Behaviour final paragraph mandates `toLowerCase()` (ASCII, locale-independent). |
| 9 | P3 | Recursion vs `while` loop on ExitPromptError — no rationale for chosen idiom | adopt | Switched plan to `while (true)` loop (§ Files to change, `interactive.ts` bullet). |
| 10 | P3 | `ExitPromptError` import symbol unspecified | adopt | § Files to change names the full import line: `import { select, confirm, input, ExitPromptError } from '@inquirer/prompts';`. |
| 11 | P3 | Slice 8 R11 placeholder lacks pre-stated justification body | adopt | Added explicit "R11 justification (slice 8)" subsection under § Slicing & commits. |
| 12 | P3 | Slice 1/3 commit subjects borderline R12 (feature-name vs summary-verb) | reject | Subjects describe behaviour-being-added with summary phrases ("validateNewCategoryName rules", "selectCategory '+ Define new category…' branch"); not scenario enumeration. Matches the established repo convention (cf. `story-maint-15: refresh README.md…`). |

Observation-only findings (no action required, recorded for transparency): R1–R4 compliance, R8 N/A (no new structured output), R10 N/A, R14 N/A, R15 N/A; SQL-injection N/A (prepared statements upstream); path-traversal compliant (rule 3 blocks `:` `/` `\`); Zod boundary N/A; function-size compliant.

**DoR check.** All 12 actionable findings have a non-blank Resolution. Zero rows tagged `defer`, so no GitHub issue links required.

### Phase-4 retro-check (code-reviewer findings on commit `35e6764`)

| # | Phase | Finding (one-line) | Resolution | Link / reason |
| - | ----- | ------------------ | ---------- | ------------- |
| 1 | P1 | Propagation test asserts `stdout` proxy, not `confidence: 'high'` directly | fix-now | `tests/unit/cli/commands/ingest-command.test.ts` propagation test now spies on `saveBatch` and asserts outcome 1's `category: 'AutoInsurance', confidence: 'high'` and outcome 2's preserved `category: 'Uncategorized', confidence: 'low'`. |
| 2 | P1 | ESC re-show test doesn't assert same args on `select` calls[1] | fix-now | Added `expect(mockSelect.mock.calls[1]).toEqual(mockSelect.mock.calls[0])`. |
| 3 | P1 | R6 fails-if comment for propagation overstates what test asserts | fix-now | Resolved by #1 — once confidence is asserted directly, the fails-if claim becomes honest. |
| 4 | P1 | Range notation `7694841..35e6764` excludes lower bound (handoff-prompt artefact) | acknowledge | Cosmetic; commit log on the PR is the authoritative ordering. |
| 5 | P2 | Undeclared transitive dep on `@inquirer/core` | fix-now | `@inquirer/core ^11.1.9` added to `dependencies` in `package.json`. Already runtime-resolved as a transitive of `@inquirer/prompts`; declaring it makes the contract explicit. |
| 6 | P2 | R2 surface drift: plan said single `@inquirer/prompts` import; code uses two | fix-now | Plan § "Files to change" updated to reflect the dual-import (Phase-4 deviation note). |
| 7 | P2 | R8 N/A confirmed | acknowledge | No new structured output. |
| 8 | P3 | `f8e4a31` commit subject drops `'+ Define new category…'` vs plan's slice 3 | acknowledge | Both forms are summary-verb; not an R12 violation. |
| 9 | P3 | TDD rhythm verified — no R10 violation | acknowledge | Each `feat:` follows its `test:` sibling. |
| 10 | P3 | R11 satisfied by refactor-commit body | acknowledge | The empty refactor commit (`35e6764`) preserved its original premise ("no improvements needed at first read"); a follow-up real refactor commit (`5ff8beb`, this set of changes) lands the Phase-4 fixes — additive history, no force-push. |
| 11 | P3 | `as unknown as` cast in test for `mockSelect.mock.calls[0][0].choices` | acknowledge | Acceptable in test files; the cast crosses inquirer's complex generics for a single read. |
| 12 | P3 | `RESERVED_TOKENS` was module-private; property test maintained a parallel hand-rolled copy that could drift | fix-now | Constant exported from `interactive.ts`; the property test imports and uses it. Future token additions stay in sync automatically. |

**Phase-4 DoR check.** 6 fix-now items addressed in a single follow-up refactor commit (`5ff8beb`, on top of the empty `35e6764`). 6 acknowledge items recorded above. Zero defer items, so no GitHub issues filed. The Phase-4 refactor preserves behaviour (no production-code logic changes beyond the `export` keyword on `RESERVED_TOKENS` and a stronger test assertion that already passes given the existing implementation); all 330 unit tests stay green. **Slice count:** 8 commits total — within R13's 6–10 target band.
