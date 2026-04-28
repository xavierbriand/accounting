# docs/status.d — per-story status fragments

Each retrospective drops one fragment here instead of editing the log block in
[`docs/status.md`](../status.md). See [CLAUDE.md § 8 R17](../../CLAUDE.md) for the
authoritative rule.

## Fragment format

```markdown
---
date: 2026-04-28
story: B
pr: 82
epic: 2-followups
---

One paragraph (or more) of prose describing what shipped — verbatim from the author,
no post-hoc edits. Keep it as the single source of truth for that story's outcome.
```

Required frontmatter keys: `date` (ISO 8601 date), `story` (story id, e.g. `B`, `3.2`,
`maint-16`). Optional: `pr` (GitHub PR number), `epic` (epic id string).

## Filename convention

`<YYYY-MM-DD>-story-<id>.md` — the date prefix sorts fragments newest-first under
`ls -r docs/status.d/`.

Special sentinel for pre-status.d history: `0000-00-00-pre-history.md` (sorts to the
bottom under `ls -r`).

Examples:
- `2026-04-28-story-B.md`
- `2026-04-26-story-maint-15.md`
- `2026-04-26-story-3.2.md`
- `0000-00-00-pre-history.md`

## Why fragments instead of one log

Monolithic append-only log in `docs/status.md` caused mechanical merge conflicts when
two stories merged on the same day — both retros inserted a line at the top of the same
block. Splitting into one file per story eliminates the collision for different-story
retros; only an exact filename clash (same date + same story id) could produce a
conflict, and the [conflict-resolution protocol in CLAUDE.md § 6.4.1](../../CLAUDE.md)
covers that edge case. See
[docs/retrospectives/story-maint-16.md](../retrospectives/story-maint-16.md) for the
full decision context.
