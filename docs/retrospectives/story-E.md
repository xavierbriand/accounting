# Retrospective — story-E

The overdue ingest bug shipped (PR #236): a rule remembered mid-`ingest` now auto-tags every
later matching row of the same run — #93 Option B, closing #103 and (with story D's Option A
already shipped) #93 itself. Visit-time matching inside `runInteractiveLoop`, the manual-change
rewrite extracted into a shared `applyCategoryChange` helper so the auto and manual paths cannot
drift, `new RegExp(pattern, 'i')` identical to the next-invocation construction, forward-only
and first-rule-wins semantics unit-pinned, and — via Phase 4 — a crash guard for syntactically
invalid user-edited patterns. Reduced lane, 4 landed slices (under-target, advisory by design),
1218 tests green.

## Keep

- **Single-file scope held.** The plan's "only production file" constraint survived
  implementation and review untouched — the tightest story of the program, zero deviations
  reported.
- **Script-exhaustion as the proof mechanism.** `ScriptedPrompter`'s type-mismatch/exhaustion
  error made "no second prompt fired" a loud, structural assertion instead of a timing hope.
- **CodeQL as a fourth reviewer.** The `js/regex-injection` alert and the code-reviewer's
  independent finding converged on the same truth from different directions: the regex is the
  *feature* (user-authored, identical to config load), but the crash edge was real — the
  inquirer prompter validates patterns, `ScriptedPrompter` doesn't, so the harness itself could
  reach the throw.

## Change

- **Phase-4 fixes must not touch the worktree while the reviewer runs.** The reviewer flagged my
  in-progress guard as an uncommitted mid-review mutation (correctly — it reviewed the pushed
  diff and found the same gap independently). Discipline going forward: hold Phase-4 edits until
  the review lands, or work them on a scratch branch — the reviewed tree should be immutable
  during review.

## Try

- The `runInteractiveLoop` size concern (83 LOC) now has two data points with `categorize`'s
  #110 — annotated there for a shared prompt-loop extraction if picked up.
- No new § 8 rule minted.

## Loop metrics

plan ~140 LOC · 7 commits / 4 slices (R28; under R13's 6–10 target — dod-check confirms
under-target is advisory-only) · 1218 tests green · lint 0 errors · agents: sibling-overlap ×2,
sonnet-implementer (clean, zero deviations), code-reviewer · Phase-2: 2 findings (both
acknowledged) · Phase-4: 13 findings, **0 blockers** — headline: the reachable invalid-pattern
crash + the mid-review-mutation process catch · CodeQL: 1 high (`js/regex-injection`) —
assessed as intended behavior (user-authored regex, config-load parity), crash edge guarded,
dismissal presented at the merge gate · issues: #103 auto-closes at merge, #93 closed at DoD,
#110 annotated.

## Action items

| Item | Where | Status |
|---|---|---|
| Invalid-pattern crash guard + edge itemization | this PR (Phase-4 slice) | Done |
| #110 annotated with the second prompt-loop data point | #110 | Done |
| #93 closed at DoD (Options A + B both shipped) | #93 | At merge |
| CodeQL js/regex-injection dismissal decision | user, at the merge gate | Pending |
