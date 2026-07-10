# Retrospective — story-4.4b

Global JSON contract shipped (PR #216), completing FR20 and the 4.4 split. All five
`--json` commands now emit one compact envelope — `{command, ok: true, data}` on stdout,
`{command, ok: false, error: {code, message, suggestedAction?, details?}}` as the final
stderr line on failures — with camelCase keys, `Money.toString()` amounts, an 8-code
error registry disambiguating the overloaded exit 2, and the contract documented for
LLM-agent consumers at docs/cli-json-contract.md. Exit codes and persistence semantics
byte-identical throughout (verified by the Phase-4 overlap leg). Categorize's two silent
paths (zero-groups empty stdout, non-interactive prose-only exit 2) fixed; correct's
`changedFields` realigned to domain vocabulary; dead `rulesSkippedAsDuplicate` dropped
(#104 is the honest reintroduction path). Reduced lane, 9 slices (R28), 1010 tests green.

## Keep

- **Inheritance-driven planning.** 4.4a's coverage audit + fork decisions turned 4.4b's
  Phase 1 into a four-question residual-forks interview instead of a re-discovery; the
  plan was authored, reviewed, and DoR-complete in one sitting.
- **Mechanics map before the R2 section.** A single Explore sweep (per-command emission
  sites, the two exit-code conventions, the shape-pinning test inventory) made the R2
  surface and flip inventory precise enough that the implementer reported *zero blocking
  unknowns* across a 36-file diff.
- **Blanket principle resolved a scope judgment without a round-trip.** The plan's
  failure-discipline clause ("every `--json`-reachable failure path emits the envelope")
  let the implementer extend coded envelopes to categorize's shared CSV-loading sites
  the plan's per-command bullet hadn't enumerated — disclosed as a deviation, confirmed
  in-scope at Phase 4 by both review legs.
- **Same-agent fix batch.** Phase-4 fixes went back to the *same* implementer agent via
  a continuation message; it still knew which production path each new test guarded, so
  the R6 comment pass named concrete file:line sites in one round and lint returned to
  the origin/main baseline exactly.

## Change

- **Per-command R2 bullets must enumerate failure sites even when a blanket clause
  exists.** Ingest's bullet spelled its sites out; categorize's didn't, and Phase 4 had
  to amend the plan (finding 19). The blanket principle governs *behaviour*; the R2
  section documents *surface* — the two aren't substitutes.
- **State R6 explicitly for unit tests in the implementer handoff.** The implementer
  applied `fails if` notes rigorously to feature scenarios (where the prompt named them)
  but skipped them on ~25 new unit tests across 6 files — the largest Phase-4 finding
  by volume, entirely mechanical to fix, entirely avoidable at handoff.
- **Push ownership was violated without consequence — tighten or drop the instruction.**
  The implementer pushed the branch mid-Phase-3 despite "do NOT push." Content matched
  local exactly so nothing broke, but R18's one-agent-per-branch discipline only works
  if the main session owns the push; the sonnet-implementer spec should state push
  ownership as a hard rule rather than leaving it to per-prompt instructions.

## Try

- **Assertion budgets when appending to existing tests.** All 3 net-new
  assertion-roulette warnings came from appending envelope asserts onto tests already
  near the 5-assertion threshold. Next shape-change story: plan "split, don't append"
  for any pinned test at ≥4 assertions.
- **R31 (minted this retro):** any PR that changes a `--json` output shape, error code,
  or exit-code mapping must update docs/cli-json-contract.md in the same PR. The
  contract doc is now the product surface agents program against; without a same-PR
  rule it drifts the first time a formatter changes.

## Loop metrics

plan 333 LOC (+58 Phase-4 amendments) · diff 36 files, src ~+320/−90, tests ~+900/−280
LOC (+/-) · 9 slices (R28) within R13 · 1010 tests green (1 pre-existing skip) · lint
97 warnings / 0 errors — identical to origin/main baseline · agents: 1 Explore
(mechanics map), 2 sibling-overlap (Phase 2 + Phase 4), 1 code-reviewer, 1 implementer
across 2 rounds (initial + Phase-4 fix batch via continuation) · Phase-4: 19 findings
(6 fix-now code/doc, 1 fix-now plan, 12 acknowledge), zero functional defects.

## Action items

| Item | Where | Status |
|---|---|---|
| DoD comment on #104: field deleted; reintroduction lands inside `data.summary` | #104 | Done at DoD |
| DoD comment on #180: audit finding 7 (silent `record()` degradation under `--json`) folded there | #180 | Done at DoD |
| R31 row added to CLAUDE.md § 8; contract-doc header cites it | CLAUDE.md (this PR) | Done |
| status.md Next line advances to 4.5; FR20 marked complete | docs/status.md (this PR) | Done |
| #217 filed: sonnet-implementer spec push-ownership hard rule (Change item above) | #217 | Done at DoD |
