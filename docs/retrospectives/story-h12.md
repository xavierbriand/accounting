# Retrospective — story-h12

Evals-lite shipped (PR #235, #165 / health-check F6): the loop now measures its own review
economy. `harness/disposition-report` aggregates 688 suggestion-log rows across 55 plans (three
real table dialects — two discovered only by running against the real tree) into committed
per-rule disposition rates with honest `unparsed`/`unattributed` buckets; all six agent specs
carry drift-scan-enforced `spec-version` headers; and the same PR *acted* on the measurement:
R1/R9/R10/R11 (81.8–100% acknowledge-only at n≥5) demoted to coverage-table-only in the
reviewer specs, the property-test vacuity check re-landed in sonnet-implementer, and #217's
push-ownership hard rule installed — where the spec itself turned out to have *instructed*
pushing all along. Reduced lane, 8 slices, 335 harness tests.

## Keep

- **The eval refuted its own motivating intuition.** #165 named R6/R8/R12 as the noise
  suspects; the data says 25%/50%/62.5% — none clears the bar — while the real offenders were
  R1/R9/R10/R11. Cheap measurement beat confident intuition on the first run.
- **Real-tree integration runs as dialect discovery.** Two of the three suggestion-log dialects
  were found not by fixture imagination but by pointing the tool at the actual corpus and
  chasing the `unparsed` bucket down. The honesty buckets are what made that debuggable.
- **Root-causing #217 in the spec, not the agent.** The 4.4b push violation was obedience, not
  disobedience — the spec's mission line and stop conditions both said "branch pushed." The
  hard rule now replaces both.

## Change

- **Cite the artifact, not the messenger.** Slice-6's rates were drafted from the implementer's
  report-summary numbers, which reflected a pre-final run (before the third-dialect fix
  reclassified rows); the committed artifact disagreed on R10 (100%, not 83.3%) and R12 (62.5%,
  not 56.3%). Decisions were unaffected, but a measurement story mis-citing its own measurement
  is exactly the failure class it exists to prevent. Rule of thumb going forward: any number in
  a spec or commit body must be read from the committed artifact at write time.
- **A blank frontmatter value is a fail-safe edge, always.** `Number('') === 0` slipped an
  empty `spec-version:` past Check F — the second parser-fail-safe inversion found by review
  this program (4.5c's staleness coupling was the first). Empty/whitespace/zero belong in every
  parser's red-test set by default.

## Try

- **#164 (subtraction) now has its evidence base** — `docs/metrics/dispositions.json`, rates
  with n per rule, plus this story's demotions as precedent for data-grounded process pruning.
- Regenerate `dispositions.{md,json}` alongside `metrics:loop` in future maintenance sub-loops
  (README documents the expectation) so the baseline tracks the corpus.
- No new § 8 rule minted — the demotions are spec-level, measured, and reversible by the same
  mechanism that made them.

## Loop metrics

plan ~200 LOC + amendments · 17 commits / 8 slices (R28) within R13 6–10 · 1212 product + 335
harness tests green · lint 0 errors / 122 warnings (baseline) · agents: sibling-overlap ×2
(Phase 2 + Phase 4, Reduced lane), sonnet-implementer (slices 1–5), code-reviewer (Phase 4) ·
Opus-authored slices: 6 (data-driven edits) + Phase-4 fix slice · Phase-2: 5 findings (2
adopted incl. the #217 ride-along) · Phase-4: 12 findings + clean overlap re-scan, **0
blockers** — headline catches: the wrong-numbers citation and the blank-spec-version fail-safe
inversion · issues: #217 closed at DoD; #98 (already closed 2026-07-04) annotated for the
record.

## Action items

| Item | Where | Status |
|---|---|---|
| #217 closed — hard rule shipped, contradictory spec lines rewritten | #217 | Done at DoD |
| #98 record-comment (4a + disposition items shipped via #165; 4b–4d remain non-goals with a documented trigger) | #98 | Done at DoD |
| Plan R2 corrections (attribute.ts, formatters, dispositions.json shape as #164's contract) + slice annotation | this PR (retro commit) | Done |
| status fragment + loop.csv row | this PR (retro commit) | Done |
| Story h13 (subtraction, #164) — consumes dispositions.json | next story in this program | Pending |
