# Story maint-34 retrospective

**PR:** [#263](https://github.com/xavierbriand/accounting/pull/263)  **Closed:** pending merge

Relocated CLAUDE.md's Conflict-resolution protocol (§ 6.4.1) into an on-demand
`.claude/commands/rebase-conflict-protocol.md` command, per a `/doctor` health-check run's
Check-4 (lazy-loading) proposal the user approved. Reduced lane, R16 zero-behaviour-change
collapse. Opened as `story-maint-32`; renumbered to `story-maint-34` mid-flight after a real
story-id collision surfaced at Phase 4 (see Change, below).

## Keep

- **The doctor-report-to-formal-PR pipeline works.** The change was fully specified and
  user-approved during the `/doctor` session itself (quoted verbatim in the doctor report, which
  doubled as the plan's evidence trail). Formalizing it afterward into the standard
  plan/commits/review/retro shape needed zero re-derivation of what to build — only the process
  scaffolding around an already-correct change. Same "Phase 3 collapses into Phase 1" precedent as
  story-maint-05/06/21/22/27, extended to a doctor-originated change.
- **Phase 4 caught two independent real problems a Phase-2-only pass would have missed.**
  `code-reviewer` caught a CI-failing drift-scan Check F gap (the new command wasn't registered in
  `docs/harness/control-inventory.md`) that Phase 2's `sibling-overlap`-only review has no
  mechanism to catch (it doesn't read the diff against the control inventory). The Phase-4
  `sibling-overlap` re-check caught the story-id collision — a Phase-2 check, run hours earlier,
  necessarily can't see a collision that hadn't happened yet. This is exactly why the lane table
  runs `sibling-overlap` at *both* Phase 2 and Phase 4, not just once.
- **The renumbering recovery held together.** `git reset --soft origin/main` + selective
  re-staging + `git mv` + content edits + `force-with-lease` push cleanly rebuilt a 4-commit R16
  sequence under a new id without losing any work, and without the interactive-rebase tooling this
  harness's own Bash tool disallows. Same "cherry-pick + amend" spirit as story-maint-29's subject
  fixup, just via reset+recommit instead of cherry-pick.

## Change

- **R23's point-in-time check is not enough under this repo's actual concurrency.** This story's
  id was claimed cleanly per R23 at Phase-1 time, then collided anyway — twice-removed, via a
  *different* story's mid-flight renumbering landing on the same id independently. The
  next-candidate id (`maint-33`) was *also* already claimed by another concurrent session by the
  time the collision was discovered. Three sessions effectively contended for ids in the same
  ~20-minute window. Filed as [#266](https://github.com/xavierbriand/accounting/issues/266) —
  R23 needs either a claim mechanism or a documented cheap-recovery playbook, not just a
  point-in-time scan.
- **The R30 canonical prep-commit phrasing has silently drifted across multiple stories.** This
  story's own first attempt used "plan + P2 review" instead of CLAUDE.md § 6.4's literal "plan +
  P1/P2/P3 review" — the same substitution three prior Reduced-lane stories (maint-22/24/25) made.
  `dod-check`'s exemption regex only recognizes the literal canonical form, so all four instances
  are mis-classified as ordinary change-body commits rather than R30-exempt prep commits. Filed as
  [#265](https://github.com/xavierbriand/accounting/issues/265) — either the regex should tolerate
  the phrasing actually in use, or the plan template should quote the exact canonical subject the
  way story-maint-29's Try item already did for slice-plan subjects (issue #244).
- **A doctor-originated story has no natural "Phase 1" moment to run the maintenance sub-loop
  before implementation.** Implementation happened first (inside `/doctor`, before any plan
  existed), so the sibling-work/story-id/npm-audit checks all ran retroactively, after the change
  was already made. It worked out fine here because the change was narrow and self-contained, but
  a larger doctor-approved change could paint the session into a corner (e.g. discovering a real
  sibling conflict only after the change is already applied and approved by the user). No action
  this story — noting the pattern for the next doctor-originated maintenance PR.

## Try

- Disposition the fix for [#265](https://github.com/xavierbriand/accounting/issues/265) (prep-commit
  regex) and [#266](https://github.com/xavierbriand/accounting/issues/266) (R23 concurrency) in a
  future harness story — both are scoped with concrete options, same "pick one in a harness story"
  shape as #239.
- Consider whether `/doctor`-originated changes should run the maintenance sub-loop's sibling-work
  and story-id checks *before* presenting the confirmation gate, not after — would have caught
  this story's eventual collision one step earlier (though not necessarily in time, given the
  collision's root cause happened in a fully separate session).

## Drift scan (mandatory)

- [x] Did this story introduce contradictions between CLAUDE.md and any `docs/` file? **No.** The
  only CLAUDE.md change is the § 6.4.1 pointer edit; the relocated content is unchanged in
  substance, just moved. `docs/harness/control-inventory.md` was updated in the same commit as the
  file it describes, so no drift window opened there either.
- [x] If yes, reconciled in this PR? N/A.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| dod-check prep-commit subject regex vs. established phrasing drift (4 stories) | [#265](https://github.com/xavierbriand/accounting/issues/265) | open |
| R23 story-id uniqueness — race window under concurrent sessions | [#266](https://github.com/xavierbriand/accounting/issues/266) | open |

No new § 8 rule minted — both lessons are tooling/process gaps with concrete fix options already
scoped in their issues, not loop-wide invariants ready to codify yet.
