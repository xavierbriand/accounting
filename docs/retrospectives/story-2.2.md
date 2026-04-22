# Story 2.2 retrospective

**PR:** _pending_ (will be linked on draft PR open)  **Closed:** pending merge

Fourth end-to-end run of the product development loop (after 1.3, 1.4, 2.1). Smoothest run so far: zero Phase-4 blockers, zero green-on-landing collapses, zero in-implementation deviations that weren't correctly flagged. The adapter-story sizing rule from Story 2.1's retro (CLAUDE.md § 6.6) delivered a clean 7-slice commit sequence the first time. The "tool substitutions must appear under Deviations" rule from Story 2.1's retro (sonnet-implementer § 1) caught a real SQLite quirk and surfaced it correctly. Each previous retro's action items paid off in this run.

## Keep

- **Plan agent stress-test flipped 4 of 5 decisions before any code was written** — `|` → `\u001F` delimiter, canonicalizer split out of `HashFn`, `NOT NULL DEFAULT '' + partial index` → nullable `UNIQUE`, batching-at-500 → no batching. Each would have been a Phase-4 refactor blocker otherwise. The pattern is load-bearing: write a plan, stress-test it, update, *then* delegate.
- **The Plan agent also caught a silent-data-loss P2 miss**: description normalization (NFC + trim + whitespace-collapse). Without it, the same real transaction re-imported from a different CSV export (different trailing whitespace, NBSP, or NFD accents) would hash differently and the re-import would silently succeed — the exact QA invariant "no silent data loss on double import" we were writing Story 2.2 to protect. Catching this pre-implementation cost one paragraph in the plan and ~10 LOC + 3 property tests in the implementation. Would have been a blocker to discover in production.
- **Adapter-story sizing rule (CLAUDE.md § 6.6, Story 2.1 retro action B) worked.** Plan called for 7 slices: 1 doc + 2 Core + 2 Infra/crypto + 2 Infra/DB + 1 refactor. Sonnet delivered exactly 8 commits (one empty-refactor per § 6.4), zero green-on-landing, zero slice-collapses, every `test:` commit genuinely failed at the import boundary. Compare to Story 2.1 (3 of 5 green-on-landing). The rule change paid off on the first story after its introduction.
- **The "tool/library substitutions go in Deviations" rule (sonnet-implementer § 1, Story 2.1 retro action A) caught a real SQLite quirk.** Sonnet discovered that SQLite's `ALTER TABLE ADD COLUMN` does not accept inline `UNIQUE` — the plan's `ADD COLUMN idempotency_hash TEXT UNIQUE` had to become `ADD COLUMN ... TEXT` + `CREATE UNIQUE INDEX`. Semantics identical. Sonnet flagged it explicitly under Deviations (not just the commit message) per the new rule. This is exactly the class of finding Story 2.1's retro action was protecting against.
- **Empty `refactor:` commit with justification is the right pattern when nothing needs cleaning.** Commit `12af5b5` documents why: all new functions <50 LOC, no duplication, `checkField`/`fieldsToCheck` extraction happened inside the `feat:` commit as a § 6.5 during-green cleanup. Keeps the commit sequence aligned with the plan without forcing cosmetic changes.
- **Issue #29 filed pre-implementation, not post-merge.** Deferred suggestions from the *plan itself* (tighten `idempotency_hash` to NOT NULL post-Story-2.5) get filed as the plan stabilises, not as an afterthought. When Opus writes the retrospective, the issue already exists to reference. Simplifies the loop.

## Change

- **Plan files live in `~/.claude/plans/`, which Claude Code treats as a sensitive path**, so every plan edit prompts for permission. During this story's planning we made ~10 edits to the plan file and each required an explicit approval. That's friction for no defensive value — the plan is *about* this project and belongs inside it. Next time: plan files go in `docs/plans/<story-id>.md` (committed) or `.plans/<story-id>.md` (gitignored if preferred). Action item A.
- **The canonicalizer's US-in-field check only covers 4 of 6 fields** (`sourceAccount`, `occurredAt`, `direction`, `description` — skipping `currency` and `amount.amount`). The skipped two are type-guaranteed not to contain `\u001F` (currency is ISO 4217 3-letter, cents is `[0-9]+`). The omission is defensible on type-safety grounds — but a P3 reviewer could reasonably argue for symmetry (check all 6 for defense-in-depth). Minor finding, not a blocker. Not worth a refactor; noting for potential fold-in when a future format changes either field's shape.

## Try

- **Plan files inside the repo.** Move this story's plan (retroactively, as a note) and future stories' plans into `docs/plans/`. Commit them — the plan is part of the PR's intent record, and the Suggestion Log already lives in the PR description. Keeping the plan alongside the retrospective closes the loop. Action item A.
- **Pre-commit `this test fails if …` audit**, per Story 1.3 retro action E. Sonnet included these in every failing-test commit body; Opus should confirm at Phase 4 that each assertion *actually* fails in its absence. Story 2.2's tests are written well enough that a random test-body deletion would break CI for the right reason. Worth adding to the Phase-4 retro-check prose in CLAUDE.md § 6.1 if a future story surfaces a vacuous test.
- **For stories that add new schema:** the P3 retro-check should explicitly test migration idempotency (run the migrator twice, confirm second run is a no-op) and backward compatibility (can an old client still read the new column? here: no old clients exist yet, so moot). Sonnet handled both by integration test here; codify for future DB stories.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. Move plan files into the repo at `docs/plans/` (no more `~/.claude/plans/` sensitive-path permission prompts) | `docs/plans/` convention + update CLAUDE.md § 6 to reference it + retroactively copy this story's plan file | in same commit as this retro |
| B. Confirm `this test fails if …` notes actually protect the production path — audit during Phase 4 of future stories | Add one line to CLAUDE.md § 6.1 phase 4 description | in same commit as this retro |

## Loop metrics (fourth run)

- **Plan phase:** 1 Explore agent (codebase landscape) + 1 maintenance Explore agent + 1 Plan agent (stress-test) + 3-pass Opus critical review.
- **Implementation:** 1 Sonnet task (8 commits — 7 planned + 1 empty refactor, zero collapsed, zero green-on-landing).
- **Phase-4 retro-check:** **zero blockers** (first run with this outcome; compare to Story 2.1's 1 blocker / Story 1.3's 2 blockers). One minor non-blocker (US check covers 4/6 fields).
- **Deferred at plan:** 1 issue (#29, Story 2.5 tightening).
- **Deferred at review:** 0.
- **Total commits on branch:** 8.
- **Test count:** 108 (was 65 after Story 2.1).
- **Time-to-DoD:** one working session.

## Carryovers resolved

- Story 2.1 action D (CLAUDE.md § 1 "Current position" line refresh) → resolved in this story's commit 1 (`chore(docs)`).
- Story 2.1 action A (tool substitutions in Deviations) → validated: caught the SQLite `ALTER TABLE UNIQUE` quirk.
- Story 2.1 action B (adapter-story sizing) → validated: zero green-on-landing collapses.
- Story 2.1 retro action C (pre-return Sonnet question about tool substitutions) → resolved in-spirit by action A; confirmed redundant.
