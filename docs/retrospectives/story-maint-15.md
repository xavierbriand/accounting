# Story story-maint-15 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/71  **Closed:** 2026-04-26

## Keep

- **The cheat-sheet indirection paid off again.** CLAUDE.md required ZERO edits in this story — § 1 points to docs/status.md, § 6.1 phase 2/4 already reference the agents, § 6.3 already has the session-restart note. The compression done in maint-12 (moving timeline data to status.md) is exactly the design that prevents drift accumulation in the cheat sheet.
- **R15 collapse stretches further than originally specified.** Three layers of extension by analogy now: dep-bump-zero-code (R15 canonical, maint-05/06) → process-refresh (maint-12) → agent-spec (maint-13/14) → doc-refresh (this story). All four shapes use the same 4-commit (plan + chore/feat + refactor + retro) pattern. Three data points was borderline for codifying R16 (per maint-14 retro); four is enough. Track for codification in the next process-touching story.
- **README + status.md as a refresh-pair.** The split (README is public landing, status.md is internals log) matches reading patterns: a contributor opens README; an internals-curious reader follows the pointer to status.md. Refreshing both together preserves the indirection without redundancy.

## Change

- **README has no refresh trigger documented.** Unlike status.md (which has a "Refresh trigger" section explaining when to update), README.md is updated reactively. This story exists because the user spotted the staleness explicitly. If README drifts again before Story 3.2 ships, codify a refresh trigger (e.g., "README's Status section refreshes alongside status.md whenever the 'Next' line changes").
- **The "shipping with this PR" wording in maint-12's status.md log entry was self-referential and stale on landing.** The entry read *"story-maint-12 shipping. …"* — accurate at PR-open time but meaningless after merge. This story rewrote the wording to *"story-maint-12 merged (#68). …"* mirroring all other entries. Future status-log additions should be authored as if the merge has happened (or use future tense consistently and rewrite at merge time).

## Try

- **Codify R16 (R15-extension to non-dep-bump zero-code stories) in the next process-touching PR.** Four data points (maint-12, maint-13, maint-14, maint-15) cover process-refresh + agent-spec + doc-refresh. The codified rule could read: "R16 — R15 collapse extends to any zero-behaviour-change story (process refresh, agent spec, doc refresh): 4 commits as `chore(docs)` plan + `chore(docs)`/`feat(agent)` change + `refactor:` empty slot + `chore(retro)`."
- **Document a README refresh trigger** alongside R16 codification. Lightweight: a one-line "Refresh trigger" comment near the Status section ("Refresh when the 'Next' line in docs/status.md changes, or when adding a new top-level npm script.").
- **First-real-story dogfood for both agents at Story 3.2.** Track the agents' findings; if `code-reviewer` produces high-N/A noise on a real diff, refine the spec.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** The only files touched outside the plan/retro are README.md and docs/status.md — and the explicit purpose of the change is to *reduce* drift, not introduce it.
- [x] If yes, reconciled in this PR? N/A.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| README.md Status section refreshed | `README.md` | done (slice 2, commit `9ddc114`) |
| README.md Scripts table: add `npm run ingest` | `README.md` | done (slice 2, commit `9ddc114`) |
| README.md Documentation list: add docs/status.md pointer | `README.md` | done (slice 2, commit `9ddc114`) |
| docs/status.md: maint-13 + maint-14 + maint-15 entries | `docs/status.md` | done (slice 2, commit `9ddc114`) |
| docs/status.md: Refactor-epic summary line | `docs/status.md` | done (slice 2, commit `9ddc114`) |
| R16 codification (R15-extension) | future CLAUDE.md edit | open (4 data points; next process-touching PR) |
| README refresh trigger | future README edit (alongside R16) | open |
| First-real-story agent dogfood | Story 3.2 plan + retro | open |
