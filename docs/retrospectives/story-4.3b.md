# Retrospective — story-4.3b

The `explain` CLI command (PR #210), second half of the 4.3 split: month-scoped settle-ritual
report over 4.3a's settlement-variance domain — CFO headline, side-by-side variance table,
follow-through, human + `--json` — plus the shared `settle-window.ts` helper, the widened
determinism property, and the R4 subprocess journey with a genuine read-only assertion.
Reduced lane, 10/10 slices (R28), 971 tests green. FR19 is now fully shipped.

## Keep

- **The intake-issue pattern made Phase-4 residue binding.** #208 (filed at 4.3a's Phase 4)
  arrived pre-triaged into this story's plan: items 1/2/4 shipped verifiably, item 3 deferred
  with a stated reason. No residue was re-litigated or silently dropped; the Phase-4
  sibling-overlap leg could confirm the mapping mechanically against the diff.
- **Agent-teammate resume for the fix round.** Phase-4 fixes went to the *same* implementer
  agent via message-resume (context intact): two crisp, correctly-scoped commits, no
  re-exploration cost. Better than a fresh fix agent or inline main-loop edits.
- **The review out-argued the implementer's own framing.** The synthetic-empty-lastMonth
  fallback was reported as "only reachable when last month fails"; the reviewer traced it
  firing on every happy-path run (a full variance diff computed and discarded). The fix —
  one domain call feeding both sections — came from the reviewer's suggested alternative.
- **Monitor-as-heartbeat.** Streaming each landed commit as an event gave real oversight of a
  40-minute background implementation without polling or context cost.

## Change

- **Verify the measurement before killing an agent.** Two healthy agents were killed on a
  stall diagnosis built on `stat`-ing the transcript *symlink* (192 bytes, constant) instead
  of the target file. The tell was ignored twice (identical "192 bytes" across different
  agents). Rule of thumb now embedded in the monitor's own warning text: before `TaskStop`
  on a suspected stall, confirm with `stat -L` **and** a second independent signal (tree
  changes, real transcript growth). A false kill costs a full re-run.
- **The registered `sonnet-implementer` agent type failed at launch 3× today** (first stall
  harness-verified: watchdog, zero streamed bytes). The CLAUDE.md § 6.3 fallback —
  `general-purpose` + inline spec + explicit Sonnet pin — worked on the first try and
  preserved the tier split. Failure signature logged to #166 (coordinator failure
  signatures); if launch failures recur across sessions, file a dedicated harness issue.
- **R6 discipline slipped in unit tests while the feature file stayed perfect** (16 missing
  `fails if` clauses across 5 files, caught at Phase 4). The clause habit is anchored to
  feature files; unit files drift. Candidate mechanical fix: a `test-smells`-family lint rule
  requiring a `fails if` comment per `it()` — noted under Try.

## Try

- **`fails-if` lint rule** in the `eslint-rules/test-smells/` family (warn tier first, per
  h7's advisory-entry lesson) — would have caught all 16 gaps at write time.
- **Session-timeline note in PR § 8 when agent runs fail:** the honest provenance paragraph
  (which agent ran, what failed, what the fallback was) took three sentences and answered
  every "why does the history look like this" question in advance. Make it standard when any
  Phase-3 run deviates from the registered agent path.

## Loop metrics

plan 118 LOC · diff (src+tests) 2017 LOC · weight ratio 0.06 · 10 slices (R28) at the R13
ceiling · 971 tests green (1 pre-existing justified skipIf) · 1 review agent + 1 overlap agent
per phase-2/4, 1 implementer (gp fallback, Sonnet-pinned), fix round via resume.

## Action items

| Item | Where | Status |
|---|---|---|
| #208 annotation: items 1/2/4 shipped, item 3 → next adapter-touching story | #208 | Done at DoD |
| sonnet-implementer launch-failure signature | #166 comment | Done at DoD |
| `fails-if` lint rule candidate | Try (above) — pick up with #206-family triage | Open idea |
| FR19 complete → status.md Next line advances to 4.4 / 4.5 | docs/status.md (this PR) | Done |
