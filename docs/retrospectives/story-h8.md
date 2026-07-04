# Retrospective — story-h8 (right-size the dev-loop gate: risk-based lanes + truthful weight metric)

Plan: [docs/plans/story-h8.md](../plans/story-h8.md) · PR [#167](https://github.com/xavierbriand/accounting/pull/167) · Issue #160 (F2 + part-F7)

The dev-loop applied one fixed ceremony floor to every story and its health metric lied: `weight_ratio = plan_loc / diff_loc` counted the plan/retro/status ceremony *inside* `diff_loc`, so a 4-line change buried in ~160 process lines (maint-18) read "healthy" 0.64. This story shipped three coordinated fixes: **risk-based Full/Reduced/Light lanes** in CLAUDE.md § 6 (new rule **R26**), a **truthful shipped-only `diff_loc`** (via the new single-source `harness/lib/process-artifacts.ts`) with the dead `commits` column dropped, and an **always-advisory `weight-ratio-heavy`** dod-check trigger that fires when a plan outweighs its shipped code.

## Cost

- `metrics:story h8`: 1 attributed session — opus-4-8: input 15,763 · output 68,834 · cache-creation 218,347 · **cache-read 4,160,776** tokens · **$5.24** (asOf 2026-07-03). First h-series story to print a real dollar figure — the C0 chore (#159) added the `opus-4-8` price entry that made h4–h7 print "n/a". Cache-read is **~95% of all tokens** — the familiar context-reload dominance. Attribution is best-effort (cwd + commit-window overlap); this was a single coordinator session driving five sub-agents (2 Explore, plan-reviewer, sibling-overlap, code-reviewer, 2 sonnet-implementer rounds), so the figure includes the orchestration, not just the diff.

## Loop metrics

- **Weight (reflexive, new metric):** plan_loc **164** vs shipped diff_loc **544** (non-process) → weight_ratio ≈ **0.30**, well under 1.0. h8 is a genuine code story (a new shared module + two check surfaces), not ceremony-heavy — so its own new `weight-ratio-heavy` check correctly would **not** fire on it. Dogfood confirmed: the tool passes its own test.
- **Retroactive proof (the point of the story):** under the old all-paths `diff_loc`, maint-18 read 0.64 and maint-01 read 0.70 — both "healthy." Under shipped-only measurement they flip to **26.0** and **4.68**, both crossing the >1.0 heuristic that is now wired to the advisory finding. The metric stopped lying.
- **Plan:** `new-story-preflight` + 2 parallel Explore agents (metrics code-map + dod-check/docs). Clean preflight (0 vulns, no open PRs, id free).
- **Phase 2:** plan-reviewer (22 findings) + sibling-overlap (3 coordination notes), parallel. Design confirmed complete; **8 ADOPT / 5 ACK / 1 REJECT / 0 DEFER** → no follow-up issues filed. The plan-reviewer caught two things that would have shipped bugs otherwise (see Keep).
- **Phase 3:** 1 sonnet-implementer landed slices 1–6 in one round, no signing stall this time. Regenerated `loop.csv` mid-slice.
- **Phase 4:** code-reviewer (4 findings + 3 soft) + 1 Opus-caught doc bug → all 4 fix-now items landed by a second sonnet-implementer round (2 commits); 2 acknowledged.
- **Commits:** prep + 6 body slices + 2 Phase-4 fix commits + retro. **8 behaviour/fix slices** (excl prep + retro) — within R13's 6–10.
- **Drift scan:** the § 8 **R26** row was `table-only` until this retro landed (it cites R26 here) — Check A goes green with the retro commit, exactly as the plan sequenced. This is the second story (after the R21/R23 gap) to feel the retro-must-cite-the-tag ordering; it worked as designed.

## Keep

- **The plan-reviewer earned its keep — twice.** It caught (a) that the `aa` integration fixture, which commits only `docs/plans/story-aa.md`, would silently **flip from an included row to a skip** once `docs/plans/` left `diff_loc` — a green-looking test that actually stopped testing the happy path; and (b) that rewriting CLAUDE.md § 6 risked breaking **6+ external `§ 6.x` cross-references**. Both became hard constraints in the plan before a line of code was written. Phase-2 review on a story that edits the process doc itself is not ceremony — it is the cheapest place to catch a self-inflicted cross-reference break.
- **Additive-not-renumber was the right discipline for editing the rulebook.** The lane table slotted in as a new `### Risk-based lanes` subsection above § 6.1 with zero renumbering; the read-only cross-ref audit of all six citing files came back clean. When a story edits the spec everything else points at, "add, don't move" keeps the blast radius at zero.
- **The shared `process-artifacts.ts` front-ran h10.** Building the process-artifact filter as one exported module (rather than inlining the prefix check in both metrics and dod-check) meant the same story's dod-check trigger reused it for free — and the Phase-4 `countLoc` extraction folded a *third* duplicated counter into it. h8's single-sourcing is a running start for h10 (#162).
- **Dogfooding the gate against its own branch.** h8's reflexive weight_ratio is 0.30 — the new advisory would not fire on h8, which is the correct answer for a real code story. A gate-tool story should always be run against itself.

## Change

- **The health metric was biased toward "healthy" for its entire measured life (h4→h8).** Every `weight_ratio` printed since h4 counted the ceremony inside the denominator, so the one signal meant to detect an over-heavy loop structurally could not. It took a dedicated story to notice the denominator was wrong. **Lesson:** a metric that never crosses its own alarm threshold across 40 data points is not reassuring — it is suspect. Instrument the *instrument*: when a health metric stays flat and green forever, audit its definition before trusting it.
- **`metrics:story` outputs are still uncommitted and regenerable-only.** h8 printed a real cost for the first time (C0's pricing fix worked), but the report is still a throwaway file the retro transcribes by hand. The number lives only in prose. That is better than "n/a" but still not durable accounting — F7's full fix (freshness + Cost-section enforcement) is deferred to h11.

## Try

- **Add a `Co-Authored-By` agent trailer to the sonnet-implementer commit convention.** Phase-4 flagged that none of the body commits identify their authoring agent, so the R9 carve-out (Opus inline ≤5 LOC vs Sonnet slice) can't be confirmed from the commit alone — contrast maint-01, whose every slice carried a `Co-Authored-By: Claude Sonnet` trailer. A one-line addition to `.claude/agents/sonnet-implementer.md` would restore that signal. Lands in the next story that touches that spec (or h10's single-source pass).
- **When h11 lands the loop.csv freshness gate, base it on h8's 5-column schema and `isAlwaysAdvisory` shape.** h11 (#163) shares `dod-check.ts` and the F7/loop.csv surface; it must consume the post-h8 CSV (no `commits`, shipped-only `diff_loc`), not the old 6-column shape.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| `Co-Authored-By` trailer in sonnet-implementer spec | future story touching `.claude/agents/` (or h10) | open |
| loop.csv freshness + Cost-section enforcement (F7 remainder) | [story-h11 (#163)](https://github.com/xavierbriand/accounting/issues/163) | open |
| h11 must build on h8's 5-column CSV + `isAlwaysAdvisory` shape | [story-h11 (#163)](https://github.com/xavierbriand/accounting/issues/163) | open |
