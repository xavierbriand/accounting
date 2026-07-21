# Story maint-30 retrospective

**PR:** [#247](https://github.com/xavierbriand/accounting/pull/247)  **Closed:** pending merge  **Closes issues:** [#244](https://github.com/xavierbriand/accounting/issues/244)

Doc-hygiene batch executing story-maint-29's two Try-funnel items ([#244](https://github.com/xavierbriand/accounting/issues/244)):
the plan template's Slice-plan comment now requires commit subjects quoted in
final, matcher-satisfying form, and the security checklist's Error-handling box
carves out invariant/programmer-error throws. Light lane, plan folded into the
PR body, no sonnet-implementer leg. 4 slices; 1 Phase-4 fix slice; 1 CI
round-trip.

## Keep

- **The Phase-4 review caught the story's own subject matter being wrong.**
  The whole point of this story was "stop authoring commit subjects from
  memory — check them against the matcher." The first draft of that very line
  was itself written from memory and conflated two distinct dod-check matchers:
  `checkCommitSubjects` (`buildStoryIdRegExp` → hard `missing-story-id`) and
  `PREP_COMMIT_SUBJECT` (literal `plan + P1/P2/P3 review` → envelope count).
  A paraphrased prep subject *passes* the gate the line named, and fails a
  different one. `code-reviewer` traced both call sites and produced the
  correction. A doc-hygiene story is exactly where a review leg looks
  skippable, and exactly where it paid.
- **Dogfooding the new rule inside the story that writes it.** All four
  subjects were verified against the live `buildStoryIdRegExp('maint-30')` via
  a `tsx -e` one-liner before committing — including the Phase-4 fix subject.
  Zero `missing-story-id` findings, against two consecutive prior stories that
  each ate a history rewrite. The check costs one command; the trap it
  replaces costs a `git reset --soft` + `--force-with-lease` cycle.

## Change

- **Two consecutive stories' Try items funneled to one issue produced one
  clean batch — but the batch's value was uneven.** The security-checklist
  carve-out was a five-minute uncontroversial edit; the template line needed a
  source trace through two harness modules and got the P1 finding. Batching by
  *file ownership* ("both are user-owned canon docs") rather than by *risk*
  meant the risky half rode in on the safe half's framing. The lane was still
  right (Light — docs-only), but the plan should have flagged which half had
  falsifiable claims about live code, so the review leg knew where to aim.
- **The R16 envelope was reachable only because Phase 4 produced a fix
  slice.** The canonical Light-lane shape landed at 3 counted body commits;
  dod-check's `R16: { min: 4, max: 4 }` cannot accept that, so the token stays
  undeclared and the story takes the advisory path — the third story in a row
  to do so (maint-27, h14, this one). The fix slice brought it to exactly 4,
  so R16 *is* declared here, but by accident of review outcome, not design.
  [#239](https://github.com/xavierbriand/accounting/issues/239)'s option (a)
  (recalibrate to min2/max3) now has three data points behind it.

## Try

- Re-run the maint-28 Change-C watch: that retro's Try said "if the prep-subject
  wording drift recurs, promote it from watch to an explicit line quoting R30's
  literal phrase." It recurred (as the P1 finding's guidance gap), and this PR
  executes that promotion — the literal `plan + P1/P2/P3 review` phrase is now
  quoted in the plan template itself. Same-PR edit:
  [docs/templates/plan-template.md](../templates/plan-template.md).
- When a Light-lane batch mixes a prose-only edit with one making falsifiable
  claims about live code, say so in the PR body's scenario section so the
  Phase-4 review aims at the second. Same-PR edit: this story's § 5 already
  splits scenarios A/B by artifact, but did not flag A as source-traceable —
  noted here rather than funneled, as it is authoring guidance, not a rule.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| R16 envelope range recalibration (three advisory-path stories now: maint-27, h14, maint-30) | [#239](https://github.com/xavierbriand/accounting/issues/239) | open |

No new § 8 rule minted. The subject-form discipline landed as template prose
(where it is read at authoring time) rather than as a loop-wide invariant —
consistent with maint-29's own judgment that this is story-shape guidance.

## Loop metrics (this run)

- **Plan phase:** maintenance sub-loop (drain: closes #244, net −1 open item) +
  plan folded into PR body (Light lane, R26); 0 open PRs at branch cut,
  `story-maint-30` verified free.
- **Phase 0/2:** skipped by lane (no model impact; no plan-reviewer /
  sibling-overlap — sibling risk nil at 0 open PRs).
- **Phase 3:** no sonnet-implementer leg — docs-only, coordinator-authored
  (h14 precedent). Phase 3's Sonnet leg is vacuous for a docs-only story
  rather than skipped: there is no implementation to delegate.
- **Phase 4:** `code-reviewer` (5 findings: 1 P1, 4 P3 all soft) → 2 fix-now
  (matcher conflation, bold placement), 1 PR-body fix (explicit R2 line),
  2 acknowledged (#239 R16 prose, Light-lane Phase-3 vacuity).
- **CI round-trips:** 1 (green on the 3-commit push; fix slice pushed after).
- **Session note:** the first `code-reviewer` invocation died on a session
  usage limit and was re-run verbatim after a model switch — no state lost,
  since the review leg is read-only and the branch was already pushed.
- **Issues closed by this story:** #244. **Opened:** none.
