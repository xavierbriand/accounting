# Story 2.3 retrospective

**PR:** _pending_ (will be linked on draft PR open)  **Closed:** pending merge

Fifth end-to-end run of the product development loop. Cleanest Phase 1+2 to date — plan stress-test caught a real collision risk (`endsWith`-on-id classifier) and three missing assertions before implementation. Phase 4 produced one legitimate refactor (the 84-LOC `build()` method), handled in a follow-up Sonnet pass. Nine commits total on the branch.

## Keep

- **Plan agent flipped a correctness bug pre-implementation.** First draft of the card-settlement classifier matched `AccountConfig.id.endsWith(suffix)`; Plan agent pointed out `bank-91234` (type:bank) would collide with `card-1234` (type:card) since both end in `1234`. Switched to explicit `cardSuffix: string` field on `AccountConfig` with a Zod cross-field refinement (required iff `type === 'card'`). The collision case is not a theoretical concern — it's exactly the kind of silent-misclassification-dressed-as-Uncategorized the user wouldn't notice until settlement math diverged.
- **Plan agent caught three missing test assertions**: (1) distinct UUIDs across a batch (the kind of bug that passes per-item tests but blows up at Story 2.5's `INSERT ... UNIQUE` constraint); (2) `transaction.description` preservation (must carry the *original* `IngestItem.description`, not the matched category — audit-trail invariant); (3) `transaction.occurredAt` pass-through (Story 2.2's idempotency hash depends on the exact ISO string; any silent reformat would cascade into broken dedup). All three landed as Gherkin scenarios + tests.
- **Adapter-story sizing (CLAUDE.md § 6.6) held for the second consecutive story.** Plan called for 8 slices; Sonnet delivered 8 clean commits (config + obvious-basics + card-settlement + refactor) with zero green-on-landing collapses — compare to Story 2.1's 3-of-5. The rule is validated.
- **Plan file at `docs/plans/story-2.3.md` from commit 1** (Story 2.2 retro action A applied). Zero sensitive-path permission prompts during planning, unlike Stories 2.1/2.2 which each triggered ~10. Doc-in-repo is the right default for project-scoped plans.
- **Phase 4 retro-check's explicit "this test fails if …" audit** (Story 2.2 retro action B) caught nothing new here — tests are well-scoped. That's *also* a signal the practice works: when it catches nothing, that's because the plan's "fails if" notes are already rigorous. Low-cost discipline.
- **Refactor-in-a-second-pass pattern.** The initial refactor slot (`de2b1b5`) did a tiny cleanup and explicitly deferred the bigger 84-LOC-`build()` extraction with a note citing § 6.5's during-green limit. Opus's Phase 4 retro-check decided it *should* be fixed before merge (violated <50 LOC guideline, 4-way duplication added a DRY concern). A second `refactor(ingest)` commit (`df31b03`) extracted `makeOutcome`; `build()` dropped from 84 LOC to 33 LOC, all 151 tests stayed green without modification. This is the § 6.1 phase 4 "blockers are fixed before merge" pattern working correctly.

## Change

- **First-draft `build()` was 84 LOC with 4-way duplication** — each of the four (source.type, direction) branches had a full `Transaction.create({…})` block. Sonnet's initial refactor slot explicitly deferred extracting the helper, citing the during-green 20-LOC touch rule. Arguably Sonnet should have seen this as a structural refactor candidate *during* the `feat:` commit and either flagged it more loudly or called out in Deviations that a follow-up was coming. The extraction was trivial once surfaced — a single `makeOutcome` helper with 6 positional args. Next time: if an `feat:` commit produces a function over ~60 LOC with >2 duplicated blocks, Sonnet's Deviations should say "this will need post-green refactoring" so Opus's Phase 4 review doesn't have to discover it.
- **Refactor-slot commit message was too brief.** `de2b1b5`'s message says `defaultUuidGen IIFE` simplification — one LOC changed. The substantive 29-LOC reduction happened in `df31b03` after Phase 4. The initial commit's message should have been explicit: "deferred the direction-table extraction to Phase 4 — see Deviations." Minor but affects reviewability of the git history.

## Try

- **Add a "60 LOC trigger" to sonnet-implementer § 3** (Refactor-during-green allowance). Current wording says "<~20 LOC of existing code" for the deferral threshold. Add: *if a newly-written function exceeds ~60 LOC with >2 duplicated blocks, call it out explicitly in Deviations as a post-green refactor candidate — don't silently ship the bloat.* Action item A.
- **Phase 4 LOC audit pass.** Opus's Phase 4 retro-check should include a grep for functions exceeding 50 LOC in the diff before deciding if a refactor round is needed. Currently decided by eyeball; a pre-commit or Phase-4 shell one-liner (e.g. `awk`/`grep`) would make the check explicit. Not urgent — documenting it as a future polish, not filing an issue.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Add "60 LOC + duplication ≥ 2 blocks = flag in Deviations" threshold to `.claude/agents/sonnet-implementer.md` § 3 (Refactor-during-green allowance) | `.claude/agents/sonnet-implementer.md` in this PR | in same commit as this retro |

## Loop metrics (fifth run)

- **Plan phase:** 1 maintenance Explore + 1 landscape Explore (parallel) + 1 Plan agent (stress-test, 4 findings) + 3-pass Opus critical review.
- **Implementation:** 1 Sonnet task (8 commits — 7 planned + 1 refactor slot, zero collapsed, one minor green-on-landing called out) + 1 Phase-4 refactor Sonnet task (1 commit, `makeOutcome` extraction).
- **Phase-4 retro-check:** 1 refactor-fix (build() LOC + duplication), resolved in branch pre-merge. Zero blockers that required test changes.
- **Deferred at plan:** 0 new issues filed (Story 2.5 tightening is already #29; auto-tag YAML override has a trigger condition, no issue yet).
- **Total commits on branch:** 10 (1 chore + 6 test/feat + 2 refactor + 1 retro).
- **Test count:** 151 (was 108 after Story 2.2).
- **Sensitive-path permission prompts during planning:** 0 (plan file in `docs/plans/`, thanks to 2.2 retro action A).
- **Time-to-DoD:** one working session.

## Carryovers resolved

- Story 2.1 retro action D (CLAUDE.md § 1 refresh) → already closed in Story 2.2; this story's first commit keeps it current (Next story → 2.4).
- Story 2.2 retro action A (plans at `docs/plans/`) → validated — this is the first plan authored there from the start.
- Story 2.2 retro action B (Phase 4 "this test fails if …" audit) → no findings, indicating the practice works without surfacing issues each time.
