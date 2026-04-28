# Story maint-16 retrospective

**PR:** https://github.com/xavierbriand/accounting/pull/85  **Closed:** 2026-04-28

## Keep

- **Fragment migration was mechanical and clean.** 27 dated entries + 1 pre-history sentinel produced 29 files with zero ambiguity — each entry from the original log mapped 1:1 to a fragment. The plan's exact spec for frontmatter keys and filename convention left no judgment calls for the implementer.
- **R16 envelope (4 change-body commits) fit naturally.** The two substantial slices (migration + CLAUDE.md process edits) mapped cleanly to two body commits; the empty refactor slot required no justification beyond R11; the retro commit is own dogfood. No pressure to split or merge.
- **plan-reviewer adoption rate was high (9/14 findings adopted).** The P1/P2/P3 review cycle caught real gaps before implementation: ambiguous `wc -l` threshold (now an equality check), missing non-conflict rebase failure branch, under-specified README.md content, unclear heading retention. All landed as tighter prose in the plan. Worth the round-trip.
- **The migration-ordering-loss caveat is genuinely acceptable.** Intra-day ordering in the original log (e.g. 2026-04-26: 3.2 then maint-15 then maint-14) is not preserved under `ls -r`, but no reader queries the log at sub-day resolution. Documented in the commit body; no workaround needed.

## Change

- **Forward-link to the retro in the README.md spec** caused a minor chicken-and-egg: the plan's README.md content spec references `story-maint-16.md` (this file, authored in slice 5), while the README was created in slice 2. The forward link is correct in the final state but the README was committed before the retro file existed. No functional impact — the links all resolve once slice 5 lands — but a reviewer reading the repo mid-implementation would see a dangling link. Accept for now; future plans should note when a forward-link is a deliberate forward-reference rather than an error.
- **`docs/status.d/README.md` "Why fragments" section** references the retro as a forward link (the file is created in slice 2 but the retro lands in slice 5). Same chicken-and-egg as above. The forward-link pattern is safe in a linear branch but could confuse a mid-story checkout. Worth noting in any template that uses forward links.

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
| Add lint/CI check for dangling Markdown links | follow-up issue | open |
