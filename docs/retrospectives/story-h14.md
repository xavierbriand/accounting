# Retrospective — story-h14 (Thesis refresh: currency + field chapters for the methodology corpus)

Plan: folded into the PR body (Light lane, R26) · PR [#238](https://github.com/xavierbriand/accounting/pull/238) · Closes #166 (health-check F10's "full refresh post-Epic-4" disposition, executed)

Last story of the post-Epic-4 batch (h12 evals-lite → h13 subtraction → h14 thesis refresh). Brings
the three `docs/learning/` corpus docs current with two months of shipped work and adds the field
chapters the interval earned — D1 context diet (h5), D2 enforcement tiers (h6/h7), D3 Phase 0
(ddd-1), D4 tracker decay (F8→h9), D5 subtraction (h13) — plus the coordinator-level
failure-signature family (F4's ask).

## Cost

- `metrics:story h14`: 1 attributed session — claude-fable-5: input 2 · output 538 ·
  cache-creation 522 · cache-read 167,976 · **$0.20** (the price map now carries a fable-5 entry,
  so Cost prints a number for the first time since F7 flagged the `n/a` hole). The attributed
  session is the worktree-cwd staleness survey; the coordinator session is unattributed by design
  (main-checkout cwd), as in h4–h7. Metrics file regenerated post-merge with loop.csv, per convention.

## Loop metrics

- **Lane:** Light (docs-only; precedents: story-4.0, story-maint-20) — plan in the PR body, Phase 0
  skipped with reason, Phase 2 skipped, Phase 4 `code-reviewer` only, R16 collapse.
- **Plan:** a read-only Explore agent surveyed the three docs against #166's claims first and
  returned exact line anchors for every staleness site (the two named false claims plus ~15 more,
  each with the closing story); the edits were then authored directly from the anchor list.
- **Phase 3:** no sonnet-implementer — coordinator-authored docs edits. drift-scan exit 0 at every
  commit; dod-check reflexive run clean (advisories only: envelope-undeclared while the count sat
  at 3, merge-checklist unticked while draft).
- **Phase 4:** code-reviewer — **6 findings (4 P1 / 2 P3, one soft) → 4 fix-now, 2 acknowledged**,
  dispositions in PR § 7. Every chapter claim traced to its cited artifact and confirmed; the found
  defects were two arithmetic/count slips, one internal-consistency miss outside the survey's
  anchors, and one dishonest fails-if (see Change).
- **Commits:** C1 (thesis doc) + C2 (comparison docs, the R16 optional 4th) + C3 (empty refactor,
  justified) + C4 (`fix(docs)` Phase-4 corrections) + retro (exempt) = **4 counted body commits** —
  inside R16's min4/max4 and honestly declared, though only the Phase-4 fix made that possible
  ([#239](https://github.com/xavierbriand/accounting/issues/239)).

## Keep

- **Survey-before-writing, with line anchors.** Paying one Explore agent for an exact-quote
  staleness inventory before touching a 27KB thesis doc made the edits mechanical and the coverage
  checkable — Phase 4 confirmed every surveyed anchor was cleared. The one currency miss
  (spdd § 6 coda) sat *outside* the survey's remit, which is the exception that proves the shape:
  survey scope bounds edit completeness.
- **The Closed-by annotation idiom.** Part A stays a frozen 2026-04 baseline — the health check
  measures against it — while every closed item names its closing story inline. Currency without
  destroying the before/after evidence; the diff itself is teaching material for Module 6.
- **Phase 4 as the arithmetic checker, second story running.** h13's review caught 30/22→31/24 in
  the walk doc; h14's caught "24 live" (dropped R32) and "three demotions" (was four). The pattern
  is now firm: any number that summarizes a table gets re-derived from the table at review time —
  memory of the table is not a source.

## Change

- **A count needs its denominator named in the same sentence.** "24 live" was true of *cited keeps*
  and false of *non-tombstoned rows*; the ambiguity produced a wrong claim in two docs. The fix
  spells the population out ("25 live — 24 cited keeps + R32 on watch"). Lesson applied to future
  summaries of the § 8 table.
- **A fails-if must name a mechanism that can actually fire.** Scenario C claimed drift-scan would
  catch R-tag drift in `docs/learning/` — a surface drift-scan deliberately doesn't scan. That's
  R6's honesty discipline applied to a docs story: the reworded scenario attributes verification to
  the Phase-4 review, which is what actually performed it. Checking a scenario's verification
  mechanism against the tool's real scope belongs in the plan-writing reflex, lane regardless.

## Try

- **Fix the R16 envelope range** so the canonical 3-counted collapse shape can declare its token
  instead of dodging into the undeclared-advisory path — filed as
  [#239](https://github.com/xavierbriand/accounting/issues/239) with three options and a
  fixture ask (a maint-27-shaped regression PR).
- **Module 6 (teach-out) is now unblocked** — its stated precondition ("one product epic through
  the loop first", health-check roadmap) was met by Epic 4, and this story refreshed the corpus it
  would teach from. Tracked in [#100](https://github.com/xavierbriand/accounting/issues/100); no
  new issue needed.

No new rule minted — deliberately. The story's own D5 chapter is the argument: the two lessons
above are judgment patterns, not enforceable invariants, and the corpus they live in is the
deliverable that carries them.
