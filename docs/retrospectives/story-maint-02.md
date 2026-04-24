# Story maint-02 retrospective

**PR:** [#44](https://github.com/xavierbriand/accounting/pull/44)  **Closed:** pending merge  **Closes issue:** [#22](https://github.com/xavierbriand/accounting/issues/22)

Second story on the pre-Epic-3 maintenance track. Ninth end-to-end run of the loop overall. Genuinely tiny scope: replace a 1-expression fallback chain in `FileConfigService`. Net diff: 2 LOC in production, 14 LOC in tests (1 new test + `vi` import + `afterEach` unwind). Plan doc landed at ~110 lines (vs maint-01's 276) — first data point for the "plan-doc scales with story size" pattern maint-01's retro proposed.

## Keep

- **Sonnet's TDD-rigor caught a flaw in my plan before it could ship a false-green test.** My plan specified `vi.stubEnv('HOME', '')` for the red→green test. Sonnet tried it, discovered that on POSIX `os.homedir()` returns `''` when `HOME` is empty-string (it reads the env literally, doesn't fallback), so `path.join('', '.config')` equals `path.join(os.homedir(), '.config')` in that specific case — the test would pass on both old and new code. Silent false-green. Sonnet switched to `vi.stubEnv('HOME', undefined)` (HOME fully deleted), which causes `os.homedir()` to fall through to `/etc/passwd` on POSIX, producing a genuinely different path from the old `/tmp` fallback. **TDD's "write a test that would fail against the wrong implementation" discipline caught the plan-text flaw. Without the red→green proof, I'd have shipped a test that didn't actually test the fix.** Value from keeping the strict TDD rhythm even on tiny stories.
- **Plan-doc size scaled correctly with story size.** Story-maint-01's retro proposed "for stories under ~20 LOC of diff, the plan doc could be a section in the PR body rather than a dedicated `docs/plans/` file — informal, if maint-02 through maint-04 all fit this shape, propose it formally". Tested it here: kept the plan doc but trimmed from 276 to ~110 lines by density rather than section-removal (same structure, denser prose, skipped the "implementation details" fan-out since there was nothing to fan out). **Structure stayed; verbosity dropped. Matches the retro's intent without the structural change.** One more data point (maint-03 or similar) will settle whether "scale by density" is the right answer vs "promote to PR body".
- **P1/P2/P3 on a tiny story legitimately resolves to all-rejections.** Plan-phase review found 3 suggestions, all rejected with reasons (over-scoping, PII non-issue, node: import cosmetic drift). An empty-after-review suggestion log used to feel like a skipped step; on a small story it's the correct outcome. **Don't confuse "no adopted suggestions" with "reviewer didn't engage" — the reviewer engaged, the plan was right.**
- **Rules landed in maint-01 held on first application.** (i) `subagent_type: "sonnet-implementer"` direct invocation: worked first try, zero fallback needed. (ii) Inline-refactor < 5 LOC exception: didn't trigger (no refactor needed), but passively validated — the rule didn't interfere. (iii) Safeguard-removal rule in sonnet-implementer.md § 4: borderline trigger (Sonnet dropped `process.env['HOME']` from a fallback chain) — see Change B below. **Three new rules from maint-01 co-existed with this story cleanly; zero conflict with existing workflow.**

## Change

- **A. Plan-phase env-var test fixtures need deliberate `undefined` vs `''` picks.** When a plan specifies a test that unsets an env var, I need to (a) distinguish between "empty string" and "fully deleted", (b) pick the one that produces a true red against the pre-fix code, (c) call it out in the plan's test-shape description so Sonnet doesn't have to re-derive it. Saved here by Sonnet's TDD rigor; next time could silently ship a useless test. Not worth a rule change — pattern-match on "env-var test" and verify red-proof in the plan write-up. Action: add to personal plan-writing checklist (not a docs update — too niche for CLAUDE.md).
- **B. Safeguard-removal rule has a blurry boundary on "fallback-chain member removal."** Sonnet dropped `process.env['HOME']` from the fallback chain `homeDir ?? HOME ?? '/tmp'` and did NOT flag it as a safeguard-removal in Deviations. Arguable either way: strict reading ("any defensive-chain member" triggers) would flag it; pragmatic reading ("replacement clearly preserves purpose via a documented internal reference") would skip. Sonnet took the pragmatic reading; the plan-text also spelled it out; I reviewed the diff and agreed. **The rule as-written (from maint-01 retro) doesn't distinguish "removed → no replacement" from "removed → absorbed by a more general construct".** Don't tighten the rule yet — one borderline case isn't enough evidence. But if maint-03 or a later story removes a fallback-chain member without the plan pre-explaining the absorption, Sonnet should flag it. **Try:** extend the rule in a future retro (not this one) to say "mechanical chain-member removal where the replacement absorbs the prior branch's purpose can skip the Deviations entry *iff the plan text documents the absorption*; otherwise flag." Too narrow to codify now; park for observation.

## Try

- **"Plan-to-PR-body" threshold experiment.** Informal observation: story-maint-02's plan doc is 109 lines for a 2-LOC production diff. If the next 1–2 similarly-sized stories land, propose in that retro: for sub-10-LOC production diffs with a single acceptance scenario and all-reject suggestion logs, move the plan content directly into the PR body and skip `docs/plans/story-X.md`. Saves one commit + one file lookup per story. Don't propose yet — one data point.
- **Plan-phase env-var sanity-check.** Before committing a plan that names specific env-var values in a test fixture (empty string vs `undefined` vs a placeholder), actually reason through what the pre-change code does with each value. Mental dry-run. Not a rule, just a reviewer habit.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Personal plan-writing checklist note: "env-var test fixtures need `undefined` vs `''` explicit picks with red-proof". | Not docs — reviewer habit. | informal, tracked by reference to this retro |
| B. Observe the safeguard-removal rule's behaviour on the next 1–2 stories that remove a fallback-chain member; codify a refinement only if a borderline case causes a real miss. | Observed across maint-03 and beyond. | open, passive |

## Loop metrics (ninth run; second maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs, audit unchanged from prior loop) + Opus P1/P2/P3 plan review (3 findings, all rejected with reasons).
- **Implementation:** 1 Sonnet task (3 commits of 3 planned). 1 deviation (`stubEnv` value change — caught and documented).
- **Phase-4 retro-check:** 3 passes (P1 / P2 / P3). Zero findings — diff is minimal and aligns exactly with plan.
- **Retro fixes:** 0 (no blockers surfaced).
- **Issues closed by this story:** [#22](https://github.com/xavierbriand/accounting/issues/22).
- **Issues opened:** 0.
- **Total commits on branch:** 5 (1 plan + 3 implementation + this retro).
- **Test count:** 212 → 213 (+1 new integration test).
- **Diff stats:** 2 LOC prod + 14 LOC test + 109 LOC plan + ~75 LOC retro.
- **Bugs squashed:** 0 (this was hardening, not bug-fix).
- **New runtime deps:** 0. **New dev deps:** 0.
- **Time-to-DoD:** sub-10-minute implementation; ~20 min total including plan + review + retro.

## Carryovers resolved

- Story 1.4 retro P3 finding (`/tmp` HOME fallback) → **CLOSED by this story**.
- Story-maint-01 retro action A (safeguard-removal rule in sonnet-implementer.md § 4) → engaged; borderline case observed, rule held pragmatically. See Change B.
- Story-maint-01 retro action B (Opus inline-refactor < 5 LOC exception) → didn't trigger (no refactor needed).
- Story-maint-01 retro action E (CLAUDE.md § 6.3 invocation note refresh) → engaged; `subagent_type: "sonnet-implementer"` direct invocation worked first try on this story, as the updated note promised.
- Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config consolidation): still open, not touched this story. Next potentially at maint-03 if another story needs the vitest config.
- Issue [#43](https://github.com/xavierbriand/accounting/issues/43) (helper extraction): still open, not touched.
