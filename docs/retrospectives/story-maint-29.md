# Story maint-29 retrospective

**PR:** [#243](https://github.com/xavierbriand/accounting/pull/243)  **Closed:** pending merge  **Closes issues:** [#209](https://github.com/xavierbriand/accounting/issues/209), [#241](https://github.com/xavierbriand/accounting/issues/241), [#228](https://github.com/xavierbriand/accounting/issues/228)

First enforcement story spun directly out of a whole-project critical review
([docs/reviews/2026-07-20-critical-project-review.md](../reviews/2026-07-20-critical-project-review.md)).
Converted the repo's two convention-only trust claims into CI gates: the 100%-branch
coverage claim on `src/core/` (which the pre-planning probe measured at **88.44%**,
not 100 — 43 uncovered branches) and the layer-dependency rule (now a dynamic
`no-restricted-imports` config in `eslint-rules/boundary/`). All 43 gaps closed:
35 real tests, 8 `/* v8 ignore next */` annotations each carrying a why-comment
naming the invariant that makes its guard unreachable. Full lane; 8 slices shipped
(7 planned + 1 Phase-4 fix slice), Sonnet Phase 3, ~2 CI round-trips.

## Keep

- **Probe before planning.** Running `@vitest/coverage-v8` against the real suite
  *before* writing the plan converted the story from "wire a tool" (the #209 framing)
  to "close a measured 43-branch gap" — with the exact per-file, per-line branch list
  embedded in the plan. Sonnet's leg needed zero discovery; every deviation it
  reported was a *classification* judgment, not a surprise.
- **Phase-2 review caught a real design hole, then Phase-4 caught its sibling.**
  plan-reviewer P3-1 killed the static blocklist (missed 6 of the day's runtime
  deps); code-reviewer P3-1 then caught that the dynamic version read
  `dependencies` only, leaving devDependency imports (`fast-check`, `vitest`)
  unblocked. Two review legs, same failure family, both fixed — the layered-review
  design worked exactly as intended on this story.
- **The gate caught its own author within one CI run.** dod-check's hard
  `missing-story-id` failed the first CI run because the plan authored slice
  subjects with the bare id (`maint-29`) instead of the canonical `story-maint-29`
  form. The deterministic gate turned a coordinator error into a 10-minute
  mechanical fix (8 subjects reworded via cherry-pick + amend, tree byte-identical)
  instead of a silently mis-enveloped story.

## Change

- **A. Plan-authored commit subjects must be written against
  `harness/lib/story-id-matcher.ts`'s actual pattern, not from memory.**
  [story-maint-28's retro](story-maint-28.md) (Change B/C) already documented that
  dod-check matches the current story id against every subject with no tolerance —
  and this plan still authored non-matching subjects, just via a different variant
  (bare id vs the superseded-id and paraphrased-prep variants maint-28 hit). Three
  variants of the same trap across two consecutive maintenance stories is a
  pattern: the slice-plan section should quote subjects in their final,
  matcher-satisfying form, checked against the regex at plan time.
- **B. The "structurally unreachable" estimate in the plan was off by 2×**
  (~13–18 estimated, 8 actual): several guards that *look* unreachable are drivable
  through the established `as unknown as X` fake-collaborator idiom, and three
  others are unreachable for a subtler reason than the plan's rule anticipated (an
  equivalent earlier same-function currency check). The pre-specified decision rule
  ("drivable by a fake → test, not annotation") absorbed the drift without
  re-planning — write that rule into any future coverage story; skip the count
  estimate.

## Try

- Add a one-line check to the plan template's Slice-plan comment: "subjects must
  match `buildStoryIdRegExp` — quote them final-form" — same-PR edit was considered
  but the template is user-owned canon riding many stories; funneled instead as
  [#244](https://github.com/xavierbriand/accounting/issues/244).
- The `result.ts` misuse-throws vs security-checklist "no thrown exceptions inside
  Core" tension (code-reviewer P3-3) is pre-existing, now visible in test
  assertions. Documented here for the next security-checklist touch: the checklist
  line should carve out invariant/programmer-error guards explicitly. Funneled into
  [#244](https://github.com/xavierbriand/accounting/issues/244) alongside the
  template line (same doc-hygiene batch).

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Template line quoting the story-id matcher requirement + security-checklist carve-out for invariant throws | [#244](https://github.com/xavierbriand/accounting/issues/244) | open |
| Infra/cli coverage-threshold ratchet once a CI baseline accrues | [#242](https://github.com/xavierbriand/accounting/issues/242) | open |

No new § 8 rule minted — both candidate lessons (subject-form checking, annotation
classification rule) are story-shape guidance funneled to #244, not loop-wide
invariants.

## Loop metrics (this run)

- **Plan phase:** maintenance sub-loop (drain: #228 absorbed, net −3 open items) +
  coverage probe + plan with embedded 43-branch enumeration.
- **Phase 2:** plan-reviewer (13 findings: 10 adopted, 2 acknowledged, 1 deferred →
  #242) + sibling-overlap (clean) in parallel.
- **Phase 3:** sonnet-implementer, single round, 8 commits, 2 honest deviations
  (slice-2 relabel, annotation reclassification) + 1 pre-existing test bug fixed
  (mis-targeted `lteCapResult` fixture).
- **Phase 4:** code-reviewer (6 findings: 2 P1, 4 P3 of which 3 soft) → 3 fix-now
  (devDeps blocklist, infra clean-pass fixture, comma), 3 acknowledged.
- **CI round-trips:** 2 (1st red: dod-check missing-story-id on all 8 subjects;
  2nd expected green after reword + Phase-4 fix slice).
- **Issues closed by this story:** #209, #241, #228 (via merge). **Opened:** #242
  (deferred ratchet), #244 (Try funnel).
