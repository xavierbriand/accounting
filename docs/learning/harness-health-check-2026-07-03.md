# Harness health check — 2026-07-03

> **Provenance.** Full critical review of the development harness (agents, instructions, skills, dev loop, tooling, and the GH-issue roadmap), performed 2026-07-03 in a single review session: four parallel read-only agents (agent-spec audit, retro/learning synthesis, GH-roadmap reconstruction, per-story ceremony quantification) plus a quantitative pass over git history and `docs/metrics/loop.csv`. Reviewed against the user's stated frame: **methodology-first** (the transferable harness is the primary product; the app is the vehicle), felt pains = process weight and rule sprawl.
>
> This document supersedes the "Part A — Audit verdict" of [harness-engineering.md](harness-engineering.md) (dated 2026-04-29). The roadmap reorganization derived from it is tracked in the `scope: product-dev-loop` issues filed 2026-07-03 (stories h8–h11 + three post-Epic-4 items).

## Verdict

The review layer genuinely works — the retros document dozens of real bugs caught before and after implementation, and the retro→rule→enforcement pipeline is unusually disciplined. But the harness has a structural defect its own thesis doc predicted: **it can add process but cannot subtract it.** Every mechanism for growth is tooled (drift-scan enforces rule *presence*, dod-check enforces envelope *compliance*, retros mint rules); every mechanism for shrinkage is an intention (rule expiry "every 6 months", Try items "codified if they recur", deferred issues "confirmed still relevant") — and empirically none has ever fired. Result: 26 of 42 stories are process/harness work, zero product stories since 2026-04-29, a 43:1 process-to-shipped ratio on the smallest story, 24 rules with zero retirements, a frozen deferral queue, and a methodology corpus — the actual product — describing a repo two months gone. The loop inherited the ledger's append-only discipline without the balancing-entry mechanism.

## What's working (evidence-backed)

- **Phase-2/Phase-4 reviews catch real defects.** ~15 retros document pre-implementation catches (TOCTOU race and FK-pragma no-op in 2.5, `substr` date bug in 3.2, `monthsBetween` formula in 3.4, `JSON.stringify(new Map())` → `{}` in 3.5); 8+ document Phase-4 catching vacuous property tests. Not review theater.
- **The h6→h7 direction is architecturally correct:** deterministic checks moved out of reviewer prompts into `harness/dod-check` software, then tiered (hard / draft-aware / always-advisory). That is the mature end-state for gates.
- **Provenance discipline** (every rule → originating retro; drift-scan bidirectionality) is genuinely novel and teachable. The *front half* of the rule pipeline works.
- **h5's bounded-context insight** ("the difference between an agent that finishes and one that stalls") is validated and is one of the best teachables.
- **Honest-deviation culture** — retros that admit the coordinator's own wobbles (h5) are rare in the wild and are what makes the corpus valuable.
- **The 43-retro corpus** is a labeled dataset (situation → judgment → outcome) almost nobody else has. Most transferable asset; currently unmined.

## Findings, ranked

### F1 — The loop has no working subtraction mechanism *(root cause)*

- **Rules:** 24 active, zero ever retired or reworded down (`git log -p` on § 8: no row deletion in history). [harness-engineering.md](harness-engineering.md) Principle 7 mandates an expiry walk and calls it "twice as important" than adding rules — never performed. The only gate weakening ever (h7's advisory tier) was forced by a shipped regression, not chosen by review.
- **R22 is a 2-month deadlock:** three retros (h1, h2, h3) each parked a *different* rule in the slot with `*(pending)*`; the marker suppresses the drift-scan finding indefinitely; maint-18 and ddd-1 both skipped past it. h3's candidate was absorbed into § 6.1 prose without a tag — codified in effect, unresolved in the system.
- **Try items:** of 25 sampled, ≥14 silently dropped — including one escalated three consecutive retros (AskUserQuestion as a formal Phase-1 step, the loop's most-validated planning pattern) and two born from shipped bugs. Killer phrases: "next process-touching PR", "codify if it recurs", "propose in Epic 4". [retrospectives/README.md](../retrospectives/README.md)'s "nothing is left unresolved" is falsified.
- **Deferred queue:** 12 labeled open issues, zero closures in 65 days, oldest 72 days (#23); post-April deferrals (#119, #131, #132, #147, #150, #154) aren't labeled, so the queue under-reports by ~40%.

*Disposition: post-Epic-4 subtraction story (user decision — "too soon" before Epic 4 evidence exists).*

### F2 — The ceremony floor is fixed, regressive, and mismeasured

- True process-to-shipped ratios (plan + retro + status fragment + PR body vs non-process diff): **story-h7 ≈ 1.4:1** (390 vs 285 lines); **story-maint-18 ≈ 43:1** (171 lines + 12 review findings + 2 sub-agents around a 4-line change). Official `weight_ratio` reports 0.38 / 0.64 because `diff_loc` *includes the ceremony* — the loop's health metric is structurally biased toward "healthy."
- The floor is per-story-constant (~100–280 plan lines, 4–6 sub-agent invocations, 11 plan sections, 10 PR sections, retro, fragment, metrics row) regardless of diff size. R15/R16 only ever compressed commits and delegation, never gates; [harness-engineering.md:41](harness-engineering.md) concedes this ("the gates still run. No formal ratio guard") and the chartered fix (Module 3, #97) sat unshipped 65 days while the justifying data accumulated in loop.csv.
- When measurement arrived (h4), the one >1.0 story was retro-annotated as *justified* and the persistent 0.6–0.7 band changed nothing — the heuristic was neutralized, not acted on.

*Disposition: story-h8 (before Epic 4) — risk-based lanes + truthful weight metric + wired trigger.*

### F3 — The harness is consuming its vehicle

- Story mix: 16 product stories vs 26 process/harness. Zero product stories since 2026-04-29. Three of the last five merges repair loop machinery. Product bugs #93/#103 sat open 65 days while eight harness stories shipped.
- The learning is going self-referential: maint-18's code-reviewer produced 4 fix-now findings, all defects in the story's own process paperwork.
- Epic 4 (#155/#156) is the first real load test of the Phase-0 machinery (run exactly once, on itself) — the highest-value methodology experiment available.

*Disposition: enforcement freeze after h8–h11; Epic 4 story 1 next; harness changes only via tripwires firing during product work.*

### F4 — Enforcement inversion: gates police the cheap-to-fake; expensive claims go unverified

- dod-check enforces commit-subject strings, literal `TBD`, envelope counts. Meanwhile on *merged* PRs: #149's § 10 merge checklist entirely unticked (DoD 11); #152 shipped § 8/§ 9 as permanent "_Pending Phase 3/5_" (DoD 6 — `pr-tbd` doesn't match "Pending"); #142 doesn't use the template while its plan's DoR line claims it does; **story-ddd-1's Phase-4 gate is ticked in PR #153 with no code-reviewer run evidenced anywhere.**
- Coordinator level: h5's retro admits marking a gate complete after an inline substitution the re-run later contradicted — the "lying summary" signature from the repo's own taxonomy, in the coordinator, with no detector at that layer.

*Disposition: story-h11 — honesty gates in dod-check (advisory-first).*

### F5 — Rule distribution violates single-source-of-truth; the newest rules are unenforced

- 15 of 24 rules are restated inside agent specs (R2/R6/R7 in five places each); Core-purity rules 6×, money invariants 4×. drift-scan scans only retros + plans — `.claude/agents/` and `.claude/commands/`, the largest drift surface, are unscanned.
- Observed consequence: both reviewers' rule walks are **frozen at "R1..R15"** (plan-reviewer.md:37/100/112/140, code-reviewer.md:121/133) — R16, R20, R23, R24, R25 are invisible to the agents chartered to enforce them, while plan-reviewer.md:140 asserts the walk "confirms the spec is current." Both files were edited in h5 after R16–R21 existed without the denominator being fixed.
- Also observed: code-reviewer.md:30 attributes a disposition rule to CLAUDE.md that exists nowhere in canon (phantom quote); § 6.3 summarizes six return sections where the spec mandates seven; R9's criteria differ across its three statements; § 6.2 says Opus does reviews while both reviewers are pinned `model: sonnet`.

*Disposition: story-h10 — grep-driven walks, restatement removal, drift-scan extension to `.claude/`.*

### F6 — The review layer is valuable but uncalibrated; the calibration data already exists

- Noise: 17/27, 16/25, 13/25 findings acknowledge-only on feature stories; plan-reviewer produced 26 findings vs inline-Opus's 9 on the same small plan (maint-13 dogfood); R6/R8/R12 boilerplate rows "crowd the suggestion log" (story-A).
- The recurring Phase-4 catch (vacuous property tests, 3 stories running) was never fixed upstream — the Sonnet-side sanity check was dropped via a mislabeled retro action item.
- Every suggestion log records per-finding disposition per agent per rule: an eval dataset nobody has aggregated.

*Disposition: post-Epic-4 evals-lite (re-scope of #98 per its own § 4c contrarian beat); feeds the F1 rule walk.*

### F7 — The metrics program is self-consuming; cost accounting is broken

- Of 43 retros, only the metrics stories (h4–h7) plus one backfill cite measured data. The h5–h7 arc's success criterion (cache-read drop at constant findings-rate) was never demonstrated — tokens went 784k → 28.4M → 40.5M with each retro deferring the comparison.
- `prices.json` has no entry for `opus-4-8` — the model recorded doing ~99% of tokens — so Cost sections print "n/a". `commits` is always 1 post-squash (dead column). The manual post-merge regen missed story-ddd-1 within a day (rerunning `npm run metrics:loop` adds the row); maint-17 is a silent matcher hole. `metrics:story` outputs are never committed. The newest retro (ddd-1, 21 lines) omits the mandatory Cost section entirely.
- The regen chore itself triggered a remediation story (h7) when it tripped h6's gate.

*Disposition: chore C0 now (ddd-1 row + coordinator pricing); denominator fix in h8; loop.csv CI freshness check in h11; Cost-section enforcement in h11.*

### F8 — The issue tracker has stopped being the coordination layer

- #94's module checklist shows all seven modules unchecked though three are closed; #96 closed with an SPDD acceptance criterion unmet, silently; **#97's acceptance items were partially delivered by other stories** (sibling-overlap agent via h3, R16 lane, h7's tier de-escalation) with nobody writing back; the July harness burst (h5–h7) happened entirely outside the curriculum; #154–#156 launched a new workstream with no labels; #80 floated 67 days, half-superseded by #94, never reconciled — its unshipped ideas (deferred-debt pay-down, retro theme extraction, intent-alignment, risk flagging, sequencing advisor) exist nowhere else.
- Both tripwire-gated issues are mis-armed: #111's tripwire watches a signal channel (a code-reviewer finding) that drift-scan pre-empted — and the underlying condition already occurred (h1 retro: production-code surface drifted, corrected retroactively). #98's tripwire is circular: it waits to observe a silent prompt regression, but without the eval nothing can observe one — h5's fleet-wide spec rewrite with zero regression detection is precisely the event class it waits for.

*Disposition: story-h9 — propose-only backlog-groomer agent + /groom skill; the one-time tracker reset is its first run and acceptance test.*

### F9 — Model-tier economics are quietly collapsing

§ 6.2 assigns reviews to Opus; both reviewers run `model: sonnet`. sibling-overlap has no model field — a DoR-gating PR-listing task inherits the most expensive session model. sonnet-implementer stalled on 1Password signing in two consecutive stories and the coordinator finished the implementation itself both times. sibling-overlap's spec also instructs MCP tools its grant doesn't include and hardcodes repo coordinates.

*Disposition: § 6.2 reconciliation + sibling-overlap fixes in h10; the signing stall needs a user-side fix (out of harness scope, flagged).*

### F10 — The methodology corpus — the actual product — is stale where it matters

[harness-engineering.md](harness-engineering.md) Part A still asserts drift-scan "doesn't exist" (shipped 2026-05-01, CI-enforced), "no cost/token telemetry" (shipped h4), "sequential agents only" (parallel Phase 2 since h3), and references R1–R19 four times; it knows nothing of h5's context diet, h6/h7's enforcement tiers, or the DDD adoption. [spdd-comparison.md](spdd-comparison.md)'s headline "Adopt" recommendation (domain-modeling explicitness) *was adopted* (ddd-1) and the doc doesn't know. The failure-signature taxonomy lacks the coordinator-level signatures recent retros surfaced.

*Disposition: currency one-liners ride with h10; full refresh (new chapters) post-Epic-4, with Epic 4 evidence in hand.*

## Roadmap dispositions

| Item | Call |
| --- | --- |
| #97 Module 3 | Superseded by story-h8 (lane scope); rule-walk bullet moves to post-Epic-4 subtraction story; closes on h8 merge |
| #98 Module 4 | Re-scope to evals-lite (post-Epic-4); tripwire declared retroactively fired (h5) — groomer-proposed action |
| #100 Module 6 | Keep as end-state; precondition: one product epic through the loop first |
| #111 Module 7 | Close or re-arm on the condition, not the channel — groomer-proposed action |
| #94 umbrella / #80 | Reconcile checkboxes; close #80 as superseded, extract residue — groomer-proposed actions |
| #154 Check C | Adopt; widen to `.claude/agents/` + `.claude/commands/` (h10 coordinates) |
| #155/#156 Epic 4 | Next loop iteration after h8–h11; label them |
| #93/#103 product bugs | Schedule at Epic 4 start |

## Quick-fix list (R9-carve-out sized)

Delete the phantom quote (code-reviewer.md:30) · grep-driven rule walks in both reviewers · § 6.3 seven-section fix · sonnet-implementer's stale "§ 7" pointer · unify R9's criteria · sibling-overlap tool grant + positive-case output schema + model pin · regen loop.csv (ddd-1 row) · price coordinator models in prices.json · teach `pr-tbd` about "Pending" · reference dod-check from CLAUDE.md § 7 · reconcile new-story-preflight's worktree convention.

## Appendix — Tracker-reset inventory (story-h9 acceptance fixture)

The backlog-groomer's first grooming report must independently surface at least the following. (Items found beyond this list are a bonus; items missed are acceptance failures.)

1. #94 module checkboxes stale (Modules 1/2/5 closed via #95/#96/#99, unchecked).
2. #96 closed with the SPDD-delta acceptance criterion (six-command slash vocabulary) unmet and unaddressed.
3. #97 acceptance partially delivered elsewhere: sibling-overlap detector (story-h3), light lane precedent (R16), reactive gate de-escalation (story-h7); rule-walk bullet undercounts the table (R1–R19 vs R1–R25-with-R22-gap).
4. #98 tripwire circular; candidate trigger event already occurred (story-h5 fleet-wide spec rewrite, no regression detection).
5. #111 tripwire watches a pre-empted channel (drift-scan Check B); underlying condition already occurred (story-h1 retro, production-code-surface drift corrected retroactively).
6. #80 superseded by #94 for ideas 1/3; unshipped residue: ideas 2 (predictive risk flagging), 4 (semantic intent-alignment), 5 (sequencing advisor), 6 (retro theme extraction), 7 (deferred-debt pay-down).
7. Unlabeled deferrals: #119, #131, #132, #147, #150 (missing `deferred-suggestion`); #154, #155, #156 (no labels at all).
8. Deferred-suggestion queue frozen: zero closures since 2026-04-29; five oldest open: #23 (72d), #34 (70d), #43 (70d), #57 (69d), #59 (69d).
9. `docs/status.md` non-product blurb says "6 modules" while the curriculum lists 7.
