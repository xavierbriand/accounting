# Story maint-04 retrospective

**PR:** [#50](https://github.com/xavierbriand/accounting/pull/50)  **Closed:** pending merge  **Closes issue:** [#21](https://github.com/xavierbriand/accounting/issues/21)

Fourth story on the pre-Epic-3 maintenance track. Eleventh end-to-end run of the loop overall. First **security-hardening** story (vs hardening-with-UX or pure-tooling). Plan scope: symlink rejection at the CLI composition root for both `migrate` and `ingest`. Implementation came in 8 commits + 1 Opus inline fix + retro = 10 on the branch. Test count 217 → 224 (+7: 5 helper + 2 subprocess). Reused the tsx-spawn subprocess pattern from story-maint-03.

## Keep

- **The four-story streak of "helper-at-composition-root" is now a stable pattern.** maint-02 (`os.homedir()` in FileConfigService) → maint-03 (`assertMigrated` before getDb) → maint-04 (`validateDbPath` before getDb). Three composition-root checks, all in `program.ts`'s action handlers, all with the same `Result.fail → stderr → exit 2` shape. Each check stays orthogonal; they compose without coupling. **Not yet a documented pattern in engineering-standards.md, but worth promoting once the next analogous check lands.** (#42 vitest config or future allowed-root validation would be candidates.)
- **§ 6.1 phase 4 inline-refactor exception (story-maint-01 retro action B) earned its keep.** P3 retro-check found a dead-code self-invocation in `migrate.ts` (`runMigrate('accounting.db')` at lines 15-17) that violated the new `resolvedDbPath` param name. All four exception criteria met (single file, < 5 LOC, fix coordinates pre-specified, no design question — the block is unreachable from any package.json script). Inline-fixed in commit `f024b02` rather than spinning up another Sonnet round. Saved an estimated ~5 minutes of round-trip overhead. **Three stories in, the rule continues to be calibrated correctly.**
- **Sonnet's deviation handling kept improving.** maint-03 was textbook (named the dropped guard's purpose). maint-04 went further: when the agent's worktree polluted the lint baseline, Sonnet **fixed the baseline first as a separately-named `chore(lint)` commit (`8dbd318`) before any story commits**. Clean separation. The plan didn't anticipate the pollution; Sonnet's response was disciplined.
- **Subprocess-test pattern is proving durable.** Second story to use it (after maint-03). Same `tsx`-binary-path + `execFileSync` + try-catch + `afterEach` cleanup shape. Two new tests added cleanly; no friction from the pattern itself. **If maint-05 or a later story uses it again, promote to docs/engineering-standards.md as a recognized test category.** Two data points isn't enough yet; want a third.
- **Plan-doc length stayed appropriate.** ~150 lines for a story with a real design dimension (allowed-root scope cut, Option A vs B trade-off, three test layers). story-maint-02/03/04 plan-doc lengths: 110 → 173 → 197. Scaling with complexity, not story length. The maint-01 retro's "scale by density, not section removal" theory holds.
- **Security-checklist update was specific, not generic.** The diff at line 26 names the new helper, names the `.bak` transitive-protection chain, and credits Story 2.5's atomic-rename pattern that closes that surface. Future readers can trace the security posture without re-deriving the design.

## Change

- **A. `feat(db)` commit (`342e950`) bundled vitest config edits with the helper implementation.** Minor § 6.4 violation — a `feat:` commit should be the minimal code that turns the previously-failing tests green. The vitest `.claude` exclude is tooling baseline, structurally identical to the `chore(lint)` exclude in commit `8dbd318`. They should have been the same commit (or a sibling `chore(test)`). **Why it matters:** the `feat(db)` commit subject + body now describes both the helper AND a vitest exclude, which makes the commit's role ambiguous in `git log`. **Why I didn't rebase:** CLAUDE.md forbids interactive rebase (`-i`); a non-interactive splitting requires `git filter-branch` or temporary worktree rewriting — too much risk to fix a presentation issue. **Action B in this retro codifies the rule:** Sonnet must keep `chore(lint)` / `chore(test)` baseline-tooling commits separate from `test:` / `feat:` story commits, even when they're committed back-to-back.
- **B. Sonnet's grep for `runMigrate` callers missed the in-file self-call.** When verifying the param-rename was safe, Sonnet ran `grep -rn "runMigrate" src tests` (or equivalent) and found only `program.ts:37`. Correct as far as cross-file callers go. But the file being modified (`migrate.ts`) had a self-call at line 16 that the grep should have flagged. **Cause:** mental model was "find external callers"; the in-file self-call falls outside that frame. **Fix:** the standard "before renaming a function, find every call site" check needs to include the function's own file. Trivially captured: just don't filter the function's own file out of the grep, or include `git grep -p` to list contexts. **Codifying this is overkill for a one-time miss; note here for future reference.**
- **C. Worktree-pollution baseline fixes are foreseeable now.** maint-04 is the second story this session that started with `.claude/worktrees/` debris (the first was the `chore/dependabot-tmp-uuid` branch at the top of the session that got in the way of `git branch -d`). **Try-item C below proposes filing `.claude/` for `.gitignore` as [#51](https://github.com/xavierbriand/accounting/issues/51).** When that lands, future stories won't need a `chore(lint)` baseline fix.

## Try

- **Promote "composition-root pre-flight check" to a documented pattern.** When story-maint-05 or a future story adds a fourth or fifth check, write a short § in [docs/engineering-standards.md](../blob/main/docs/engineering-standards.md) describing the pattern: composition-root location, `Result<T>`-returning helper, `stderr + exit 2` on failure, mirror tests at unit + subprocess layers. Not before — three data points is borderline; four will be conclusive.
- **Codify the commit-bundle separation rule.** Extend [.claude/agents/sonnet-implementer.md § 4](../blob/main/.claude/agents/sonnet-implementer.md) "Deviations from plan" with: *"`chore:` baseline-tooling commits must stay separate from `test:`/`feat:` story commits, even when committed back-to-back. If a `feat:` commit body needs a tooling preamble, that preamble belongs in a sibling `chore:` commit landed first."* This is action item A below — lands in this PR per § 7 #10.
- **`.claude/` to `.gitignore`** — filed as [#51](https://github.com/xavierbriand/accounting/issues/51). Resolving it removes the need for `chore(lint)` baseline fixes in future stories.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Codify commit-bundle separation rule in `.claude/agents/sonnet-implementer.md` § 4. | This PR, same commit as this retro. | in same commit as this retro |
| B. Personal in-file self-call check before function rename. | Reviewer habit, not docs. | informal |
| C. [#51](https://github.com/xavierbriand/accounting/issues/51) — add `.claude/` to `.gitignore`. | Filed. | open |

## Loop metrics (eleventh run; fourth maintenance-track story)

- **Plan phase:** 1 maintenance sub-loop (0 new Dependabot PRs, audit unchanged) + Opus P1/P2/P3 plan review (5 findings: 2 adopted / 3 rejected / 0 deferred).
- **Implementation:** 1 Sonnet task (8 commits — 1 baseline `chore(lint)` + 6 planned slices + 1 `chore(docs)` security-checklist). 2 deviations (baseline `.claude` exclusion bundled, vitest configs bundled with `feat(db)`).
- **Phase-4 retro-check:** 3 passes (P1 / P2 / P3). 1 minor blocker (dead-code self-invocation in migrate.ts after the param rename) — fixed inline by Opus per § 6.1 phase 4 exception. Commit `f024b02`.
- **Issues closed by this story:** [#21](https://github.com/xavierbriand/accounting/issues/21).
- **Issues opened:** 1 ([#51](https://github.com/xavierbriand/accounting/issues/51) — `.claude/` in `.gitignore`).
- **Total commits on branch:** 10 (1 plan + 1 baseline lint fix + 6 planned slices + 1 Opus inline refactor + this retro).
- **Test count:** 217 → 224 (+7: 5 helper + 2 subprocess).
- **Diff stats:** 23 LOC helper + 16 LOC program.ts + 5 LOC migrate.ts (-3 inline refactor) + 105 LOC helper test + 110 LOC subprocess test + 1 LOC security-checklist + 197 LOC plan + ~95 LOC retro + tooling baseline (3 LOC across 3 config files).
- **Bugs squashed:** 1 latent path-traversal vector closed (#21). Plus removed 3 lines of dead code in migrate.ts.
- **New runtime deps:** 0. **New dev deps:** 0.
- **Time-to-DoD:** one session, ~50 min total.

## Carryovers resolved

- Story 1.4 P3 deferred suggestion (#21 dbPath validation) → **CLOSED by this story** (symlink scope; allowed-root deferred per plan).
- story-maint-01 retro action B (Opus inline-refactor < 5 LOC exception) → engaged for the second time (first: trivial timeout restore in maint-01 itself; second: dead-code removal here). Rule continues to fit.
- story-maint-01 retro action E (harness invocation refresh) → engaged for the fourth story in a row. `subagent_type: "sonnet-implementer"` direct invocation reliable.
- story-maint-03 retro Try ("plan-phase runtime-invocation verification") → **didn't trigger this story** because the subprocess test pattern was already specified in the plan (reusing maint-03's). One indication the rule self-stabilises after the first observation.
- Issue [#42](https://github.com/xavierbriand/accounting/issues/42) (vitest config consolidation): still open. This story added an `exclude` line to BOTH configs; resolving #42 would let us touch one file instead.
- Issue [#43](https://github.com/xavierbriand/accounting/issues/43) (helper extraction): still open.
- Issue [#46](https://github.com/xavierbriand/accounting/issues/46) (dist-not-runnable): still open. The new subprocess test pivots to `tsx` for the same reason maint-03's did.
