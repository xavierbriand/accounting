# Story A retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/78  **Closed:** 2026-04-28 (pending merge)

## Keep

- **First real-story dogfood of both agents (`plan-reviewer` and `code-reviewer`) was productive.** Plan-reviewer surfaced 12 actionable findings on a 100-line plan; code-reviewer surfaced 6 fix-now items on a 7-commit diff. Most importantly, no finding was a hallucination — every flag pointed at a real artefact (file:line, missing assertion, undeclared dep, plan-vs-code drift). This closes the open action item from [story-maint-15](story-maint-15.md) ("First real-story dogfood for both agents at Story 3.2") — Story A reached the milestone first and the dogfood read clean.
- **Clarifying questions before plan-write changed plan quality.** The user explicitly asked me to surface the three open design questions (ESC handling, reserved-token scope, BDD scenario gating) *before* presenting a plan, after the first plan-attempt was already written. Once asked, the plan came back tighter, the answers were locked in §"User decisions taken before planning", and Phase-2 review found no architectural disagreements — only documentation gaps. The new memory `feedback_planning_clarifying_questions.md` codifies this.
- **Validation as a pure exported helper paid off twice.** `validateNewCategoryName` is testable in 37 unit tests + 1 fast-check property test without spinning up `@inquirer/prompts` machinery. The same shape lets the in-prompt `validate` callback reuse it directly. Property test caught nothing in this story but is the cheap insurance against future rule additions.
- **Phase-2 elevated the plan from issue-spec to spec-with-rationale.** Issue #73 was already detailed; the plan-reviewer pushed it from "good spec" to "spec that documents *why* every choice was made" — the case-insensitive reserved-token expansion, the loop-vs-recursion choice, the locale-determinism mandate. Future readers can reconstruct the design conversation from the plan alone.

## Change

- **Plan-reviewer should explicitly check for *factually verifiable* import paths.** The plan asserted `import { …, ExitPromptError } from '@inquirer/prompts'` based on the convention that inquirer re-exports its core types. Plan-reviewer's R2 audit didn't catch the mistake (it can't run code), and Sonnet only discovered it at implementation time. Worth a try in plan-reviewer's checklist: when a plan names a specific import, sample the package and confirm the export exists. Cheap; would catch this class of error pre-implementation.
- **Empty refactor commit (R11) creates an awkwardness when Phase-4 surfaces real work.** The slice-8 commit `35e6764` was authored with body "code-review surfaced no improvements; pipeline and loop already minimal" — *before* code-review actually ran. Code-reviewer then surfaced 6 fix-now items, making the commit's premise stale. Force-push was denied by harness policy (correctly), so the empty commit had to stay and the real refactor landed as a follow-up `5ff8beb`. It's not wrong, but it's not clean either. **R11 should be authored *after* code-review, not before** — pre-stating an empty commit's justification is fine; pre-*landing* it is over-eager. Try R11.5: "Author the slice-8 refactor commit only after Phase-4 code-review classification completes; if findings produce no work, *then* land it empty."
- **The plan-reviewer's R6/R8/R12 boilerplate produced acknowledge-only rows that crowded the suggestion log.** Of the 12 Phase-2 findings, 4 were "this rule applies/N/A — no action" observations. They aren't wrong to surface (transparency is a feature), but the table got long. Consider: the agent could omit pure compliance-confirmations from the findings list and only report exceptions or gaps. The agent spec could prompt for "list rule-applicability separately from findings." Try in [story 3.2](https://github.com/xavierbriand/accounting/pull/76).
- **`@inquirer/core` declaration could have been pre-empted.** The plan assumed inquirer exports were stable across versions. A 30-second `npm view @inquirer/prompts@8.4.2` in Phase 1 exploration would have shown the package's exports table. The Explore agent didn't run a "verify named imports exist" pass. Cheap; worth adding to Phase-1 checklist when a plan names specific symbols.

## Try

- **Plan-reviewer Phase-2 sub-rule: verify named import symbols exist before locking the plan.** When the plan mentions `import { X } from 'pkg'`, the reviewer (or Phase-1 Explore) confirms `X` is in `pkg`'s exports for the version in `package.json`. One `node -e "console.log(Object.keys(require('pkg')))"` away. Could prevent the import-path deviation we hit here.
- **R-rule: defer the empty refactor commit until after Phase-4.** Re-author slice 8 in the plan template as "*pending* refactor — to be authored after code-review classification; may be empty per R11 with the documented justification." The commit lands either as the real refactor or as the empty placeholder, whichever Phase-4 dictates. Codify in next process-touching PR.
- **Codify "category names are user labels, not third-party PII" in `docs/security-checklist.md` so Phase-2 reviewers don't keep flagging it.** A one-line addition under the redaction section: "User-typed labels (category names, account aliases) are not subject to the redaction rule — they're the user's own classifiers, not third-party identifiers." Prevents the same Phase-2 P2 finding from re-firing in Stories B/C and beyond.
- **R16 codification still pending** (carry-over from [story-maint-15](story-maint-15.md)). Story A is not zero-code, so it doesn't add a data point — but the pending action remains for the next process-touching PR.
- **Privacy: do not paste real merchant strings into committed artefacts.** Saved as a feedback memory (`feedback_no_private_details_in_plans.md`); the user caught me pasting a real merchant name into the harness plan file. The hook fires on plan files, retros, fixtures, commits — anywhere on disk. Codified at the memory level; no rule change needed, but worth surfacing in Try-list so the next contributor sees the precedent.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** Plan-reviewer's R2 surface drift was caught and fixed in Phase-4 (`5ff8beb`); the plan now correctly describes the dual-import. No CLAUDE.md changes needed for this story (no new R-rule landed; Try-list defers R16 + new R-rules to the next process-touching PR).
- [x] If yes, reconciled in this PR? N/A.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `validateNewCategoryName` + `RESERVED_TOKENS` exports | `src/cli/utils/interactive.ts` | done |
| `'+ Define new category…'` choice + `while(true)` loop + `ExitPromptError` catch | `src/cli/utils/interactive.ts` | done |
| Push new category into in-batch `categories` array | `src/cli/commands/ingest-command.ts` | done |
| 37 unit + 1 property test for validator + 3 tests for `selectCategory` branch | `tests/unit/cli/utils/interactive.test.ts` | done |
| Propagation test asserting `saveBatch` payload + ESC re-show same-args assertion | `tests/unit/cli/commands/ingest-command.test.ts` | done |
| `@inquirer/core ^11.1.9` declared as direct dep | `package.json` | done |
| Plan-reviewer "verify named imports exist" sub-rule | future `plan-reviewer` spec edit | open |
| R-rule: defer empty R11 refactor commit until after Phase-4 | next process-touching PR (CLAUDE.md § 8) | open |
| `docs/security-checklist.md` carve-out for user-typed labels | future `docs/security-checklist.md` edit | open |
| R16 codification (R15-extension to zero-code stories) | next process-touching PR (carry-over from maint-15) | open |
| `docs/status.md` log entry for Story A | this PR (pending) | open |
| End-to-end BDD scenario for define-new mid-batch | future Story B or C | open |
