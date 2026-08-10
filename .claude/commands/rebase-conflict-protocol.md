WHEN_TO_USE: Load this when `git rebase origin/main` reports conflicts during the
push protocol (CLAUDE.md § 6.4.1) — before resolving anything by hand.

## Conflict-resolution protocol

When a rebase conflict appears, the agent's reply must include three sections:

1. **Diagnosis** — for each conflicted file: which hunks conflict, who introduced
   the competing change (`git log --oneline origin/main -- <file>` and the local
   commit), classification *mechanical* (independent edits to a shared structure)
   vs *semantic* (same lines edited for different reasons).
2. **Suggested resolutions** — at least two named options each with the concrete
   edit. For mechanical conflicts on append-style sections (e.g. CLAUDE.md § 8 rule
   table): "(a) keep both, stack chronologically (or by tag id)" / "(b) drop ours
   and re-author after rebase if upstream supersedes." For semantic conflicts: name
   the trade-off. `--ours`/`--theirs` only when one side is unambiguously stale.
3. **Recommendation + question** — one-sentence pick with reason; explicit ask
   before applying.

If the conflict is on `docs/status.d/<file>` (rare — only if two retros pick the
same `<date>-story-<id>` filename), the diagnosis must name that specifically and
the Suggested-resolutions section must offer at least: **(a) rename the local
fragment by appending `-b` to the story id** (e.g. `2026-04-28-story-B.md` →
`2026-04-28-story-B-b.md`) so both fragments coexist verbatim; or **(b) merge the
two fragment bodies into a single file** (rarely correct — only when the retros
documented the same outcome).
