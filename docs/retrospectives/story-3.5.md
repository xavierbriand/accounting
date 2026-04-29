# Story 3.5 retrospective

**PR:** [#89](https://github.com/xavierbriand/accounting/pull/89)  **Closed:** pending merge

Last story of Epic 3. Ships the `accounting status` CLI command — the user-facing capstone that exposes the four upstream services (3.1 splits, 3.2 buffers, 3.3 forecast, 3.4 calculator) as a single "Sunday Morning Audit" view. FR18 + FR19 + FR20 ship together: buffer table + transfer breakdown + forecast list, in human-readable Conversational-CFO output by default and machine-parsable JSON under `--json`. **Epic 3 is now complete.** 12 commits on the branch (plan + plan-revision + 8 implementation slices + 1 Phase-4 refactor + this retro). Test count: 529 → 653 (+124). Fifth Epic-3 story to round-trip both `plan-reviewer` (Phase 2) and `code-reviewer` (Phase 4) sub-agents end-to-end. First story to run under the post-#85 R17/R18/R19 protocol on the main checkout (no worktree friction this time — Story C had finished and the user transferred the checkout explicitly).

## Keep

- **AskUserQuestion the load-bearing decisions before plan drafting.** Continued from 3.1/3.2/3.3/3.4. Four questions, all four "(Recommended)" answers accepted. The four locked decisions (output scope = full triplet; default window = next calendar month; date injection = `Date.now()` boundary + `--as-of` override; calc-fail UX = inline-warn buffers anyway) shaped the plan and survived plan-review unchanged. Five stories in a row, the pattern catches design coherence bugs and forces the user to think through trade-offs before code is written. **Time to codify** as a CLAUDE.md § 6.1 phase 1 numbered step (deferred from Story 3.4 retro action C — still open).

- **Plan-reviewer caught two CRITICAL correctness bugs pre-implementation.**
  1. **`JSON.stringify(new Map())` produces `{}`** — the `perPartner` and `perPartnerSplit` Maps would have silently emitted empty objects in the JSON output. Plan-reviewer flagged it; plan rewrite added the explicit Map-to-object conversion contract + field rename (`expectedDate → date`) + cap-undefined-as-null rule. Without this pre-implementation fix, the JSON output would have been broken on Day 1.
  2. **`Money.toString()` format inconsistency** — plan prose used commas (`"EUR 1,234.56"`) but `Money.toString()` produces `"EUR 1234.56"` (no thousands separator). Property #2 (JSON↔human total agreement) would have failed by design. Fixed at plan time. **Two real bugs caught before Sonnet started**, both saved real implementation cycles.

- **Plan-reviewer flagged `splitsService` in `StatusCommandDeps` as YAGNI.** `SafeTransferCalculator` already holds the splits service internally. Dropped from the deps interface. Constructor surface stayed minimal — three services + clock + streams. Same coherence-checking pattern that caught `partnerRoster` YAGNI in Story 3.4.

- **Re-spawn Sonnet on context-limit (graduated to Keep in 3.4) wasn't needed this story.** Sonnet completed all 8 slices in one round without context-limit. The recording-fake-one-at-a-time pattern, `Money.toString()` agreement contract, and Map-to-object conversion all landed cleanly in the implementation.

- **Code-reviewer caught the Property #6 spec gap.** Plan said "all four cases exit 0" — but only one of the four (stale-targetDate-non-empty-buffers) was actually implemented as an exit-0 test. The from>to case was mislabeled (CLI-level exit 2, not calc-level exit 0); empty-buffers + stale calc-fail and ISO-validation-style calc-fail had no explicit exit-0 assertions. Phase 4 refactor added two new tests covering the missing cases. Same R6 honesty class as Stories 3.2/3.3/3.4 — code-reviewer continues to earn its keep on subtle test-spec drifts.

- **Code-reviewer caught the R8 mock-diversity gap.** `cap !== undefined` and `status: 'on-target'` / `'above-cap'` branches in both formatters were never exercised by the unit tests (only the cap=undefined / status=below default fixture). Phase 4 refactor added direct coverage for all three previously-uncovered branches. The structured-output diversity rule (R8) was applied correctly here for the first time on a CLI-tier formatter — pattern is robust.

- **Code-reviewer caught Property #2 comparator divergence from plan.** Plan locked `parseInt(money.replace(/\D/g, ''), 10)` as the comparator (no floating-point round-trip risk). Sonnet's implementation used `Math.round(parseFloat * 100)` — functionally equivalent in the test's cent range but technically not what the plan specified. Phase 4 refactor switched to the plan's idiom. Tightening matches the retro Try B intent (Sonnet sanity check on assertion strength) — though here it was the comparator's robustness, not the assertion itself, that drifted.

- **The new R17/R18/R19 protocol from PR #85 worked cleanly on the main checkout.** Story C had completed and the user explicitly transferred the checkout (`"You own the main checkout."`). No worktree friction. `git push origin HEAD` (not plain `git push`) avoided the `push.default = matching` hazard. Sibling-work check (R17) caught the only relevant pending PR (#81 Dependabot dev-deps patch — unrelated). Conflict-resolution protocol (R19) was not triggered (no rebase conflicts during this story). The protocol's first dogfooding-on-a-feature-story succeeded.

- **Pre-prescribed slice splitting (retro Try B from 3.2) held mostly.** 9 slices planned; 8 commits delivered. The collapse happened for a known reason: stale-targetDate handling was structurally bundled into Slice 3 because the type system forced it (the `transfer.ok = false` branch had to exist when `assembleStatusReport` was first written). Slice 6 became `green-on-land` — R10 sibling condition met, Sonnet documented the deviation in the commit body. Within R13 (8 of 6–10).

## Change

- **Sonnet's slice 6 collapse left no `feat:` slice 7 commit.** The plan prescribed `test(status): stale-targetDate inline-warn UX — failing` (Slice 6) followed by `feat(status): stale-targetDate inline-warn — minimal green` (Slice 7). Sonnet pre-implemented the inline-warn UX in Slice 3 (because the type forced the shape), and Slice 7 became empty. Sonnet collapsed Slices 6+7 into one `green-on-land` `test:` commit — R10-honest, but the planned 9-slice rhythm became 8. Same class as Story 3.3's slice-5 over-implementation; the retro Try A from Story 3.3 ("respect plan-prescribed splits even when helper aggregation makes one-shot easy") didn't fully take this time. **Lesson:** when the type system forces a code path to exist at the moment you build the happy-path branch, the "test fails → feat green" rhythm is already broken before slice 6 starts. Future plans should detect this case at slice-design time and either (a) re-plan the slices around the type-forcing constraint, or (b) explicitly note the slice will be `green-on-land`. Action item A.

- **Property #6's plan spec was overstated.** Plan said "All four cases exit 0" — but case 3 (`from>to`) is intercepted at the CLI level (exit 2, not calc-level), so it shouldn't have been listed as an exit-0 case in the first place. Case 4 (ISO calc-validation) was reachable through `buildSuggestedAction`'s fallback path but Sonnet's implementation only covered case 1 (stale-targetDate-non-empty-buffers) with an explicit exit-0 assertion. Phase 4 refactor added cases 2 and 4 as new tests, and renamed case 3 to clarify the boundary. **Lesson:** when a plan lists "N cases" for a property, walk each one mentally through the production path before committing the spec — verify each case actually reaches the system under test. Action item B.

- **Property #2 comparator implementation drift.** Plan locked `parseInt(money.replace(/\D/g, ''), 10)` (integer-only, no floating-point round-trip). Sonnet wrote `Math.round(parseFloat(decimal) * 100)` — functionally equivalent for the test's cent range, but vulnerable to round-trip values like `1234.575 → 123457.4999... → 123457` (off by one cent). Phase 4 caught it. **Lesson:** when the plan prescribes a specific technique with a stated rationale ("avoid floating-point round-trip"), Sonnet should preserve the technique even if a "cleaner-looking" alternative occurs at implementation time. The plan's rationale survives pattern-matching to a different idiom; the new idiom may not. Action item C.

- **What-style comments crept in despite the plan's emphasis on "non-obvious why".** Sonnet wrote four descriptive comments in `status-command.ts` (`// Validate --as-of if provided`, etc.) that just describe what the next 3 lines do. These passed Phase 3 because they read as "documentation" rather than "noise". Code-reviewer flagged them; Phase 4 refactor removed them. **Lesson:** the rule is "no comments unless non-obvious why" — period. Self-explanatory section labels are noise. The retro Try should make Sonnet apply this filter ruthlessly: before each comment, ask "could a reader figure this out from the code in 5 seconds?" If yes, delete. Action item D.

## Try

- **Plan-reviewer should walk N-case property specs through the actual production path.** When Plan-agent or plan-reviewer encounters a property like "All N cases exit 0" or "Generator covers M shapes", they should mentally trace each case through the SUT's code path and confirm reachability. If a case is unreachable (e.g., intercepted at a different layer), the spec should be reframed at plan time. Try this on Epic 4's first story; if it sticks, fold into the plan-reviewer agent spec.

- **Sonnet preserves plan-prescribed techniques verbatim when the plan states a rationale.** The Property #2 comparator drift (`parseInt` vs `Math.round(parseFloat × 100)`) showed that "functionally equivalent" implementations can still violate the plan's rationale (avoid floating-point round-trip). Add to sonnet-implementer agent spec: "When the plan prescribes a specific technique with an explicit rationale, preserve the technique unless the rationale demonstrably no longer applies in the implementation context."

- **Sonnet applies the no-comments rule ruthlessly.** Before each comment, ask "can a reader figure this out from the code in 5 seconds?" If yes, delete. The exception ("non-obvious why") should be exercised once per ~50 LOC, not once per section boundary. Add as a Sonnet-implementer-level retro check.

- **Slice planning around type-system constraints.** When the type system forces a code path to exist at the moment you build the happy-path branch, the planned slice for that code path becomes implicitly `green-on-land`. Plan-revision should detect this at design time. For Story 3.5, the `StatusReport.transfer` discriminated-union shape forced the `ok: false` branch to exist when `assembleStatusReport` was first written — making Slice 6's "failing test" planning unrealistic. Future plans should either re-plan around the constraint or explicitly mark the slice as `green-on-land` from the start.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between [CLAUDE.md](../../CLAUDE.md) and any `docs/` file? **No.** No new R-tag rules. The plan applies the existing R1–R19 plus the post-#85 R17/R18/R19 from story-maint-16. The fragment migration (per R17) is followed: this retro adds a fragment under `docs/status.d/` rather than a status.md log entry.
- [x] If yes, reconciled in this PR? **N/A.**

Both answers "no" — confirmed clean. Plan-reviewer + code-reviewer sub-agents work end-to-end on all five Epic-3 stories (3.1–3.5); R17/R18/R19 protocol from #85 dogfoods cleanly.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Plan-reviewer should detect "type-system forces this code path to exist" at slice-design time and re-plan or explicitly mark the slice as green-on-land | propose in Epic 4 first story PR or as a maintenance retro story | open |
| B. Plan-reviewer walks N-case property specs through the actual production path before locking the spec | propose in Epic 4 first story PR | open |
| C. Sonnet preserves plan-prescribed techniques verbatim when the plan states a rationale | sonnet-implementer.md update | open |
| D. Sonnet applies the no-comments rule ruthlessly (5-second-reader test) | sonnet-implementer.md update | open |
| E. Codify "AskUserQuestion the load-bearing decisions" as a CLAUDE.md § 6.1 phase 1 numbered step (deferred from Story 3.4 retro action C — five stories in a row, time has come) | CLAUDE.md § 6.1 | open |
| F. Resume-brief tightening for re-spawned sonnet-implementer (deferred from Story 3.4 retro action A — not needed this story but still open) | sonnet-implementer.md | open |

(No new GitHub issues filed this story — all action items are process / agent-spec tweaks for Epic 4.)

## Loop metrics (twelfth run, fifth-and-final of Epic 3)

- **Plan phase:** Maintenance sub-loop ran cleanly under the new R17 (sibling-work check). 1 Explore-equivalent (no Explore agent run; all context built up across Stories 3.1–3.4). 4 plan-mode AskUserQuestion options, all "(Recommended)" answers accepted. No Plan-agent stress-test pass. The user explicitly transferred the main checkout to me with "you own the main checkout" — first story to run on the main checkout under post-#85 protocol without worktree friction.
- **Phase 2 critical review (`plan-reviewer`):** 25 findings (P1: 9, P2: 6, P3: 10). 9 adopted (CRITICAL Map-to-object conversion fix; Money string format inconsistency fix; `splitsService` YAGNI removal; `nextCalendarMonth` 5 explicit edge cases; purity grep regex tightening; Property #1 generator non-empty buffer guarantee; Property #2 numeric-cents comparator; Scenarios 5+6 Given clauses; sub-loop note about issue #75). 0 deferred (no new GitHub issues filed). 0 explicit rejected. 13 acknowledged-only. **Two real correctness bugs caught pre-implementation** (`JSON.stringify(new Map())` returning `{}`; `Money.toString()` format mismatch).
- **Implementation:** 1 sonnet-implementer round, completed cleanly without context-limit. 8 implementation commits delivered (plan said 9; slice 6+7 collapsed via R10 green-on-landing because type-system pre-forced the failing-branch shape).
- **Phase 4 retro-check (`code-reviewer`):** 7 findings + 4 soft (P1: 2 — Property #6 plan-spec gap, Scenario 3 fails-if scope inflation; P2: 2 — R8 mock-diversity gap, Property #2 comparator divergence; P3: 3 — what-style comments, inline import, purity grep automation). All 7 substantive findings adopted; 4 soft suggestions left as future-cleanup notes. 1 Phase-4 refactor commit (`e6de5c2`) consolidated all fixes — 6 new tests added (3 R8 + 2 Property #6 + 1 automated purity grep), 4 what-style comments removed, 1 inline import hoisted, 1 comparator switched.
- **Test count:** 529 → 653 (+124). 58 test files (was 48 — +5 new files: feature, steps, status-command unit/property, status-formatter-json/human unit/property, status-stale-warn unit, R4 status-program subprocess). All green throughout.
- **LOC delta:** ~470 production lines (~150 status-command, ~85 status-formatter-json, ~100 status-formatter-human, ~30 status-report, ~35 node-clock, +15 program.ts wiring). Test/fixture lines higher (~1500 across new + extended test files).
- **CLAUDE.md / templates / agent-spec edits in same PR:** none (no new R-tag rule, no process edits — all action items A–F deferred to Epic 4's first PR).
- **`docs/status.d/` fragment:** new — `docs/status.d/2026-04-29-story-3.5.md` filed alongside this retro per R17.
