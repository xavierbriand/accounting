# Retrospective — story-4.5c

The proof-gated wipe shipped (PR #234) — **FR21 complete, and with it Epic 4 in full**.
`accounting dissolve --bundle` erases the ledger stores only after byte-based re-verification of
the export bundle, a strict staleness gate (append-only stores: count equality is tail
equality — and dissolve's own ambient observation makes a config-edit-since-export a *detected*
staleness cause), and deliberate confirmation (typed DISSOLVE / `--confirm`); the
`dissolution-receipt.json` (0600, fsync-durable) is written before any deletion and survives
beside `accounting.yaml`. `DissolutionPerformed` lives outside the `DomainEvent` union — a
would-be `record()` of it is a compile error, the type system enforcing the model note's
"receipt-only" sentence. Full lane, 10 slices (R28), 1212 tests green. Epic 4's audit-trail
family is closed: `TransactionIngested` (4.1), `TransactionCorrected` (4.2),
`ConfigChanged` (4.5a), `DataExported` (4.5b), `DissolutionPerformed` (4.5c, receipt).

## Keep

- **Phase-2 design reversal as a feature of the loop.** The draft plan skipped observation in
  dissolve; the reviewer's coherence finding flipped it, and the flip made the model *stronger*
  (config-change staleness for free). The best design move of the story came from treating a
  review finding as a design input, not a defect report.
- **Adversarial Mode B on safety code.** Its "silent coupling" catch — config-change staleness
  held only because of an unpinned wiring line — became the story's most load-bearing new test
  (subprocess: edit config after export → dissolve refuses, DB intact).
- **Type-level model enforcement.** Out-of-union `DissolutionPerformed` + the `@ts-expect-error`
  pin turns a prose sentence in a signed note into a compile error. Cheapest possible invariant.
- **Slice-table discipline paid off** (4.5b lesson applied): 8 planned → 10 landed with the
  Phase-4 fix batch fitting inside the ceiling without history surgery beyond the top slot.

## Change

- **Fixture shapes belong in the R2 sweep too.** The staleness-coupling test initially failed on
  an invalid `autoTagRules` YAML shape (grouped `{category, patterns[]}`, not flat pairs) —
  five minutes lost that a fixture-shape note in the plan would have saved. Small, recurring
  class: the plan verifies production seams but not test-fixture seams.
- **Name the observed-command roster in one place.** Three stories running, the
  `config-change-wiring` docblock enumeration trailed reality (export missing at 4.5b review,
  dissolve missing at 4.5c review). The roster is load-bearing prose; a follow-up could derive
  the docblock's list mechanically or at least make the retro-check grep it.

## Try

- **Epic 4 is complete** — the post-Epic-4 batch unfreezes: subtraction story (#164), evals-lite
  (#165), thesis refresh (#166); product bugs #93/#103 were queued for "Epic 4 start" and are
  overdue a look; Epic 5 is fully unblocked (5.4's `ConfigChanged` dependency shipped in 4.5a).
- Glossary delta proposed this PR (user sign-off at the gate): the **stale export-proof**
  concept — a matching proof is only matching while *current*.
- No new § 8 rule minted.

## Loop metrics

plan ~250 LOC + Phase-2/4 amendments · 20 commits / 10 slices (R28) within R13 6–10 · 1212 tests
green (1 pre-existing skip; net +65 over the 4.5b baseline) · lint 0 errors / 122 warnings
(advisory family on new tests) · agents: plan-reviewer, sibling-overlap, sonnet-implementer
(clean single run), code-reviewer, ddd-modeler Mode B · Phase-2: 21 findings (15 adopted incl.
one design reversal, 2 rejected, 2 acknowledged) · Phase-4: 8 + 3 findings, **0 blockers / 0
hard violations**, fix-now batch = 1 refactor + 1 R10 slice · issues: none filed (nothing new
needed — a first) · #232/#186 unblocked by this ship.

## Action items

| Item | Where | Status |
|---|---|---|
| Staleness-coupling subprocess test (Mode B catch) | this PR (R10 slice) | Done |
| Glossary "stale export-proof" delta proposed | docs/domain/glossary.md (this PR, user-gated) | Pending sign-off at merge |
| Model-note § Model proof-matching sentence aligned to shipped shape | docs/domain/model-notes/story-4.5.md (retro commit) | Done |
| status.md: **Epic 4 complete** milestone refresh; Next options listed | docs/status.md (retro commit) | Done |
| Post-Epic-4 batch surfaced (#164/#165/#166; #93/#103 overdue) | next planning session | Pending |
