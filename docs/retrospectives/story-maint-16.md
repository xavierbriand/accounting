# Story maint-16 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/85  **Closed:** 2026-04-28

## Keep

- **Fragment migration was mechanical and clean.** 27 dated entries + 1 pre-history sentinel produced 29 files with zero ambiguity — each entry from the original log mapped 1:1 to a fragment. The plan's exact spec for frontmatter keys and filename convention left no judgment calls for the implementer.
- **R16 envelope (4 change-body commits) fit naturally.** The two substantial slices (migration + CLAUDE.md process edits) mapped cleanly to two body commits; the empty refactor slot required no justification beyond R11; the retro commit is own dogfood. No pressure to split or merge.
- **plan-reviewer adoption rate was high (9/14 findings adopted).** The P1/P2/P3 review cycle caught real gaps before implementation: ambiguous `wc -l` threshold (now an equality check), missing non-conflict rebase failure branch, under-specified README.md content, unclear heading retention. All landed as tighter prose in the plan. Worth the round-trip.
- **The migration-ordering-loss caveat is genuinely acceptable.** Intra-day ordering in the original log (e.g. 2026-04-26: 3.2 then maint-15 then maint-14) is not preserved under `ls -r`, but no reader queries the log at sub-day resolution. Documented in the commit body; no workaround needed.

- **Forward-link to the retro in the README.md spec** caused a minor chicken-and-egg: the plan's README.md content spec references `story-maint-16.md` (this file, authored in slice 5), while the README was created in slice 2. The forward link is correct in the final state but the README was committed before the retro file existed. No functional impact — the links all resolve once slice 5 lands — but a reviewer reading the repo mid-implementation would see a dangling link. Accept for now; future plans should note when a forward-link is a deliberate forward-reference rather than an error.
- **`docs/status.d/README.md` "Why fragments" section** references the retro as a forward link (the file is created in slice 2 but the retro lands in slice 5). Same chicken-and-egg as above. The forward-link pattern is safe in a linear branch but could confuse a mid-story checkout. Worth noting in any template that uses forward links.
- **The plan's § 5 README.md scope was too narrow.** The plan instructed adding a refresh-trigger one-liner but did not enumerate the two pre-existing "per-story log" references on lines 18 and 61 that became stale post-migration. code-reviewer caught both as P1/P2 drift; fixed in `51cc61b`. **Lesson:** when a story changes the role of a referenced file, the plan should walk every prose reference to that file across the repo, not just the obvious surface. Soft analogue of R2 for docs surfaces.

## Code-review findings (Phase 4)

`code-reviewer` sub-agent on 2026-04-28 — 8 findings (3 P1, 2 P2, 5 P3 incl. 2 soft). Tally: 3 fix-now · 5 acknowledged · 0 deferred.

| Phase | Finding | Resolution | Where |
| --- | --- | --- | --- |
| P1 | `README.md` lines 18, 61 still describe `docs/status.md` as containing a "per-story log" — stale post-migration | fix-now | `51cc61b` — both lines updated to point at `docs/status.d/` and reframe `status.md` as "current epic position" |
| P1 | `docs/status.d/README.md` purpose statement delivered as 2 sentences, plan said "one-line" | acknowledged | Content correct; minor verbosity divergence not worth a re-edit |
| P1 | Forward-links from slice-2 README to slice-3 R17 + slice-5 retro create mid-story dangling state; drift-scan claim is over-broad | acknowledged | All links resolve at branch tip; documented as "Change" item above |
| P2 | Same as P1 finding 1 (QA lens: misleading user-facing pointer) | (subsumed by P1 fix) | Same commit `51cc61b` |
| P2 | PII / privacy in migrated fragments | (no action) | Verbatim copy of public log; no new PII surface |
| P3 | Slice plan said 5 commits; actual is 6 (preparatory plan-reviewer-findings commit) | acknowledged | R16's 4-body-commit count still correct; preparatory commit was authored by Opus before phase 3 hand-off |
| P3 | Pre-history sentinel uses different frontmatter schema (`date: ~earlier`, `stories: [...]`) but `docs/status.d/README.md` doesn't document the divergence | fix-now | `51cc61b` — README "Filename convention" section now documents the sentinel's special schema |
| P3 | § 6.4.1 heading uses `###` (sibling level of § 6.4) | acknowledged | Plan-spec'd; no functional impact |
| P3 (soft) | "Suggested resolutions" `status-log style` example is the very file just removed — no longer illustrative | fix-now | `51cc61b` — example replaced with CLAUDE.md § 8 rule-table append pattern (still valid post-migration) |
| P3 (soft) | Suggest README parenthetical for sentinel schema | (subsumed by P3 fix-now above) | Same commit `51cc61b` |
| P3 (soft) | Suggest updating obsolete status-log example | (subsumed by P3 fix-now above) | Same commit `51cc61b` |

## Try

- **Add a lint/CI check for dangling Markdown links** in docs/. This retro surfaced two intentional forward links; a future unintentional one would be hard to notice. A quick `markdown-link-check` run on `docs/` in CI would catch broken links before they land. Defer as a follow-up issue.
- **Capture the "first fragment authored under new convention" annotation.** This retro is the first fragment to live under `docs/status.d/`. Worth noting in the fragment itself (done) so readers of the git log know the provenance. Not a process change, just a signal.

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? No new contradictions introduced. CLAUDE.md § 1 updated to mention fragments (consistent with the new convention). CLAUDE.md § 6.7 wording change ("before every story plan" → "at the start of each new planning session") is consistent with `docs/templates/maintenance-sub-loop.md` which was also updated. R16/R17/R18/R19 rows land in the same PR as the docs edits (§ 7 rule 10 satisfied).
- [x] If yes, reconciled in this PR? N/A — no contradictions.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| docs/status.d/ created + 28 fragments migrated | `docs/status.d/` | done (slice 2, commit `30860fe`) |
| docs/status.md slimmed to pointer | `docs/status.md` | done (slice 2, commit `30860fe`) |
| CLAUDE.md § 1 fragment mention | `CLAUDE.md` | done (slice 3, commit `850d15e`) |
| CLAUDE.md § 6.4.1 push + conflict-resolution protocol | `CLAUDE.md` | done (slice 3, commit `850d15e`) |
| CLAUDE.md § 6.7 parallel-aware wording | `CLAUDE.md` | done (slice 3, commit `850d15e`) |
| CLAUDE.md § 8 R16/R17/R18/R19 | `CLAUDE.md` | done (slice 3, commit `850d15e`) |
| docs/templates/maintenance-sub-loop.md sibling check + branch-rebase | `docs/templates/maintenance-sub-loop.md` | done (slice 3, commit `850d15e`) |
| README.md refresh trigger | `README.md` | done (slice 3, commit `850d15e`) |
| Phase-4 fix-now (README per-story log lines, sentinel schema doc, status-log example update) | `README.md`, `docs/status.d/README.md`, `CLAUDE.md` | done (Phase 4 refactor, commit `51cc61b`) |
| Add lint/CI check for dangling Markdown links | follow-up issue | open |
| Walk-every-prose-reference rule when a story changes a referenced file's role (soft R2 for docs surfaces) | future CLAUDE.md retro consideration | open |
