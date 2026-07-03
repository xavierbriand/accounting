# Retrospective — story-h7 (dod-check enforcement tiers — non-blocking findings must not gate CI)

Plan: [docs/plans/story-h7.md](../plans/story-h7.md) · PR [#152](https://github.com/xavierbriand/accounting/pull/152) · Closes #151

A fast-follow fix to story-h6 (#149): the dod-check gate it shipped hard-failed non-story PRs
(Dependabot/chore) and under-target small stories once out of draft. Adds a third **always-advisory**
enforcement tier.

## Cost

- `metrics:story h7`: 1 attributed session — opus-4-8: input 2,508 · output 94,824 ·
  cache-creation 129,228 · **cache-read 40,508,904** tokens (cost n/a — no price entry for this model).
  Cache-read is **~99% of all tokens** — the by-now-familiar context-reload dominance. Attribution
  caveat is heavier than usual here: h6 and h7 ran back-to-back in **one long coordinator session**, so
  the attributed cache-read spans both stories' worktree work, not h7 alone. The number is a ceiling,
  not a clean per-story figure.

## Loop metrics

- **Origin:** this story was **not planned** — it fell out of a tidy-up. Regenerating `docs/metrics/loop.csv`
  post-h6 (a routine chore) was the first non-story PR to hit dod-check's CI step, which hard-failed on
  `story-id-unresolved`. The tidy-up surfaced the regression; the user chose full-story treatment.
- **Plan:** `new-story-preflight`; no Explore agents needed (the fix site was already understood from
  h6). Planning surfaced a **sibling case** the issue didn't mention — the envelope also hard-fails
  *under-count* (too-small) stories — folded into scope so h7 wouldn't self-block on its own 5 slices.
- **Phase 2:** plan-reviewer (22 findings; **design confirmed complete + non-overlapping** — the three
  tiers partition cleanly because `checkCommitEnvelope` returns null at `min<=count<=max`) +
  sibling-overlap (no overlap), parallel. #151 filed.
- **Phase 3:** 1 sonnet-implementer landed C1+C2, then **stalled on 1Password signing** at C3; the
  coordinator committed C3 and finished C4/C5 directly (retries land where the sub-agent can't).
- **Phase 4:** code-reviewer — 5 findings (2 P1, 3 P3; design confirmed clean, no `any`, TDD verified
  genuinely red-before-green). F1–F4 fixed in one commit (added the not-declared subprocess leg,
  tightened the `--json` assertion, aligned README vocabulary); F5/F6 acknowledged.
- **Commits:** P0 (prep) + C1–C5 + F1–F4 fix + retro. **6 behaviour slices** (excl prep + retro) —
  within R13. The Phase-4 fix moved the count from 5 (under-target advisory) to exactly 6 (in-range),
  so the reflexive `dod-check` on this branch now reports **no envelope finding at all**.
- **Weight (reflexive):** plan_loc 234 vs 478 insertions / 6 files → weight_ratio ≈ **0.49**, under 1
  (diff-heavier, healthy). loop.csv regen still deferred to post-merge.
- **Drift scan:** no new CLAUDE.md § 8 R-tag; no contradictions. (Reviewer noted the pre-existing gap
  between R21 and R23 in § 8 — the intervening row was an h1 `*(pending)*` candidate that was never
  codified; out of h7's scope.)

## Keep

- **Dogfooding proved the fix on the story's own branch.** h7 is a small 5→6-slice fix; before the
  Phase-4 commit it sat under R13's floor, and its own `dod-check` run reported that as `(advisory)`
  and exited 0 out of draft — the fix validated against itself, live. A gate-tool story should always
  run the gate against its own branch.
- **A routine tidy-up caught a real regression.** The loop.csv regen wasn't busywork — it was the
  first non-story PR, and it exposed that dod-check would red every future Dependabot/chore PR. Doing
  the small chore surfaced a latent CI break before Dependabot did.
- **Planning widened scope to the sibling bug.** The issue named only `story-id-unresolved`; planning
  recognized under-count is the same class and folded it in, avoiding a second fast-follow.

## Change

- **story-h6 shipped a two-tier enforcement model that was too coarse.** Classifying every non-hard
  finding as draft-aware conflated "you must fix this at merge" (pr-tbd, over-target) with "this check
  doesn't apply here" (non-story PR, under-target, no envelope declared). **Lesson:** when introducing
  a CI gate, enumerate each finding's enforcement tier up front — and test the gate against a
  **non-story / Dependabot-shaped PR** before merging, not just against the story's own PR. h6's tests
  only ever exercised story-shaped repos, which is why the gap survived to main.
- **1Password signing stalled again** (C3), as in h6. It's now a documented, recurring session hazard;
  worth confirming the agent is live before a long implementation handoff.
- **A pre-existing subprocess-test flake surfaced on CI, not locally.** A dod-check integration test
  (unchanged h6 test) spawns `npx tsx` and hit ~5.2s on a loaded CI runner — over vitest's 5s default —
  and red-failed h7's build though it was green locally and on h6's CI. Fixed by setting
  `testTimeout: 30000` in `vitest.harness.config.ts` for the whole harness suite. **Lesson:** tests
  that shell out to a cold interpreter need an explicit generous timeout from day one; the default is a
  latent flake that only shows under CI load.

## Try

- **Tighten `CommitEnvelopeFinding` to a discriminated union** (`{rule:null,min:null,max:null} | {rule,min,max}`)
  so the `min !== null` guards become compiler-enforced rather than defensive (Phase-4 F5) — a future
  story that touches the type.
- **Proceed with the deferred `loop.csv` post-h6 regen** now that non-story PRs pass CI — it is the
  concrete confirmation that #151 is fixed end-to-end.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `loop.csv` post-h6/h7 regen (now unblocked) | follow-up chore PR | open |
| `CommitEnvelopeFinding` discriminated-union tightening | future story (F5) | open |
| Metrics tests pollute real `docs/metrics/` | [#150](https://github.com/xavierbriand/accounting/issues/150) | open |
