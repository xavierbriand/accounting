# Retrospective — story-h13

The subtraction story shipped (PR #237, closes #164 + #200): the loop's first-ever rule
retirement. The 2026-07 walk ([artifact](../learning/rule-walk-2026-07.md)) took all 31
pre-existing § 8 rows through pre-committed criteria against h12's measured disposition data:
**6 tombstoned** (R1, R10, R15, R17, R19, R20 — each reversible, struck in place with rationale),
**R22's two-month three-claimant deadlock closed** (permanent tombstone; h3's claim turned out to
be already codified in § 6.1 prose), **24 load-bearing keeps** each with a citation, **R32
unverified with a watch**. The machinery to keep subtracting shipped alongside: drift-scan
**Check G** (stamped-marker expiry, the tool's first advisory tier), a **tombstone-aware Check A**
(permanently resolving the R22 `table-only` transient — orthogonal to #178's still-open general
case), dod-check's **`try-unfunneled`** advisory, the sub-loop **drain step**, and the § 6.1
**Try-funnel rule**. Reduced lane, 10 slices at the R13 ceiling, 1212 + 379 tests green.

## Keep

- **Measure first, retire second.** Every tombstone cites the h12 disposition data plus an
  enforcement/exercise trail — and the same data *protected* rules (R6/R8/R12 were the named
  suspects; the numbers kept them). Subtraction grounded in evidence survived review with zero
  reversals.
- **Tombstones over deletions.** Struck rows kept every grep anchor, provenance link, and § 8
  walk working — CI was green on the surgically edited table on the first run.
- **The reviewer catching the walk's own arithmetic** (31/24, not 30/22) and R20's force-fitted
  criterion — a subtraction story mis-counting its subtractions is exactly the failure class
  Phase 4 exists for. Both corrected in place, with criterion (d) recorded honestly.

## Change

- **Annotation sweeps need a checklist, not a memory.** Six stale references to retired rules
  survived in sibling docs (control-inventory, plan-template, dod-check README, § 7, two spec
  demotion notes) — found by review, fixed in the retro commit
  ([control-inventory.md](../harness/control-inventory.md),
  [plan-template.md](../templates/plan-template.md)). Next retirement: grep every retiree tag
  repo-wide before Phase 4, not after (#87's "walk every prose reference" guideline, again).
- **Hold Phase-4 edits until review lands** (second occurrence this program — story-E minted the
  lesson; this story's §8 PR fill raced the reviewer's body fetch and produced a false
  "missing #178 note" finding).

## Try

- Check G / `try-unfunneled` **promotion decision at the next health check** — tracked in
  [the plan's Risks table](../plans/story-h13.md) and the walk artifact's closing line.
- Harness-glossary deltas (**tombstone**, **expiry stamp**, **Try-funnel**) proposed in
  [docs/harness/glossary.md](../harness/glossary.md) — user sign-off at this PR's merge gate.
- #178's general mid-story transient stays open (#178) — this story resolved only the tombstone
  class, by design.
- No new § 8 rule minted.

## Loop metrics

plan ~200 LOC + amendments · 17 commits / 10 slices (R28) at the R13 ceiling (the planned
refactor slot became the R8 gap-fill test slice; justification here per R11's spirit) ·
1212 product + 379 harness tests green · drift-scan exits 0 on the tombstoned table ·
agents: sibling-overlap ×2, Explore (evidence gathering), sonnet-implementer (one
process-restart, resumed with zero rework), code-reviewer · Phase-2: 5 findings (1 adopted, 4
acknowledged) · Phase-4: 13 findings, **0 blockers** — headline: the walk's arithmetic + R20
criterion honesty + six stale references + the Check G `--json` gap · issues: #164 + #200 close
at merge; #178 stays open (orthogonal).

## Action items

| Item | Where | Status |
|---|---|---|
| Walk arithmetic + criterion-(d) honesty corrected | docs/learning/rule-walk-2026-07.md (retro commit) | Done |
| Six stale retiree references annotated | control-inventory, plan-template, dod-check README, CLAUDE.md § 7, two specs (retro commit) | Done |
| Check G + try-funnel registered in the control inventory | docs/harness/control-inventory.md (retro commit) | Done |
| Glossary deltas proposed | docs/harness/glossary.md (user-gated at merge) | Pending sign-off |
| Story h14 (thesis refresh, #166) — the program's last story | next | Pending |
