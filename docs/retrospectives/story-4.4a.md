# Retrospective — story-4.4a

Ingest non-interactive commit semantics (PR #214), first half of the 4.4 split: the
`--non-interactive`/`--json` path now routes through the existing `commitBatch` when no
low-confidence row is pending and keeps exit 2 + needs-review JSON + no persistence when
one is — closing #181, whose "never persists" behaviour was an accidental dry-run. JSON
shapes byte-for-byte unchanged (the envelope is 4.4b's). Reduced lane, 5 slices (R28),
974 tests green. FR20's contract story (4.4b) now documents fixed behaviour, not a bug.

## Keep

- **Audit-first via parallel workflow.** The six-auditor coverage matrix (shapes, Money,
  dates, error behaviour per command) reframed the story from "add missing flags" to
  "fix #181 first, then document" and handed 4.4b a ready-made scope (findings 1–9 in the
  plan). When four auditors hit the session rate limit, the two survivors + inline
  main-loop reads completed the same matrix without losing the structure — the schema'd
  per-command decomposition made the fallback mechanical.
- **Discovery interview before design forks.** One answer — "consumer: mostly LLM
  agents" — changed the contract's audience and made all three fork questions (envelope
  depth, error stream, #181 placement) decidable in a single round.
- **Behaviour/shape split held.** The Phase-4 sibling-overlap leg verified byte-for-byte
  that no 4.4b scope leaked (the `toDuplicatesPayload` extraction is same-shape); the
  4.4a diff stays a pure semantics fix, independently reviewable.
- **Implementer's empirical check beat the plan's letter.** The plan said "commit, then
  emit"; `commitBatch` ends in `process.exit` at the composition root, so the JSON would
  never have printed in production — invisible to unit tests with mocked `exitCode`. The
  deviation was disclosed with rationale, and Phase 4 pinned the chosen order with a test.

## Change

- **Trace process-terminating helpers at plan time.** The "commit, then emit" sequencing
  instruction was impossible as written because `commitBatch`'s final `exitCode(0)` halts
  the process. When a plan sequences work around a helper whose last act is
  `exitCode`/`process.exit`, the plan phase should trace that side effect before
  prescribing an order.
- **`— failing` label honesty on bundled Gherkin.** Scenario 2's acceptance scenario rode
  in slice 1's `— failing` commit while already green (the guard predates the fix); its
  correct home was an R10 `— green on landing` commit like its unit-level sibling.
  Already-green scenarios should land under their own honest label.
- **R2 surface sections should enumerate newly-*reachable* paths, not just changed
  code.** "Commits nothing and exits 0, as today" undersold what the unconditional
  `commitBatch` call now does on an all-duplicate re-ingest: full lifecycle on an empty
  batch, including a phantom `TransactionIngested` with empty `transactionIds` — caught
  at Phase 4, now #215.

## Try

- **4.4b contract doc states the failure discipline explicitly:** success-shaped JSON can
  be on stdout when the commit later fails (exit 3/4) — consumers must branch on the exit
  code before trusting stdout. Test (h) pins the interleaving; the doc makes it a rule.
- **Enumerate newly-reachable failure paths as R10 pin candidates at plan time.** The
  plan named exit 3/4 as newly reachable but planned no test for them; Phase 4 had to
  add one. A plan section that lists "paths this change makes reachable" maps 1:1 onto
  green-on-landing regression pins.

## Loop metrics

plan 252 LOC · diff (src+tests) 157/31 LOC (+/-) · 5 slices (R28) under the R13 range —
intentionally small story · 974 tests green (1 pre-existing skip) · 1 audit workflow
(6 auditors, 4 rate-limited → inline fallback) · 1 overlap agent per phase-2/4 ·
1 code-reviewer · 1 implementer (registered `sonnet-implementer`, no launch failures —
contrast story-4.3b) · Phase-4 fixes applied inline (test-only, R9-scale).

## Action items

| Item | Where | Status |
|---|---|---|
| #213 filed: `--dry-run` preview flag (deferred affordance) | #213 | Done at DoD |
| #215 filed: empty-batch commit lifecycle / phantom event decision | #215 | Done at DoD |
| #180 annotated: non-atomic `record()` now reachable from scripted callers | #180 comment | Done at DoD |
| status.md Next line advances to 4.4b / 4.5 | docs/status.md (this PR) | Done |
| 4.4b planning inherits audit findings 1–9 + envelope/error-stream fork decisions | docs/plans/story-4.4a.md §§ Fork decisions, Coverage audit | Open (next session) |
