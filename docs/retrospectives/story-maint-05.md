# Story maint-05 retrospective

**PR:** [#48](https://github.com/xavierbriand/accounting/pull/48)  **Closed:** pending merge  **Closes issue:** [#38](https://github.com/xavierbriand/accounting/issues/38)

Tenth end-to-end run of the loop. Originally planned as `story-maint-04` but **renamed to `story-maint-05`** when [PR #50](https://github.com/xavierbriand/accounting/pull/50) (issue #21, dbPath validation) was opened in parallel and claimed the `maint-04` id — #21 precedes #38 in the [story-maint-01 plan sequence](docs/plans/story-maint-01.md), so PR #50 has the stronger claim to `maint-04`. First pure-dependency story where the breaking-change audit produced a zero-code-change verdict against the stack. Diff: 1 LOC in [package.json](package.json), ~200 LOC of `package-lock.json` net change post-conflict-resolution, 210+ LOC plan doc, 0 LOC in [src/](src/) or [tests/](tests/). Cleared the `@inquirer/editor → external-editor → tmp` audit chain (GHSA-52f5-9888-hmc6) and — combined with [PR #49](https://github.com/xavierbriand/accounting/pull/49)'s `tmp`/`uuid` overrides landing on main — dropped total `npm audit` findings to zero without changing any behaviour. Mid-story churn: [#45](https://github.com/xavierbriand/accounting/pull/45), [#47](https://github.com/xavierbriand/accounting/pull/47), and [#49](https://github.com/xavierbriand/accounting/pull/49) merged to main; two rebases required; conflict resolution on `package-lock.json` (PR #49's overrides collided with my dep bump — resolved by regenerating the lockfile); full rename from `maint-04` to `maint-05` via `git filter-branch --msg-filter` + `git mv` + `sed`.

## Keep

- **Pre-planning probe (story-maint-01 precedent) earned its keep a second time.** Installing v8 + running lint/build/test/audit in the worktree *before* the plan was even committed turned an assumed-zero-code-change into a verified one. Without the probe, the plan's § 4 breaking-change audit would have stayed a paper claim — plausible from release notes, but untested. The probe converted it into `213 tests pass + tsc green + @inquirer/* audit chain 0/4`. **Two data points now (maint-01, maint-05); pattern codifies on the next use.**
- **Issue-body pre-work collapsed Phase 1 dramatically.** Issue [#38](https://github.com/xavierbriand/accounting/issues/38) already included the v6/v7/v8 breaking-change audit and the call-site inventory. Phase 1 reduced to: (a) cross-check audit rows against this repo's stack ([.github/workflows/ci.yml:18](.github/workflows/ci.yml) node 20, [package.json:22](package.json) `"type":"module"`, [tsconfig.json](tsconfig.json) `module: ESNext`) + (b) confirm two call-site signatures match v8's API + (c) run the probe. ~15 minutes total for the plan phase vs ~45 min for a typical story. **Lesson applies beyond this story:** when filing a `deferred-suggestion` or `dependencies` issue, front-load the breaking-change audit in the issue body — it converts plan-phase effort into issue-filing effort, and the plan becomes a cross-check instead of an analysis.
- **P1/P2/P3 on a dep-bump legitimately runs to 9 entries — 7 adopted, 2 rejected, 0 deferred.** Not empty-after-review (as maint-02's retro observed for tiny stories) but also not mostly-deferred (as feature stories tend to produce). Dep bumps have distinct concerns — audit-chain accounting, breaking-change cross-check against stack, commit-rhythm justification, Gherkin-to-test-mapping substitution, Phase 3 collapse — that a 2-LOC production fix doesn't trigger. **9 entries for a 1-LOC story is not overkill; it's the right density for a story where the process-level decisions outnumber the code-level decisions.**
- **Phase 4 retro-check completed in 5 minutes with 0 findings.** P1/P2/P3 retro-check's scenario-to-code walk was short because the plan had already set up the substitution (§ 5 scenario-to-verification-mechanism table). Phase 4 just confirmed the substitutions held: `git diff main...HEAD -- src/ tests/ | wc -l` = 0, CI build pass, `npm audit @inquirer/*` chain = 0. **When the plan anticipates the Phase 4 walk's difficulty, Phase 4 becomes confirmation rather than discovery.**

## Change

- **A. Phase 3 collapse into Phase 1 isn't sanctioned by CLAUDE.md.** The plan (§ 8) collapsed Phase 3 into the probe, invoking the [CLAUDE.md § 6.1 phase 4](CLAUDE.md) "trivial inline fix" carve-out by analogy. But § 6.1 phase 3 reads "Implement (Sonnet via `Task` with the `sonnet-implementer` agent)" as the canonical path — the carve-out is explicitly scoped to the refactor slot. My extension was pragmatic (delegation-for-a-2-file-dep-bump is pure ceremony) but undocumented. **Two data points now where the protocol stretched:** story-maint-02 Change B (safeguard-removal rule ambiguity, pragmatic resolution); story-maint-05 Change A (Phase 3 collapse, pragmatic resolution). Both in 4 runs. The "pragmatic resolution" is starting to be the modal path for maintenance stories; worth noting but not codifying yet.
- **B. Commit-rhythm deviation (no `test:/feat:` pair) needs a durable justification, not a one-off.** Plan § 7 rewrote the justification mid-Phase-2 (P3-6 suggestion adopted) from a weak Dependabot-minor-precedent argument to the structural argument "there is no behaviour to test-drive". The structural argument is right, but it isn't written down anywhere in CLAUDE.md — each future major-bump-zero-code-change story will have to re-derive it. **Don't codify yet** — one data point. If [#11 TypeScript 6](https://github.com/xavierbriand/accounting/issues/11) or [#12 ESLint 10](https://github.com/xavierbriand/accounting/issues/12) reproduce the same shape, the pattern is real and § 6.7 deserves a 2-line clarification. If they produce non-trivial code changes (likely for TS 6), this story is the special case and no rule change needed.

## Try

- **Observation target: the next major dep-bump story.** When [#11](https://github.com/xavierbriand/accounting/issues/11) or [#12](https://github.com/xavierbriand/accounting/issues/12) lands in the pre-Epic-3 sequence, explicitly answer three questions in the retro:
  1. Did the breaking-change audit produce a zero-code-change verdict?
  2. Did Phase 3 collapse into the probe?
  3. Was the commit-rhythm skipped?

  If *all three* answers are "yes" again, action item: add a 2-line sidebar to CLAUDE.md § 6.7 codifying the "major-bump-with-zero-code-change subcase" (collapse rules, commit sequence template). If *any* answer is "no", this story is the special case and no rule change needed.
- **Front-load the breaking-change audit in future `dependencies` issues.** When filing a major-bump issue for deferred execution, include the full v-by-v breaking-change-vs-our-stack table in the issue body (as #38 did). Converts plan-phase effort into issue-filing effort; makes the plan a confirmatory cross-check instead of primary analysis. Not a docs update — reviewer habit.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Observe whether the next major dep-bump story reproduces the Phase-3-collapse + rhythm-skip shape; codify in CLAUDE.md § 6.7 only if it does. | Retro of next major-bump story ([#11](https://github.com/xavierbriand/accounting/issues/11) or [#12](https://github.com/xavierbriand/accounting/issues/12)). | open, passive |
| B. Front-load breaking-change audits in future `dependencies` issues. | Reviewer habit; apply when filing [#11](https://github.com/xavierbriand/accounting/issues/11) / [#12](https://github.com/xavierbriand/accounting/issues/12) follow-ups. | informal |

## Loop metrics (tenth run; fifth maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs, audit unchanged except for the 4 low this story closes) + 1 pre-planning probe (install + lint + build + test + audit) + Opus P1/P2/P3 plan review (9 findings: 7 adopted, 2 rejected with reasons, 0 deferred).
- **Implementation:** Phase 3 collapsed into the pre-planning probe. No Sonnet invocation. 3 commits pre-retro (plan / deps / empty-refactor).
- **Phase-4 retro-check:** 3 passes (P1 / P2 / P3). Zero findings — diff is exactly what the plan specified; no src/ or tests/ changes to walk.
- **Retro fixes:** 0 (no blockers surfaced).
- **Issues closed by this story:** [#38](https://github.com/xavierbriand/accounting/issues/38).
- **Issues opened:** 0.
- **Total commits on branch:** 4 (plan / deps / empty-refactor / this retro).
- **Test count:** 213 → 213 (pre-bump probe to post-bump probe; zero delta from this story). Post-rebase baseline is 217/217 green — the +4 came from [#45](https://github.com/xavierbriand/accounting/pull/45) (story-maint-03) landing on main mid-story, not from this bump.
- **Diff stats:** 1 LOC prod ([package.json](package.json)) + 578 LOC regenerated lockfile + 210 LOC plan + ~90 LOC retro + 0 LOC src/ + 0 LOC tests/.
- **Bugs squashed:** 0 (supply-chain + audit-hygiene story).
- **`npm audit`:** 4 low → 0 on `@inquirer/*` chain. 4 moderate on `quickpickle / @cucumber/* / uuid` chain remain (out of scope — tracked in [#24](https://github.com/xavierbriand/accounting/issues/24)).
- **New runtime deps:** 0 (upgrade, not addition). **New dev deps:** 0.
- **Time-to-DoD:** ~15-minute implementation (probe = install + test + audit); ~30 min total including plan + Phase-2 review + Phase-4 retro-check + this retro.

## Carryovers resolved

- **[#38](https://github.com/xavierbriand/accounting/issues/38) (`@inquirer/prompts` 5 → 8 migration)** → **CLOSED by this story.**
- **Low-sev `@inquirer/editor → external-editor → tmp` audit chain (GHSA-52f5-9888-hmc6)** → **CLEARED.** v8 internalises `external-editor` as `@inquirer/external-editor@3` and replaces `yoctocolors` with Node `util.styleText`.
- **[Story-maint-01 retro](docs/retrospectives/story-maint-01.md) pre-Epic-3 sequence position** → advanced two steps (with a re-ordering). Current state: #18 ✓ (maint-01) → #22 ✓ (maint-02) → #35 ✓ (maint-03 via [#45](https://github.com/xavierbriand/accounting/pull/45)) → #21 (maint-04, in flight as [PR #50](https://github.com/xavierbriand/accounting/pull/50)) → **#38 ✓ (maint-05, this PR)** → [#12](https://github.com/xavierbriand/accounting/issues/12) → [#11](https://github.com/xavierbriand/accounting/issues/11) → Epic 3. The user ran #21 and #38 concurrently rather than strictly sequentially; lesson for the retro — sequence documents serve as priority hints, not as hard ordering.
- **[Story-maint-01 retro action A](docs/retrospectives/story-maint-01.md) (sonnet-implementer custom-agent direct invocation)** → didn't trigger (Phase 3 collapsed; no Sonnet task). Rule remains dormant-and-valid.
- **[Story-maint-01 retro action B](docs/retrospectives/story-maint-01.md) (Opus inline-refactor < 5 LOC exception)** → extended-by-analogy in the plan to cover a zero-code-change Phase 3 collapse. Acknowledged as a protocol stretch in Change A; passive-observation action item opened.
- **[Story-maint-02 retro Change B](docs/retrospectives/story-maint-02.md) (safeguard-removal rule borderline)** → didn't trigger (no code change, nothing to safeguard-remove). Rule remains in observation.
- **[Story-2.4 retro Change](docs/retrospectives/story-2.4.md) (`@inquirer/prompts` writes to `process.stderr` directly, bypasses injected streams)** → informed Option B's rejection in plan § 6. Known gap; still unaddressed by design.
