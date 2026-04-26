# Story story-maint-12 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/68  **Closed:** 2026-04-26

## Keep

- **Major-bump-zero-code-change collapse (R15) extends cleanly to docs-only stories.** The 4-commit shape (`chore(docs)` plan + `chore(docs)` change(s) + `refactor:` empty slot + `chore(retro)`) fits a process-refresh PR as well as it fits a dep bump. Worth noting the rule's applicability beyond its original major-bump trigger.
- **Compression with rule-tag indirection works.** Moving retro footnotes to a § 8 appendix and referencing rules as `R4`, `R12`, etc. preserved every active rule while dropping CLAUDE.md from 168 → 140 lines. Future readers scan the prose; click into § 8 only when they want the provenance. The grep-based verification gate (every retro footnote has a § 8 row, every prose `R<N>` reference resolves) gave high confidence the compression didn't lose anything.
- **The `docs/status.md` extraction.** Pulling "current position" out of CLAUDE.md and into a dedicated file with its own refresh-trigger section is the right shape — the file's purpose (status snapshot) matches its volatility (changes per merged story). CLAUDE.md is a cheat sheet; cheat sheets shouldn't carry timeline data.

## Change

- **Sonnet hit a usage limit mid-implementation.** The kill-recovery contract (sonnet-implementer.md § 7) defines the recovery protocol. Option (a) re-spawn was unavailable (same usage limit applies to a re-spawn); option (b) inline-Opus continuation took over from slice 2 onward. The Sonnet vs Opus tier separation was muddied for slices 2–5 of this story; documenting per the contract. Cause was infra (org monthly limit), not the workflow itself; no rule change needed beyond confirming the contract works.
- **Slice 1 (the plan commit) lives outside the Sonnet handoff** — it's authored and committed by Opus pre-handoff. The slice numbering in CLAUDE.md § 6.7 and the plan's own slice plan should make this consistent (currently the plan's slice plan starts numbering at 1 with "the plan commit" — so the Sonnet brief covers slices 2..N. Confirm or refine in a future story.)
- **The "Index" section in `docs/retrospectives/README.md`** had been stale at `_(none yet)_` since story 1.3 — 18 retros later, the enumerated index was never updated. The fix here (point at the directory listing instead) eliminates the maintenance burden but also illustrates that any "enumerate every X" doc section will eventually rot. Prefer pointers to authoritative sources over enumerations whenever the source is itself a filesystem listing.

## Try

- **Eat the maintenance-sub-loop template now.** story-maint-13 (next, plan-reviewer sub-agent) should copy-paste the new `docs/templates/maintenance-sub-loop.md` checklist into its plan's Context section verbatim, as the dogfood test. If the template needs minor adjustments to be quotable cleanly, fold them in story-maint-13's same PR (per § 7 #10 / R-bookkeeping).
- **Auto-generate `docs/status.md`** if it drifts more than once. Initial cost is moderate (a small script that parses retro filenames + dates from `git log`). Skip while manual maintenance + the new drift-scan retro item is unproven; revisit if the status log goes stale before the next epic milestone.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No** — this story IS the drift reconciliation pass. Specific reconciliations made:
  - § 3 `valid_to` mention reconciled with the implicit-`valid_to` implementation (Story 3.1).
  - § 1 "Current position" line relocated to `docs/status.md`.
  - § 6.1 / § 6.4 / § 6.7 inline retro footnotes consolidated into § 8 with no rule loss.
- [x] If yes, reconciled in this PR? Yes — all reconciliations land in slices 2 and 3. The drift-scan retro item itself is also added in slice 3, so this retrospective is the first to use the new template's drift-scan section.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Story-maint-09 retro Try-1 disposition (subsumed by R4) | `docs/retrospectives/story-maint-09.md` post-hoc note | done (slice 3, commit 7456dfb) |
| `docs/status.md` introduced | `docs/status.md` | done (slice 3, commit 7456dfb) |
| Maintenance-sub-loop template extracted | `docs/templates/maintenance-sub-loop.md` | done (slice 3, commit 7456dfb) |
| Drift-scan retro item codified | `docs/retrospectives/README.md` template | done (slice 3, commit 7456dfb) |
| Eat-the-template dogfood (story-maint-13) | story-maint-13 plan's Context section | open (deferred to next story) |
| `plan-reviewer` sub-agent | story-maint-13 (separate PR) | open |
| Auto-generation of `docs/status.md` | follow-up issue if drift recurs | open (no issue yet — premature) |
