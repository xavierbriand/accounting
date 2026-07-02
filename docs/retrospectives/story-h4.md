# Retrospective — story-h4 (Harness Module 5: cost & telemetry as a retro aid)

Plan: [docs/plans/story-h4.md](../plans/story-h4.md) · PR [#145](https://github.com/xavierbriand/accounting/pull/145) · Closes #99

## Cost (first use of the convention this story introduced)

- `metrics:story h4`: 1 attributed session (the sonnet-implementer run, C1–C6): input 314 · output 47,842 · cache-creation 89,610 · cache-read 4,909,712 tokens ≈ **$8.43** (claude-fable-5, corrected price map asOf 2026-07-02).
- **Cache reads are ~97% of all tokens.** This single number is the measured confirmation of the token-analysis thesis that motivated the arc: context (re)loading dominates consumption ~100:1 over generation. It is the baseline #143 (context diet) must move.
- Attribution caveats: the coordinator session is unattributed by design (cwd = main checkout, not the story worktree); Phase 4/5 usage post-dates the report. The tool initially printed $12.64 off fabricated rates — see Change.

## Loop metrics

- **Plan phase:** new-story-preflight skill triggered organically (first time); 2 Explore agents (docs footprint + harness survey) fed the scope; maintenance sub-loop ran twice effectively (pre-planning + Phase-2 snapshot update as siblings #140–#142 appeared mid-planning).
- **Phase 2:** plan-reviewer + sibling-overlap in parallel — 29 + 3 findings; 13 adopted / 5 acknowledged / 0 deferred / 0 rejected. The parallel pair caught a factual error in my own sub-loop record (npm-audit "flake" that #140 proved real).
- **Implementation:** 1 sonnet-implementer task (C1–C6; stalled once on a 600s stream watchdog mid-C5, resumed via SendMessage with zero loss) + 1 refactor round (C7).
- **Phase 4:** 21 findings → 6 fix-now (one real behavior bug: unknown `--` flags silently accepted beside a valid positional), 0 deferred. R5 mapping confirmed all three scenarios; R6/R7/R8 walks passed.
- **Commits:** P0 + C1–C8 as planned, plus one R9 inline fix (prices.json) = 8 change-body + 2. Within R13.
- **Weight ratio (reflexive):** plan ~264 LOC vs 1,804 diff insertions ≈ **0.15** — gate weight healthy for this story. Historical top-3 offenders per the new tool: story-2.5 (**1.73** — plan outweighed diff), story-h3 (0.72), story-maint-01 (0.70), matching the curriculum audit's "process cost ≫ story value" intuition with numbers.

## Keep

- **Parallel Phase-2 agents with distinct lenses.** sibling-overlap cross-referenced #140 and overturned my "registry flake" audit conclusion — a factual correction neither agent's brief alone would have surfaced.
- **Spike-with-decision-gate for unverified ground truth.** The plan's JSONL claim was wrong twice over (assistant records DO carry usage; OTEL was unverifiable) and the gate absorbed both corrections without scope damage.
- **Deterministic git-derived metrics over prose parsing.** loop.csv covers all 35 resolvable stories with reasoned skips; the rejected prose-scrape would have covered 21 brittle ones.
- **SendMessage resume of a stalled subagent.** The 600s watchdog kill mid-C5 cost nothing: worktree state + transcript resume continued exactly where it stopped.

## Change (what to do differently next time)

- **Sample data probes by record *type*, not head-of-file.** The planning probe read lines 1/3 of each JSONL and concluded "no usage fields"; assistant-type records deeper in every file carry full usage objects. A `jq 'group_by(.type)'`-style probe would have gotten it right the first time.
- **Generated reference data must cite a source and be verified at review.** The implementer fabricated plausible-looking prices.json rates; they survived Phase 3, Phase 4 (21 findings — none questioned the values), and were caught only when quoted against the pricing reference at Phase 5. Numbers in committed artifacts need a provenance note ("source: <url>, retrieved <date>") that reviewers can check — plausibility is not verification.
- **Regenerate committed generated artifacts as the last step of any commit touching their inputs.** loop.csv went stale twice within one story (C6, then C7) because plan edits followed generation. Mechanical candidate for #144's deterministic checks (staleness = re-run tool, diff output).

## Code-review findings (Phase 4)

21 findings, tagged in the plan's suggestion log: 6 fix-now landed in C7 (argv rejection + test, lib-purity relocation, dead fixtures deleted, README price wording, stale loop.csv, DoR tick), plus the P5-1 prices correction (R9 inline). No deferred issues. F10's acknowledged finding was made obsolete by C7's own F5 fix — log corrected for honesty.

## Try

- **Cost line in every retro from here on** (convention shipped in C6) — and judge #143's context diet against this story's cache-read baseline, not estimates.
- **Fold artifact-staleness and price-map-provenance checks into #144** (deterministic DoD checks) rather than minting a new R-rule now — rules crystallize failure modes; two data points first (curriculum Principle 7).
- **Re-probe OTEL file export when a standalone `claude` CLI is present** (gap documented in harness/metrics/README.md) — it remains the cleaner go-forward source than transcript parsing.

## Drift scan (mandatory)

`npx tsx harness/drift-scan/drift-scan.ts` → exit 0 at C8. No new R-tags introduced (R9/R13/R16/R17/R21 referenced above are existing § 8 rows).

## Action items

- [x] #99 closed by this PR with recorded deviations (issue comment posted at DoR).
- [x] Arc issues filed: #143 (context diet), #144 (deterministic DoD checks — now also carries the shared story-id matcher note and the two Try candidates above).
- [ ] User merge gate (PR #145 section 10).
