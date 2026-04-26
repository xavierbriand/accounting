# Story maint-15 — Refresh README.md + docs/status.md to reflect post-maint-14 state

## Context

Sixth story of the **Refactor epic** (Epic M-A). User-requested status refresh after PR #70 (story-maint-14, code-reviewer agent) merged. CLAUDE.md is current (both agent wirings landed in their respective stories), but two readable-by-humans surfaces are stale:

1. **README.md** — still says *"Early development. Epic 1 (Foundation) in progress — the money value object and migration runner are in place; next up is the double-entry ledger schema and repository."* That was Story 1.2 era. Since then: Epic 1 complete, Epic 2 complete, Story 3.1 shipped, 14 maintenance stories shipped, full BDD harness landed, dbPath behaviour reworked. The README's "Status" section is two epics out of date.
2. **docs/status.md** — log is missing maint-13 (#69, plan-reviewer) and maint-14 (#70, code-reviewer) entries. The "Refactor epic" line still says *"story-maint-01 through story-maint-12 shipped (or shipping with this PR)"* — should reflect maint-14.

CLAUDE.md does not need refresh: § 1 points to status.md (so timeline updates land there); § 6.1 phase 2 references plan-reviewer; § 6.1 phase 4 references code-reviewer; § 6.3 has the session-restart note. The cheat-sheet design is paying off.

This is a pure doc-refresh story — no code, no tests, no Gherkin. R15 collapse applies (extends to doc-refresh stories per the agent-spec extension established by maint-12/13/14).

**Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning** — copy-pasted from [docs/templates/maintenance-sub-loop.md](docs/templates/maintenance-sub-loop.md):

- [x] **Working tree clean.** `git status` clean post-PR-#70 merge; main rebased to `36c2414`.
- [x] **Open issues.** 6 deferred-suggestions ([#23](https://github.com/xavierbriand/accounting/issues/23), [#34](https://github.com/xavierbriand/accounting/issues/34), [#43](https://github.com/xavierbriand/accounting/issues/43), [#51](https://github.com/xavierbriand/accounting/issues/51), [#57](https://github.com/xavierbriand/accounting/issues/57), [#59](https://github.com/xavierbriand/accounting/issues/59)). None block this story.
- [x] **Open PRs.** None.
- [x] **`npm audit --audit-level=high`** — zero vulnerabilities.
- [x] **Proceed-to-planning.**

## Story

> As a new contributor (or my future self) opening README.md, I want the status section to reflect what has actually shipped — not a snapshot from Story 1.2 — and the project's `docs/status.md` log to include the most recent two merges, so that the public-facing landing page tells the truth.

No FR coverage (doc refresh). Walks [docs/status.md](docs/status.md) (refresh trigger), [README.md](README.md), and the post-maint-14 reality.

## Selected solution

### 1. README.md refresh

Targeted edits (no rewrite from scratch — preserve the existing tone and structure):

- **`## Status` section (line 7-9).** Replace stale Epic 1 line with current state: Epic 1 complete, Epic 2 complete, Story 3.1 shipped, Refactor epic in progress through maint-14, next up Story 3.2.
- **`## Scripts` table (line 40-48).** Add `npm run ingest` (landed in Story 2.4) — currently missing from the table.
- **`## Documentation` list (line 49-55).** Add a pointer to `docs/status.md` so readers know where the canonical "current position" lives.
- **`## Setup` section.** No change needed — `npm ci` + `npm run migrate` is still correct (migrate now reads dbPath from accounting.yaml per #65 fix in maint-11; the README already directs users to copy `accounting.example.yaml`).

What to NOT change in this story:
- Project description (paragraph 1) — still accurate.
- Stack list — still accurate.
- Configuration section — already covers YAML + XDG fallback (per Story 1.4 + maint-02).

### 2. docs/status.md refresh

- **"Current position" section (line 7-11).** Update the Refactor epic line: *"story-maint-01 through story-maint-12 shipped (or shipping with this PR)"* → *"story-maint-01 through story-maint-14 shipped; story-maint-15 (this) shipping."*
- **"Status log" section (line 25-47).** Prepend two new entries (newest first):
  - 2026-04-26 — story-maint-15 shipping. README + status-log refresh.
  - 2026-04-26 — story-maint-14 merged (#70). `code-reviewer` sub-agent for Phase 4 retro-check + CLAUDE.md § 6.1 phase 4 wiring.
  - 2026-04-26 — story-maint-13 merged (#69). `plan-reviewer` sub-agent for Phase 2 critical review + CLAUDE.md § 6.1 phase 2 wiring + `docs/architecture.md` validity-window drift fix surfaced by dogfood.
- The maint-12 log entry already exists; leave it.

## Production-code surface

**None.** Story is doc-refresh-only. R15 collapse applies.

## Gherkin acceptance scenarios

**None.** Verification surface:
- README's "Status" section names current epic state (Epic 1 done, Epic 2 done, 3.1 shipped, maint-14 shipped, 3.2 next).
- README's "Scripts" table lists all 4 npm scripts: `test`, `lint`, `build`, `migrate`, `ingest`.
- README's "Documentation" list includes a pointer to `docs/status.md`.
- `docs/status.md` Status log has entries for maint-13 and maint-14.
- `npm run lint && npm run build && npm test` still green (no production change; 292 tests).

## Slice plan

R15 collapse extended to doc-refresh stories. Target **4 commits** (matches maint-13/14 shape):

1. **`chore(docs): plan + P1/P2/P3 review (story-maint-15)`** — already authored.
2. **`chore(docs): refresh README.md status section + docs/status.md log (story-maint-15)`**
   - README.md edits per § 1 above.
   - docs/status.md edits per § 2 above.
   - Verify CLAUDE.md is unchanged (no drift here — § 1 → status.md indirection means the cheat sheet doesn't carry the dates).
3. **`refactor: empty slot — doc-refresh PR (story-maint-15)`**
   - Per § 6.4 + R15 + R11. Empty with justification — no code refactor surface in a doc refresh.
4. **`chore(retro): retrospective (story-maint-15)`**
   - Keep / Change / Try + Drift scan + Action items. Note that this is the smallest story yet (single-file refresh + status log) and validates that R15 collapse extends cleanly to "tiny doc refresh" stories.

## Risks & deferred items

- **README staleness recurrence.** The README has no refresh trigger (unlike status.md, which has one section explaining when to update). Adding a "Refresh trigger" line to README would be premature — the user can decide to refresh it whenever they spot drift, and the new drift-scan retro item (story-maint-12) catches CLAUDE.md ↔ docs/ contradictions but not README ↔ reality. Worth observing: if README drifts again before Story 3.2 ships, codify a refresh trigger.
- **`docs/status.md` auto-generation deferred** — already noted in story-maint-12 retro. Same status: skip while manual + drift-scan retro item is unproven; revisit if the file goes stale before the next epic milestone.
- **Out of scope:**
  - Auto-generating either file from retros / git log.
  - Refreshing `docs/epics.md` (epics doc was last touched at project setup; may need its own story but is not part of this status-refresh).
  - Refreshing `docs/prd.md` (NFR section may have drifted; out of scope).

## Verification plan

1. `npm run lint && npm run build && npm test` — green (no production change; 292 tests).
2. Manual: `cat README.md` — Status section reflects current reality; Scripts table has `npm run ingest`; Documentation list points to `docs/status.md`.
3. Manual: `cat docs/status.md` — Refactor epic line names "maint-01 through maint-14"; Status log has maint-13 + maint-14 entries.
4. CLAUDE.md unchanged: `git diff main..HEAD -- CLAUDE.md` is empty.

## Suggestion log

Phase 2 (P1 / P2 / P3) by Opus on 2026-04-26 — inline-Opus only (`plan-reviewer` not yet registered in this session per CLAUDE.md § 6.3).

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Should the README's Status section enumerate every shipped story, or just point to docs/status.md? | adopted (clarified) | High-level summary in README ("Epic 1 done, Epic 2 done, Story 3.1 shipped, Refactor epic in progress, Story 3.2 next") + a one-line pointer to `docs/status.md` for the full log. README is the public-facing landing; full log is for project-internals readers. |
| P1 | The README mentions "The money value object and migration runner are in place; next up is the double-entry ledger schema and repository" — keep the level of specificity, just update? | rejected | The original line was Story-1.2-specific. At the current scope, listing "next up" at the same level of detail (e.g., "Predictive Transfer Engine") would invite the same staleness in two stories. Keep a coarser "Next: Story 3.2 (Predictive Transfer Engine)" reference and let docs/status.md carry the specificity. |
| P2 | Privacy: README mentions household data, accounting.yaml — any new info leaked? | rejected | Existing wording. No new data exposed. |
| P2 | The "Scripts" table lists 4 commands but `npm run ingest` is missing. | adopted | Add ingest row. |
| P2 | Should the "Configuration" section explain the new dbPath authoritative behaviour from maint-11? | rejected | The Configuration section already says "The app reads its split rules and buffer targets from `accounting.yaml`" — implicitly authoritative. The dbPath specifically is a power-user concern (`--db-path-override` exists for recovery); README doesn't need to explain it. The accounting.example.yaml comments are the canonical source. |
| P3 | Should `docs/status.md` have a one-line summary at the top of its log section explaining the format? | rejected | The log section is self-evident: bullets, newest first. Adding meta-commentary would inflate the file. |
| P3 | The README's Documentation list could include a one-line description per file. | adopted (already true) | The current Documentation list already has descriptions ("Architectural decisions", "Epics and stories roadmap", etc.). Adding `docs/status.md` should follow the same pattern. |
| P3 | Slice 3 (empty refactor) — really empty, or use it for a small README polish? | adopted (clarified) | Genuinely empty per R11. The README polish is in slice 2; nothing else to clean up in a single doc-refresh slice. |

**Tally:** 3 adopted / 3 rejected / 0 deferred + 2 adopted-clarified. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 8 findings (5 adopted/clarified, 3 rejected, 0 deferred). Inline-Opus pass.
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
