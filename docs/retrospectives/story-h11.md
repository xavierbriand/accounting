# Retrospective — story-h11 (honesty gates in dod-check: placeholders, merge checklist, phase evidence, loop.csv freshness)

Plan: [docs/plans/story-h11.md](../plans/story-h11.md) · PR [#175](https://github.com/xavierbriand/accounting/pull/175) · Issue #163 (F4 + part-F7)

`dod-check` policed the cheap-to-fake (commit-subject strings, literal `TBD`, envelope counts) while the *expensive* DoD claims went unverified on merged PRs: #149 shipped § 10 entirely unticked, #152 shipped permanent `_Pending Phase 3/5_` placeholders that literal-`TBD` matching missed, and ddd-1/#153 ticked its Phase-4 gate with no code-reviewer run evidenced. This story added four honesty gates — a **widened `pr-tbd`** (catches `Pending…` placeholders), a **draft-aware `merge-checklist-unticked`** (excludes the two rows unticked by construction), an **always-advisory `phase-evidence-missing`** (ticked Phase-4 box vs § 7 `| P4 |` row), and an **always-advisory `loop-csv-stale`** (F7 freshness, current story self-excluded) — plus the CLAUDE.md § 7 → dod-check reference that was h6's dropped Try item. All advisory-first per h7's "never ship a hard gate cold," with merge-checklist landing draft-aware by user decision to catch the exact #149 failure.

## Cost

- `metrics:story h11`: 2 attributed sessions — **claude-fable-5**: input 1,074 · output 40,861 · cache-creation 53,776 · **cache-read 6,948,184** · **$9.67**; **claude-opus-4-8**: input 397 · output 36,071 · cache-creation 25,251 · cache-read 822,593 · **$1.47** (asOf 2026-07-03). Total ≈ **$11.15**. The fable-5 share (~87%) is the sonnet-implementer leg (one round, ten TDD commits) — cache-read again ~99% of tokens, the familiar context-reload dominance. Attribution is best-effort (cwd + commit-window overlap); the coordinator session driving 7 sub-agents (2 Explore, 1 Plan, plan-phase sibling-overlap, implementer, Phase-4 code-reviewer + sibling-overlap) fell just outside the matched window, so the real coordinator cost is under-counted here.
- Note: `docs/metrics/story-h11.md` is a regenerable throwaway (F7 — `metrics:story` outputs are not committed); the figures above are transcribed. This is exactly the durability gap [#176](https://github.com/xavierbriand/accounting/issues/176) (Cost-section enforcement) will close.

## Loop metrics

- **Weight (reflexive):** plan_loc **127** vs shipped non-process diff **≈766** → weight_ratio ≈ **0.17**, well under 1.0. h11 is a genuine code story (two new lib modules + four wired checks + tests), so its own `weight-ratio-heavy` check correctly would **not** fire. Dogfood confirmed.
- **Dogfood against its own PR (the headline):** run against PR #175 in draft, `dod-check` reported its *own* honesty state correctly — `pr-tbd` silent (no placeholder lines written), `phase-evidence-missing` silent (Phase-4 box honestly unticked), `merge-checklist-unticked: 4 row(s) (advisory — PR is draft)` (6 § 10 rows minus the 2 construction-excluded), and `loop-csv-stale` surfacing `h9`/`h10a`/`h10b`. A gate-tool story run against itself, passing its own test.
- **Plan:** `new-story-preflight` + 2 parallel Explore agents (dod-check internals + CLAUDE.md/commit-envelope/CI wiring) + 1 Plan agent (phase-evidence heuristic + slice plan). Clean preflight (0 vulns, id free). Two design forks (merge-checklist tier; F7 split) taken to the user via AskUserQuestion.
- **Phase 2 (Reduced lane):** sibling-overlap only (plan-reviewer dropped per R26) — no overlap, zero open PRs at plan time.
- **Phase 3:** 1 sonnet-implementer, one round, strict red→green per slice. No signing stall.
- **Phase 4 (Reduced lane):** code-reviewer + sibling-overlap in parallel. code-reviewer: 1 P1 + 0 P2 + 2 P3 + 3 soft — **0 fix-now**, all acknowledged/deferred; all 7 acceptance scenarios mapped, `fails if`/R7 walks clean. sibling-overlap caught a newly-opened PR #174 (story-ddd-2) but confirmed disjoint surface.
- **Commits:** prep + 10 behaviour commits (4 feat slices each split `test:—failing` + `feat:—green`, + the every-kind fixture + the doc slice) + retro. **10 behaviour slices** (excl prep + retro) — at R13's outer edge (6–10); `commit-envelope` computes 10 ≤ 10, no over-max.
- **No refactor commit:** code-reviewer found nothing to fix, and an empty `refactor:`/extra commit would itself breach the R13 ceiling — so none was authored (R11 permits, but here abstaining is the envelope-correct choice).

## Keep

- **Dogfooding a gate-tool against its own PR is the highest-signal test.** The moment PR #175 had a body, `dod-check` reported its own § 10 (4 unticked substantive rows, advisory-in-draft) and its own clean `pr-tbd`/`phase-evidence` state — because the PR was authored *honestly* (no placeholder lines, Phase-4 box left unticked until it passed). The tool's first real input was itself, and it was correct. Every honesty-gate story should be run against its own PR before mark-ready.
- **The merge-checklist "construction-unticked rows" catch was the load-bearing design decision.** The issue's one-liner ("draft-aware, hard when ready") was *technically broken*: `PR out of draft` and `User approval` are unticked by construction while CI runs, so a naive draft-aware-hard check would false-hard-fail every ready PR — the exact "hard gate cold" regression h7 exists to prevent. Surfacing this at plan time (Plan agent) and taking the tier fork to the user turned a latent landmine into a deliberate exclusion + a guarding scenario.
- **Advisory-first paid off immediately.** `loop-csv-stale` fired on real debt (`h9`/`h10a`/`h10b`) the instant it ran. Because it's always-advisory it surfaces the debt without blocking anyone — exactly the h7 lesson applied. A hard version would have blocked h11's own PR on pre-existing sibling debt.

## Change

- **A freshness check that finds debt it cannot pay down in-story is a half-mechanism.** `loop-csv-stale` correctly surfaced that `h9`/`h10a`/`h10b` lack `loop.csv` rows — but regenerating in-story would (a) breach the R13 commit envelope and (b) compute `n/a` rows for unmerged siblings. So the check *detects* the F1 "loop can't subtract" pathology while being structurally unable to *fix* it here. **Lesson:** detection and remediation want different homes — the gate flags, the maintenance sub-loop regenerates. The advisory noise on every future PR is the reminder to run `npm run metrics:loop`.
- **The issue scope and the upstream action item diverged silently.** story-h8's retro action item sent h11 both loop.csv freshness *and* Cost-section enforcement (F7 remainder); issue #163 quietly scoped only the freshness half. Caught at Phase-4 disposition, not at planning. **Lesson:** when a prior retro's action item names a target story, cross-check the target issue's scope against it at planning time — the action-item table and the issue tracker drift apart (F8's "tracker stopped being the coordination layer" in miniature).

## Try

- **Run the loop.csv regen in the next maintenance sub-loop and confirm the advisory clears.** The next planning session's sub-loop should `npm run metrics:loop` (adding `h9`/`h10a`/`h10b`/`h11` rows) and verify `dod-check --check loop-freshness` then reports nothing — closing the loop on the debt this story surfaced. This is the paired remediation for the detection h11 shipped.
- **Promote `merge-checklist-unticked` / `phase-evidence-missing` from advisory once dogfooded across a few real PRs.** Both landed advisory-first (merge-checklist draft-aware, phase-evidence always-advisory). After 2–3 stories confirm the false-positive rate is near zero (watch the R9-carve-out phase-evidence case), a small promotion story can tighten `phase-evidence` to draft-aware and add the `P4: none — carve-out` sentinel. Mirrors h7's tier-escalation-after-evidence pattern.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Regen `loop.csv` (`h9`/`h10a`/`h10b`/`h11` rows) + confirm `loop-csv-stale` clears | next maintenance sub-loop (§ 6.7) | open |
| Cost-section enforcement in dod-check (F7 remainder) | [#176](https://github.com/xavierbriand/accounting/issues/176) | open |
| Promote merge-checklist / phase-evidence tiers after false-positive evidence | future promotion story | open |
| `P4: none — carve-out` sentinel for `phase-evidence-missing` | future promotion story (with the tier promotion above) | open |
