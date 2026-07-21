# Story <id> — <title>

<!--
Plan template (CLAUDE.md § 6.1 phase 1; rides the R30 prep commit — formerly R1). Copy to docs/plans/story-<id>.md.
Referenced by .claude/commands/new-story-preflight.md step 3.
Sections follow the de-facto shape of recent plans (story-maint-18 onward);
the PR template's sections 1–6 are filled FROM these. Delete the comments as
you fill them.
-->

## Context

<!--
Why this story exists: the problem, what prompted it, the FR/NFR it targets
(or "No FR coverage" + rationale). Paste the completed maintenance sub-loop
checklist run (docs/templates/maintenance-sub-loop.md) — including the
story-id uniqueness check (R23).
-->

## Story

> As a <role>, I want <capability>, so that <outcome>.

## Domain model

<!--
R24. Either:
  - Link the Phase-0 model note: docs/domain/model-notes/story-<id>.md.
    List: glossary terms used/added, aggregates/value objects/domain services
    touched, invariants the diff must not violate, events emitted.
  - Or declare: `No model impact — <reason>` (maint/process/docs stories
    qualify by default).
-->

## Selected solution

<!-- What we're building and why it beats the alternatives. Name the alternatives set aside, one line each. -->

## Production-code surface (R2)

<!-- Enumerate type / signature / output-format changes. "None" + file list for docs/process stories. -->

## Gherkin acceptance scenarios

<!--
Given/When/Then per scenario; each scenario carries a `fails if …` clause
naming the production path it guards (R6) and an in-process vs subprocess
classification (R7). Composition-root subprocess test required when
program.ts is touched (R4).
-->

## Slice plan

<!--
One slice = one behaviour (R13: 6–10 commits; R14 adapter: 5–7; R16
zero-behaviour-change: 4 change-body). Subjects follow § 6.4 with the story
id in every subject (R12: summary verbs).
Quote subjects in their final, matcher-satisfying form and check them at plan
time against dod-check's two distinct matchers
(harness/dod-check/lib/commit-subject.ts) — they fail in different ways:
  - Every subject must match `buildStoryIdRegExp`
    (harness/lib/story-id-matcher.ts), i.e. contain `story-<id>`. A bare or
    superseded id fails the hard `missing-story-id` gate at CI
    (story-maint-28 Change A; story-maint-29).
  - The R30 prep subject must carry the literal phrase
    `plan + P1/P2/P3 review`. A paraphrase still carries the story id, so it
    passes the gate above and is silently counted as a body slice, inflating
    the envelope count instead (story-maint-28 Change C).
-->

## Risks & deferred items

<!-- Table: risk | mitigation. Deferred follow-ups each get a GitHub issue at Phase-2 tagging. -->

## Verification plan

<!-- How DoD is demonstrated: commands, expected exits, inspection steps. -->

## Suggestion log

<!-- Filled at Phase 2 (plan-reviewer + sibling-overlap in parallel). Every row tagged ADOPT / DEFER (issue link) / REJECT (reason) / ACKNOWLEDGE. -->

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| | | | |

## DoR checklist

- [ ] Phase 0 (Model): model note committed, or `No model impact` declared above (R24).
- [ ] Phase 1 (Plan): complete in this document.
- [ ] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): findings triaged above.
- [ ] Draft PR with template sections 1–6 filled.
