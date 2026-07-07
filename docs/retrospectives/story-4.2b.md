# Retrospective — story-4.2b

The `correct` CLI command (PR #187), second half of the 4.2 split: explicit-flag command
(`--amount`, `--category`, `--date`, `--description`, `--reason`, `--json`) that loads the
original transaction, calls 4.2a's `CorrectionService`, persists via `saveCorrection`, and
records `TransactionCorrected` at the app boundary (B1, mirroring ingest's `commitBatch`).
Adds two new `CorrectionService` guards (reject correcting a `reversal`; require ≥1 changed
field) and closes #185 (absent-vs-empty-string field detection). `ddd-modeler` Mode B: **0
conformance violations**. No new glossary vocabulary.

## Keep

- **Phase 2 caught a real security-checklist violation before any code existed.** The draft
  plan's `--amount` parsing went through `Number()`/`parseFloat` before `Money.fromDecimal` —
  exactly what `security-checklist.md` bans for money. `plan-reviewer` flagged it against the
  codebase's own established string→integer-cents pattern (`node-csv-parser.ts`'s
  `parseCentsFromString`); the plan was rewritten before Sonnet ever touched code, so the fix
  cost a plan edit, not a Phase-4 round-trip.
- **Deriving from the 4.0/4.2a precedent kept a CLI-wiring story genuinely small.** Every risky
  domain decision (reverse-and-correct shape, date rule, entry-count scope) was already settled
  in 4.2a; this story's own new surface was two guards + a bug fix + CLI plumbing — no new Core
  types, no migration. Landed in 8 slices (R28), squarely inside R13's 6–10.
- **The explicit guard-order + exit-code table Phase 2 pinned down gave Sonnet a clean,
  unambiguous spec.** No "unknowns encountered" in the Phase-3 return report about ordering or
  exit-code classification — the one genuine ambiguity Sonnet hit (an unenumerated `findById`
  read-failure case) was resolved by matching `status-command.ts`/`ingest-command.ts`'s existing
  precedent, not by guessing.
- **A quick, scoped `AskUserQuestion` mid-Phase-4 (the `--category`/`account` output label) beat
  silently picking a default.** `ddd-modeler` surfaced it as a defensible-either-way observation;
  a 30-second user call turned it into a shipped, tested behaviour instead of a retro footnote.

## Change

- **Sonnet's own "Deviations from plan" self-report missed a divergence from an *adopted*
  Phase-2 suggestion-log item.** The plan's suggestion log (item 8, ADOPTED) specified building
  scenario 5's `kind: 'reversal'` fixture directly via `Transaction.create`, not a
  `CorrectionService.correct` round-trip. The two unit-test fixtures followed it correctly; the
  acceptance-step fixture (`correct.steps.ts`) didn't — and Sonnet's return report didn't flag
  it. `code-reviewer` caught it at Phase 4 instead, one round-trip later than necessary. The
  agent spec's § 4a "Deviation case law" lists four specific triggers (shim-for-tests,
  architectural-violation, safeguard-removal, commit-bundle) but has no explicit "diff every
  ADOPTED suggestion-log row against what actually shipped" step.
- **A `fails if` comment made an inaccurate claim about what another scenario covers.** Scenario
  3's comment asserted commander's `requiredOption('--reason', ...)` rejection was "exercised
  transitively by scenario 8's real subprocess run" — untrue; scenario 8 always supplies
  `--reason`. This is an R6/R7 honesty near-miss: the comment over-claimed coverage rather than
  naming the actual (narrower) mechanism tested. Also caught only at Phase 4.
- **Check B (drift-scan plan↔source) false-positived red CI on the plan-only commit — second
  story in a row.** Both 4.2a and 4.2b's first (`chore(docs): plan + P1/P2/P3 review`) commits
  failed the `build` CI job because Check B has no way to recognize a plan's `*(new)*`-marked
  file references as *intentionally* not-yet-on-disk. Expected and self-resolving (confirmed
  against 4.2a's identical history before proceeding), but this is now a repeated, entirely
  predictable false positive rather than a one-off — worth fixing the tool, not re-explaining it
  every story.

## Try

- **Add a suggestion-log cross-check to the Phase-3 return-report checklist.** Before returning,
  Sonnet should walk every `ADOPTED` row in the plan's suggestion log and confirm the shipped
  diff actually reflects it (not just "tests pass") — would have caught the reversal-fixture
  divergence without a Phase-4 round-trip. Candidate addition to `.claude/agents/sonnet-implementer.md`
  § 4 (Return format) or § 4a.
- **Teach Check B to recognize `*(new)*`/`*(planned)*`-marked plan-table paths and suppress the
  `missing-path` finding for those specific entries**, mirroring the `*(pending)*`/`*(hole)*`
  suppression markers Check A/Check D already support. Two confirmed data points (4.2a, 4.2b)
  now; filed as [#193](https://github.com/xavierbriand/accounting/issues/193).

## Phase-4 disposition record

`code-reviewer` (4 P1, 2 P3 hard + 3 soft) + `ddd-modeler` Mode B (0 conformance violations, 2
observations) in parallel. **Fixed now** (`531ab4a`): scenario 5's reversal-kind fixture
rebuilt via direct `Transaction.create` (closes the adopted-suggestion-log-#8 divergence);
scenario 3's `fails if` comment corrected (no more over-claim about scenario 8's coverage, no
more citation to a nonexistent plan "Deviations" section); `fails if` comments added to the four
`correct-command.test.ts` describe blocks that lacked one. **User decision** (`89dceb7`):
relabel `changedFields`'s `"account"` entry to `"category"` in CLI-facing output only (`--json`
and human text) — the recorded `TransactionCorrected` event keeps Core's `"account"` vocabulary
untouched. **Acknowledged, no code change:** `findById` read-failure → exit 1 (consistent with
`status-command`/`ingest-command` precedent, already tested); 8 landed slices vs. the plan's
9-item enumeration (two closely-related pairs bundled, still within R13's range); negative-amount
CLI-boundary test gap (already correctly rejected downstream by `Transaction.create`'s
invariant, just untested at that specific layer — soft, not pursued). **Reconciled** (this PR,
user-approved 2026-07-07): [story-4.0 model note](../domain/model-notes/story-4.0.md) — new
invariant 9 (a correction may not target a `reversal`-kind transaction) added; `CorrectionService.correct`'s
tactical signature line updated to show the `reason` 4th parameter (pre-existing drift from
4.2a, not introduced here). No new CLAUDE.md rule minted — all findings were execution-level.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Split-correction (>2-entry) capability | #183 | Open, unaffected |
| Atomic audit-event recording (`UnitOfWork`) — B1 gap for ingest + correction | #180 | Open, unaffected |
| Check B: recognize `*(new)*`-marked plan paths, suppress missing-path finding | [#193](https://github.com/xavierbriand/accounting/issues/193) | Open |
| Sonnet return-report: cross-check every ADOPTED suggestion-log row against the diff | `.claude/agents/sonnet-implementer.md` (Try, not yet actioned) | Open — candidate for next harness-maintenance pass |
| Empty-string vs absent field in `CorrectionChanges` (#185) | This story | Done |
| Reject correcting a reversal (model-note invariant 9) | This story | Done |
| Reconcile 4.0-note signature drift (`reason` 4th param) | This story | Done |
| Epic 4: story-4.3 (Conversational-CFO) / 4.4 (global `--json` audit) / 4.5 (config-change + dissolution events) | Next | Not started |
