# Retrospective — story-5.0 (Epic-5 intent refresh: agent-mediated annual planning ritual)

Plan: folded into the PR body (Light lane, R26) · PR [#248](https://github.com/xavierbriand/accounting/pull/248) · Defines Epic 5 (story-4.0 precedent: a definition story that produces story cards, not a feature)

Second application of the interview-before-design pattern (minted at story-4.3), first at epic
scale: two interview rounds overturned the December-solo-CFO-at-terminal framing before any
Epic-5 story was planned against it. Canon updated in place — `docs/epics.md` Epic 5 rewritten
to story cards 5.1–5.5, `docs/prd.md` FR24/25/27 amended, FR28 minted, Journey 7 added.

## Cost

- Coordinator-authored (Opus main loop, session-branch worktree; unattributed by design, as in
  h4–h14) + one `code-reviewer` run (~180k subagent tokens, 11 tool uses, ~6.5 min). One
  session-limit interruption mid-review; `SendMessage` resume recovered it with zero rework.
  `metrics:story 5.0` + loop.csv regen happen post-merge, per convention.

## Loop metrics

- **Lane:** Light (docs-only; precedents: story-4.0, h14) — plan in the PR body, Phase 0 skipped
  with reason (intent-level canon refresh; domain-model work explicitly assigned to per-story
  Phase 0s — 5.2a carries the Plan/Intent model session), Phase 2 skipped, Phase 4
  `code-reviewer` only, R16 collapse.
- **Intent:** two-round user interview — round 1: five open questions with hypotheses (moment of
  need, who drives, reference point, trust shape, missing frame); round 2: four forks. Rulings:
  ledger-as-complete-record (bootstrap = normal ingest, out of scope) · one file does both jobs
  (working state + kept intent record) · Epic 5 owns agent guidance (FR28/5.5) · year-2
  plan-vs-actual storable, multi-year analytics excluded (adopted by default, unobjected).
- **Phase 3:** no sonnet-implementer — coordinator-authored docs edits; drift-scan exit 0 at
  every commit.
- **Phase 4:** `code-reviewer` — **8 findings (2 P1 / 2 P2 verifications / 4 P3, two soft) →
  3 fix-now, 5 acknowledged**, dispositions in PR § 7. The two real defects were both
  old-noun survivals of the reframe (see Change).
- **Commits:** C1 (sub-loop loop.csv regen) + C2 (PRD refresh) + C3 (epics restructure) +
  C4 (`fix(docs)` Phase-4 corrections, occupying the R11 empty-refactor slot) + retro (exempt)
  = **4 counted body commits** — h14's exact resolved shape; the Light-lane
  envelope-token gap remains disclosed via [#239](https://github.com/xavierbriand/accounting/issues/239).

## Keep

- **Interview-before-design at epic scale.** ~Ten minutes of user answers rewrote the epic's
  actor (couple + agent, not solo CFO), artifact lifecycle (durable intent record, not scratch
  file), and success definition (coherence across time, not classification cleverness). The
  strongest ruling — "one file doing both" — deleted an entire design axis (a separate retro
  artifact) before it could grow stories.
- **Definition story as the canon vehicle** (story-4.0 precedent, now twice-used): cards not
  contracts. Pre-reframe AC substance survives as condensed carry-forward notes; the full ACs
  stay reachable in git history as per-story planning input, so no design capital was destroyed
  to make the frame truthful.
- **`SendMessage` resume after an API-limit kill.** The reviewer picked up from its own
  transcript mid-review — no re-brief, no duplicated file reads, findings arrived complete.
  (The #166 ops lesson applied: verify and resume before restarting an agent.)

## Change

- **A renamed noun needs a sibling sweep before commit.** The interview changed two nouns —
  actor ("Alex" → "the couple") and artifact ("scratch" → "plan file / intent record") — and
  both survived in siblings of the text being edited (FR27's actor; two cards' "scratch"),
  caught only at Phase 4. Same shape as h14's "name the denominator": when a reframe renames a
  concept, grep the old noun across every sibling FR/card in the same pass as the edit.

## Try

- **Story 5.1 opens with the grouping-heuristic research spike** — already carded as Phase-1
  work in `docs/epics.md` § Story 5.1 (this PR); it is the first act of the next planning
  session. (Funneled as a same-PR edit — the card is the tracking artifact.)

No new rule minted — the sibling-noun sweep is a judgment reflex in the R5/R6 honesty family,
and the canon this story shipped is the artifact that carries it.
