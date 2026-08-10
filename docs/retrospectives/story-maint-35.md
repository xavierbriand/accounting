# Story maint-35 retrospective

**PR:** [#267](https://github.com/xavierbriand/accounting/pull/267)  **Closed:** pending merge

Light-lane fix: added the `docs/status.d/2026-08-10-story-maint-34.md` fragment that
story-maint-34's retrospective should have dropped at merge time but didn't.

## Keep

- Catching the gap immediately after merge, rather than letting it silently erode
  `docs/status.d/`'s completeness, kept the fix cheap — one file, no re-investigation needed.
- **Fixed the root cause same-PR instead of deferring it.** The Phase-4 `code-reviewer` run
  caught that this story's first draft repeated the exact mistake it exists to fix — its own
  retro commit didn't carry its own `docs/status.d/` fragment either — and separately flagged
  that the retro's original "Try" item deferred a fix to "next time CLAUDE.md... is touched,"
  which CLAUDE.md § 6.1 phase 5 explicitly forbids ("'next process-touching PR' is not a valid
  deferral"). Both are fixed in this PR: CLAUDE.md § 6.1 phase 5 now names the fragment as part
  of the retrospective's exit criteria, in the same commit as the retro file, and this
  retrospective's own fragment (`docs/status.d/2026-08-10-story-maint-35.md`) ships alongside it.

## Change

- CLAUDE.md § 6.1 phase 5 didn't explicitly name the `docs/status.d/` fragment as part of its
  exit criteria — only `docs/status.d/README.md`, one hop away, did. A story could satisfy
  "retrospective file committed" (DoD item 9) while still missing its fragment, which is exactly
  how story-maint-34 — and this story's own first draft — both happened. Fixed in this PR (see
  Keep, above).

## Try

- None outstanding — the one Try item from the original draft (fold the fragment requirement
  into phase 5's exit criteria) is done in this same PR rather than deferred.

## Action items

None — the fix landed in this PR.

No new § 8 rule minted — phase 5's exit-criteria wording changed, not a new numbered rule.
