# Story maint-23 retrospective

**PR:** [#201](https://github.com/xavierbriand/accounting/pull/201)  **Closed:** pending merge  **Closes issue:** [#43](https://github.com/xavierbriand/accounting/issues/43)

Smallest-scope maintenance story in recent memory: a pure test-infra mechanical extraction with zero production code touched and zero new tests. Collapses a `PassThrough`-wrapped capturing-stream helper (`makeCapture`/`makeStdout`, a `.captured` getter) duplicated across 7 test files (grown from 4 at the issue's filing during story-maint-01) into one shared `tests/_helpers/streams.ts` module. Diff: 8 files, 17 insertions, 62 deletions — net negative LOC.

## Keep

- **Re-verifying issue relevance before planning caught real drift.** The user asked to "check if #43 is still relevant" before committing to a story. It was not only still relevant but *more* relevant than at filing — duplication had grown from 4 files to 7. Confirming the actual current state (via `md5` diff of all 7 declarations) rather than trusting the issue body's 2026-04-24 snapshot avoided under-scoping the plan.
- **The aliased-import approach (keep each file's local call-site name, don't rename ~34 call sites) held up under Phase 4 review.** It was flagged only as a soft, already-reasoned tradeoff (discoverability of the canonical name vs diff-churn minimization), not a defect — confirms the "don't add churn beyond what the task requires" judgment call was sound.
- **Following the existing `spawn-cli.ts`/`inline-config.ts` convention (no dedicated unit test for the extracted helper) was validated, not just assumed.** Phase 4 review explicitly checked whether a new unit test was warranted (comparing against the `findDuplicateIndices` precedent from story-maint-11, which *did* get one) and agreed the "verbatim relocation of already-covered code, exercised by 7 consuming suites" framing was the right call, not the "new pure-logic helper" framing.
- **The Phase-4-findings-as-a-separate-commit pattern (established by story-maint-21/22) transferred cleanly to a non-dependency-bump story.** `chore(docs): story-<id> — Phase 4 findings (...)` after the empty refactor slice, before the retro commit, kept the plan's Suggestion log and the PR body in sync without conflating "no code fix needed" (R11 empty refactor) with "the review still produced findings worth recording."

## Change

- **This story surfaced the same rule-coverage-gap theme as [issue #200](https://github.com/xavierbriand/accounting/issues/200) from a third angle, and it's tempting to over-generalize.** Issue #200 covers "the § 6 lane table doesn't list R15 as a selectable Envelope value" for *dependency-bump* stories. This story's Phase 4 review found three *related but distinct* gaps for *test-infra-only* stories: the lane table's Reduced trigger doesn't literally say "tests/-only," R5's Gherkin-audit carve-out doesn't literally cover "zero-scenario mechanical extraction with existing tests as guard," and R16's trigger list doesn't literally say "test-code refactor." All three got ACKNOWLEDGE (first occurrence, not yet at the repo's own "codify on reproduction" bar) rather than being folded into #200 or spawning three new issues. That was the right call for *this* story, but it means the underlying pattern — "the § 6 lane table's literal wording keeps failing to anticipate new story shapes, and every story just reasons by analogy and moves on" — is now visible from two independent angles (dependency-bumps via #200, test-infra via this retro) without a tracking mechanism connecting them. Left as an observation, not an issue, per this repo's own convention of waiting for a second data point on *this specific angle* before codifying — but worth deliberately checking whether a *fourth* story (any lane, any angle) reproduces "the literal trigger table doesn't cover my story's shape" before treating each new angle as independently below-threshold forever.
- **The `fails if` mechanism-classification error (integration/perf tests are in-process against real SQLite/FS, not "subprocess-adjacent") was a planning-time guess that went unverified until Phase 4.** The plan's original wording hedged with "-adjacent" rather than checking the actual test file for `spawnCli`/`execFileSync` calls — a two-minute grep that would have caught it before Phase 4 review had to. Small, but it's the second time in this session's visible history (after story-maint-22's changelog-completeness gap) that a hedge-word in a plan substituted for an actual verification step.

## Try

- **When a plan describes a test file's execution mechanism (in-process vs subprocess vs "-adjacent"), grep the file for the actual subprocess-invoking call (`spawnCli`, `execFileSync`, `spawnSync`) before writing the classification, rather than describing it from memory of the test's tier name.** Cheap, and this is now two stories in a row (maint-22's changelog claim, this story's mechanism claim) where a to-be-verified planning claim shipped unverified until Phase 4 caught it.
- **Watch for a fourth "lane table doesn't literally cover this story's shape" data point (any angle, not just R15/dependency-bumps or R16/test-infra) before deciding whether the fix belongs in the table's trigger wording itself (broaden each row) versus a per-angle footnote (append a new row per story-shape indefinitely, which doesn't scale).**

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Grep-verify test-mechanism classification (in-process vs subprocess) before writing a plan's `fails if` note, rather than describing from memory. | Next story whose plan classifies a test's execution mechanism. | open, passive |
| B. Watch whether a fourth lane-table-coverage-gap angle appears (beyond #200's dependency-bump angle and this story's test-infra angle) before deciding on a structural fix to CLAUDE.md § 6's trigger wording. | Retro of the next story that hits this gap, any angle. | open, passive |

## Loop metrics (this run)

- **Plan phase:** 1 maintenance sub-loop check + Phase 2 `sibling-overlap` review (3 findings, all acknowledge, 0 deferred).
- **Implementation:** 1 `sonnet-implementer` invocation, single commit, no red/green cycle (pure refactor, no new tests) — 8 files touched, ~5.5 minutes agent time.
- **Phase 4 review:** `code-reviewer` (1 P1 + 5 P3 findings, 2 soft; 2 fix-now, 4 acknowledge) + `sibling-overlap` (0 new findings, reconfirmed Phase 2) — run in parallel, ~6 minutes agent time.
- **Issues closed by this story:** [#43](https://github.com/xavierbriand/accounting/issues/43) (via merge).
- **Issues opened:** 0.
- **Total commits on branch:** 5 (plan+P2 review / implementation / empty refactor / Phase-4-findings / this retro) — below R13's 6–10 band by design (see plan § Slice plan), consistent with the story's genuinely small scope.
- **Test count:** 781 product tests, unchanged (same suite, relocated helper — 0 net new/removed tests).
- **Diff stats:** 8 files, +17/-62 LOC (net −45; the extraction itself is negative-LOC since 7 duplicated ~6-line functions collapse to 1 shared 6-line function + 7 one-line imports).
- **Bugs squashed:** 0 (test-infra dedup, not a bug fix). **Process observations surfaced:** 3 rule-coverage-gap acknowledgments (§ Change) + 1 planning-verification gap (§ Change).
- **`npm audit --audit-level=high`:** 0 findings, unchanged.
- **New runtime deps:** 0. **New dev deps:** 0.
- **Time-to-DoD:** maintenance sub-loop + plan drafting ~15 min; Phase 2 review ~45s agent time; implementation ~5.5 min agent time + local build/lint/test re-verification; Phase 4 review ~6 min (2 concurrent agents); this retro ~10 min.

## Carryovers resolved

- **[#43](https://github.com/xavierbriand/accounting/issues/43) (capturing-stream helper duplication)** → **CLOSED by this story** (via PR #201 merge). Filed at story-maint-01, deferred for ~2.5 months of repo history; duplication grew from 4 to 7 files in that window before being addressed.
- **[Issue #200](https://github.com/xavierbriand/accounting/issues/200) (R15/§6-lane-table reconciliation)** → not touched by this story; a related-but-distinct angle of the same underlying "lane table literal wording lags story-shape variety" pattern surfaced here (§ Change) and was left as a separate observation rather than folded in.
