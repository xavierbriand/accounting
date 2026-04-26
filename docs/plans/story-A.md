# Story A (#73) — Inline new-category creation in ingest prompt

## Context

While ingesting a CSV, transactions whose description has no auto-tag rule fall through to `Uncategorized`. The interactive prompt offers only categories that some other transaction in the same batch already produced — there is no way to define a new one inline. Today the user must accept `Uncategorized`, finish the ingest, then manually patch the ledger.

This is **Story A** of a three-story sequence. Story A ships the immediate UX win — define a new category from inside the prompt — **without persistence**. Stories [#74 (B)](https://github.com/xavierbriand/accounting/issues/74) and [#75 (C)](https://github.com/xavierbriand/accounting/issues/75) cover loading rules from `accounting.yaml` and writing back new ones; both are out of scope here. New categories defined in this story are forgotten the moment the batch commits.

### Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning

- **Working tree:** clean; `claude/peaceful-babbage-bd209c` worktree, up to date with `origin/main` (no unmerged commits).
- **Open issues:** 10 open. #73 (this), #74 (Story B), #75 (Story C) form the sequence — proceed with A first as the spec dictates. Seven `deferred-suggestion` items remain stale-but-valid (no change). Issue #77 (buffer-state index) was filed today by the story-3.2 plan and is unrelated.
- **Open PRs:** one draft — #76 story-3.2 (Buffer State Reader). Not blocking; this story sits outside Epic 3.
- **`npm audit --audit-level=high`:** found 0 vulnerabilities.
- **Decision:** proceed to planning.

### User decisions taken before planning

- **ESC / Ctrl-C inside the new `input()` prompt:** catch `ExitPromptError` and recurse to the `select` menu (option a). Cancelling the input does **not** abort ingest — only `Abort` does.
- **Reserved-name scope:** in addition to the `Uncategorized` sentinel, reject `Asset`, `Income`, `Expense`, `Liability` (case-insensitive). These are top-level account prefixes; allowing them as leaf categories would yield ambiguous account paths like `Expense:Expense`.
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

### Validation rules (in this order)

1. Trim leading/trailing whitespace; reject empty → `"Category name cannot be empty"`.
2. Reject length > 64 → `"Category name must be 64 characters or fewer"`.
3. Reject any of `:` `/` `\` → `"Category name cannot contain ':', '/' or '\\'"` (these become path separators in account paths like `Expense:AutoInsurance`).
4. Reject reserved tokens (case-insensitive match against the trimmed name): `Uncategorized`, `Asset`, `Income`, `Expense`, `Liability` → `"'<token>' is reserved"`. The latter four are top-level account prefixes; allowing them as leaf categories would produce ambiguous account paths like `Expense:Expense`.
5. Reject case-insensitive duplicate of any name in `existing` → `"Already exists as '<canonical>'"` (suggesting the existing canonical-cased name).

Validation is a pure function returning `Result<string, string>` from `@core/shared/result.js`; the prompt's `validate` callback maps `Result.ok` → `true` and `Result.fail` → the error message string (the shape `@inquirer/prompts` expects).

## Files to change

- **[src/cli/utils/interactive.ts](../../src/cli/utils/interactive.ts)** —
  - Add `input` to the existing `@inquirer/prompts` import (line 1).
  - Add the `'__new__'` choice between change-options and `Abort` in the choices array (interactive.ts:20). Label: `'+ Define new category…'`.
  - After `select` returns, branch on `'__new__'`: call `input({ message: 'New category name:', validate: ... })`, validate via `validateNewCategoryName(raw, availableCategories)`, return `{ action: 'change', category: trimmed }`.
  - **ESC / Ctrl-C handling:** wrap the `input()` call in a `try/catch` for `@inquirer/prompts`' `ExitPromptError` (the cancel signal). On catch, recurse into `selectCategory(...)` so the user lands back at the `select` menu and can pick `Keep` / `Change to:` / `+ Define new category…` / `Abort`. This keeps the cancel path local — only `Abort` aborts the ingest.
  - Export `validateNewCategoryName` as a pure helper (kept in this file — it's short and used only here; no need for a sibling module).

- **[src/cli/commands/ingest-command.ts](../../src/cli/commands/ingest-command.ts)** — in `runInteractiveLoop` (ingest-command.ts:188):
  - When `answer.action === 'change'` and `answer.category` is not already in `categories`, push it. (The validator already rejected case-insensitive duplicates so a new name is genuinely new.) This makes the new name appear as `Change to: <name>` in subsequent iterations of the same batch.

- **[tests/unit/cli/utils/interactive.test.ts](../../tests/unit/cli/utils/interactive.test.ts)** *(new file)* — unit-test `validateNewCategoryName` exhaustively: empty/whitespace-only, oversize, each forbidden char, each reserved token (`Uncategorized`, `Asset`, `Income`, `Expense`, `Liability`) with both canonical and lowercased input, case-insensitive dup with canonical-name suggestion, happy path. Property test (fast-check): names containing none of the forbidden chars and not matching reserved/duplicates always validate after trim.

- **[tests/unit/cli/commands/ingest-command.test.ts](../../tests/unit/cli/commands/ingest-command.test.ts)** — add a test using a sequenced fake prompter (`vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)`) that:
  1. First call returns `{ action: 'change', category: 'AutoInsurance' }` (the brand-new name).
  2. Second call (next low-confidence outcome) is invoked with `availableCategories` containing `'AutoInsurance'` — assert via `prompter.selectCategory.mock.calls[1][2]`.
  3. Resolved outcome 1's `category` is `'AutoInsurance'` and `confidence` is `'high'`.

- **[tests/features/ingest.feature](../../tests/features/ingest.feature)** + **[tests/features/steps/ingest.steps.ts](../../tests/features/steps/ingest.steps.ts)** — *judge during implementation*. If a parameterised step that swaps the hard-coded auto-keep prompter at ingest.steps.ts:101 for a sequenced one stays clean (≤ ~15 LOC, no contortions), add `Scenario: user defines a new category mid-batch` and assert via the committed-ledger query that the debit row is `Expense:AutoInsurance`. If the step requires invasive plumbing, skip it — the unit-level coverage in `ingest-command.test.ts` plus manual verification is sufficient. Implementer flags the decision in the Sonnet return report.

## Reuse / what already exists (no new framework)

- `Result<T, E>` and combinators — `src/core/shared/result.ts` (Result.ok / Result.fail).
- `@inquirer/prompts` already a runtime dep (`select`, `confirm` are in use; `input` is part of the same package — no new import surface, **R3** N/A).
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
8. `refactor(cli/interactive): <whatever surfaces, or empty per R11>`

## Verification

- `npm run lint && npm run build && npm test` green locally and in CI.
- 100% branch coverage check on `validateNewCategoryName` (Core-adjacent pure helper).
- Property test (fast-check) for the validator: shrinkable inputs.
- Manual: `npm run ingest -- --file <bpce.csv>` against a fixture with at least one description that has no auto-tag rule (lands in `Uncategorized`). At the prompt pick `+ Define new category…`, type `AutoInsurance`, confirm batch. Then verify with `sqlite3 <db> "select account, amount_cents from transaction_entries where transaction_id = (select max(id) from transactions);"` that the debit row is `Expense:AutoInsurance`. Re-run ingest with another low-confidence row in the same batch and confirm the prompt offers `Change to: AutoInsurance`; cross-batch persistence is intentionally absent.

## Risks / open questions

- **None blocking.** The validation order is the only minor design choice; the order chosen above fails fastest on cheapest checks (trim/length/chars) before the case-insensitive scan over `existing`.
- **Stories B & C dependencies:** B will move category sourcing to YAML, which will eventually replace the `built.map((o) => o.category)` seed in `runInteractiveLoop`. Story A should keep that seeding logic untouched so B has a clean slot to refactor it.

## Suggestion log (Phase 2 critical review — P1/P2/P3)

_Populated after the `plan-reviewer` sub-agent runs; each finding tagged `adopt` / `defer` (with issue link) / `reject` (with rationale)._
