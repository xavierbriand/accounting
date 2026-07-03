# Story-h7: dod-check enforcement tiers — non-blocking findings must not gate CI

Closes [#151](https://github.com/xavierbriand/accounting/issues/151) (dod-check non-story-PR regression).

## Context

**Why:** story-h6 (#149) shipped `harness/dod-check/` into CI, but its exit logic has only two tiers —
**hard** (always exit 1) and **advisory** (exit 1 when the PR is out of draft). Everything that isn't
hard falls into the draft-aware bucket, including findings that represent *"the check does not apply
here,"* not *"the author must fix something."* The result is a **CI regression on every non-story PR**:
a Dependabot bump or `chore(…)` PR (no story branch, no plan) produces a `story-id-unresolved` finding
which, once the PR is out of draft, hard-fails the `Run DoD checks` step. Dependabot PRs open
ready-for-review, so the next one goes red; the `docs/metrics/loop.csv` post-h6 regen chore is the
first to hit it. The README already promises `story-id-unresolved` is *"reported, never a crash"* — the
exit logic contradicts that.

Planning this surfaced a **sibling case**: the envelope also hard-fails a story with **fewer** commits
than the declared range (`count < min`). The envelope's purpose (§ 6.6 sizing, R13/R14/R16) is to stop
stories being *too big* — the **upper** bound is the real gate; a tightly-scoped 3–4-commit fix
(story-h2 shape, and story-h7 itself) is fine and should not be blocked. Left unfixed, story-h7 — a
small fix — would self-block on its own under-count.

**Fix:** a third enforcement tier, **always-advisory** (reported, never affects exit), for the findings
that mean "check inapplicable / within-guidance":

- `story-id-unresolved` (non-story PR),
- `commit-envelope` when the rule is **not declared** in the plan (`rule === null`),
- `commit-envelope` when the count is **below** the declared minimum (`count < min` — under-target).

The draft-aware gate keeps only the findings that flag a *real* problem at merge: `pr-tbd`, and
`commit-envelope` when the count is **over** the declared maximum (`count > max` — too big). Hard
findings (`missing-story-id`, `todo-comment`, `unmapped-scenario`, `orphan-step`) are unchanged.

Like story-h1…h6, this is a harness story **outside** the epics FR/NFR numbering — no FR coverage;
process tooling only.

### Maintenance sub-loop (§ 6.7) — run 2026-07-03 pre-planning

- **Sibling work check:** `gh pr list --state open` → none. No open issue/PR overlaps dod-check.
- **Story-id uniqueness:** `git ls-tree origin/main -- docs/plans docs/retrospectives docs/status.d`
  shows story-h1..h6 taken; no `story-h7`; no open PR branch carries it. → **story-h7**.
- **Working tree:** clean; `story-h7` worktree cut from `origin/main` @ `00474b2`.
- **Open issues / PRs:** 0 open PRs; the regression itself is filed as a new issue at Phase 2.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Proceed:** yes.

## Story

As the developer running this repo's agentic workflow, I want dod-check to hard-fail CI only on real
DoD violations — never on "this PR has no story" or "this story is smaller than the target" — so that
routine Dependabot / chore PRs and tightly-scoped fixes pass CI, while genuine defects and
over-target stories are still gated at the merge boundary.

## Alternatives considered

- **Make `story-id-unresolved` hard** (require every PR to reference a story) — rejected: the repo
  merges Dependabot/chore PRs routinely with no story (maintenance sub-loop); gating them is wrong.
- **Only fix `story-id-unresolved`, leave the envelope alone** — rejected: story-h7 itself (a small
  fix, count < R13 min 6) would then self-block on its own under-count. The under-count case is the
  same class of bug and must be fixed for the tool to be self-consistent.
- **Drop the envelope lower bound entirely** — rejected: keep it as reported guidance (advisory), just
  don't gate on it. The upper bound stays the gate (that is what § 6.6 sizing is about).
- **Reclassify at the report layer only** (suppress the finding) — rejected: the finding should still
  be *reported* (honesty); only its effect on the exit code changes.

## Selected solution

Add an `isAlwaysAdvisory(finding)` predicate and a third partition in `main()`'s exit computation.

- `isHardFinding` — unchanged (`HARD_KINDS`).
- `isAlwaysAdvisory(finding)` — a **top-level pure predicate** beside `isHardFinding` (directly unit-
  testable, not inline in `main()`): true for `story-id-unresolved`; and for `commit-envelope` when
  `rule === null` (not declared) **or** `count < min` (under-target). `min` is already carried on
  `CommitEnvelopeFinding`. (P3: extract, don't inline.)
- **draft-aware (soft-gate)** = everything else that isn't hard = `pr-tbd`, and `commit-envelope` with a
  declared rule and `count > max`.
- **Exit:** `hardCount > 0 || (softGateCount > 0 && !isDraft)`. Always-advisory findings never count.
- **Boundary correctness (P1):** `checkCommitEnvelope` already returns `null` (emits no finding) when
  `min <= count <= max`, and otherwise sets exactly one of `count<min`/`count>max` (never both, since
  `min <= max`) — so the three tiers partition cleanly. Classification unit tests must pin `min-1`
  (advisory), `min`/`max` (no finding), `max+1` (draft-aware) explicitly.
- **Labelling (P2 — three distinguishable human-report lines):**
  - over-max (draft-aware): `commit-envelope: 12 commits, over the R13 (6–10) envelope` (+
    `(advisory — PR is draft)` while draft, hard otherwise).
  - under-min (always-advisory): `commit-envelope: 3 commits, under the R13 (6–10) target (advisory)`.
  - not-declared (always-advisory): `commit-envelope: N commits, envelope not declared in plan (advisory)`.
- **Existing test to update:** `dod-check.integration.test.ts`'s "a commit count outside 6-10 does not
  fail while the PR is a draft" leg uses `count=1` (under-min) and asserts the old
  `(advisory — PR is draft)` label — it must be relabelled to the new always-advisory `(advisory)`
  form and its exit-0 assertion re-pointed to the **out-of-draft** case (under-min no longer needs draft
  to stay green).

No new finding *kinds* — the discriminated union is unchanged; only the exit classification and two
report labels change. `checkCommitEnvelope` still emits one `commit-envelope` finding carrying
`count`/`rule`/`min`/`max`; the tiering is derived from those fields in the entrypoint.

## Production-code surface (R2)

No `src/` files. No migrations. No product behaviour. Harness + docs only.

**Modified files:**

| File | Change |
| --- | --- |
| `harness/dod-check/dod-check.ts` | `isAlwaysAdvisory` predicate; three-way exit partition; two report labels |
| `harness/dod-check/tests/dod-check.integration.test.ts` | non-story-PR (exit 0 when ready) + under-count (exit 0) + over-count-still-hard regression legs |
| `harness/dod-check/tests/commit-subject.test.ts` or a new entrypoint-level unit test | classification unit coverage if the predicate is extracted as a pure helper |
| `harness/dod-check/README.md` | enforcement table: split `commit-envelope` into over-max (draft-aware) vs not-declared/under-min (always-advisory); `story-id-unresolved` → always-advisory; update the exit-code sentence |

**New files:**

| File | Purpose |
| --- | --- |
| `docs/plans/story-h7.md` | This plan (R1) |
| `docs/retrospectives/story-h7.md` | Phase 5 |
| `docs/status.d/2026-07-03-story-h7.md` | R17 fragment |

**Output formats (R2):** `--json` shape unchanged (`{ findings, degraded }`); the change is exit-code
classification + two human-report label strings.

## Acceptance scenarios

Harness tooling → harness vitest tests (in-process where the logic is pure; subprocess smoke for the
exit-code wiring — R7 noted per scenario).

**Scenario A — a non-story PR does not hard-fail when ready**
```gherkin
Given a temp repo on a non-story branch (no story- name, no plan file added)
When dod-check runs with the PR out of draft
Then story-id-unresolved is reported as (advisory) and exit code is 0
fails if: story-id-unresolved gates the exit code — the regression that broke Dependabot/chore PRs
(guards the always-advisory partition in dod-check.ts main(); subprocess smoke over a temp repo)
```

**Scenario B — an under-target story is advisory, an over-target story is gated**
```gherkin
Given a story branch whose plan declares R13 (6–10) and a commit count of 3 (under min)
When dod-check runs with the PR out of draft
Then the envelope finding is reported as (advisory) and exit code is 0
Given instead a commit count of 12 (over max)
When dod-check runs with the PR out of draft
Then the envelope finding is hard and exit code is 1
fails if: under-count blocks, or over-count stops blocking (guards the count<min vs count>max split;
in-process classification test + one subprocess smoke)
```

**Scenario C — real defects and not-declared envelopes are unchanged**
```gherkin
Given a commit subject missing the story id, and separately a plan with no declared envelope rule
When dod-check runs out of draft
Then missing-story-id is still hard (exit 1) and the not-declared envelope is (advisory, exit 0 on its own)
fails if: the hard tier regresses, or a not-declared envelope starts gating
(guards HARD_KINDS untouched + rule===null → always-advisory; in-process + subprocess smoke)
```

## Slice plan (R13: target 6–10 commits)

Preparatory (not counted, R16): **P0** `chore(docs): story-h7 plan + P1/P2/P3 review [story-h7]`

1. **C1:** `test(harness): always-advisory classification — failing [story-h7]`
2. **C2:** `feat(harness): always-advisory tier — story-id-unresolved + not-declared envelope — green [story-h7]`
3. **C3:** `test(harness): envelope under-min advisory vs over-max gated — failing [story-h7]`
4. **C4:** `feat(harness): split envelope under/over classification — green [story-h7]`
5. **C5:** `chore(harness): README enforcement tiers + non-story-PR integration regression [story-h7]`
6. **C6:** `chore(retro): story-h7 retrospective + status fragment [story-h7]`

**5 behaviour slices** (C1–C5; C6 retro and P0 prep excluded from the count). This sits **below** R13's
6 — which is exactly the under-target case this story makes advisory, so story-h7's own dod-check run
reports it as advisory and does **not** self-block. That reflexive pass is the story's own proof
(Scenario B, dogfooded). A `refactor(harness):` slice is Phase-4-conditional (R11).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| The under/over split is subtle — an off-by-one at `count === min`/`max` | Classification unit tests pin the boundaries (min-1, min, max, max+1) |
| story-h7 is small — envelope reports under-target advisory on its own PR | Intended and dogfooded (Scenario B); the fix makes it advisory, not hard |
| `loop.csv` post-h6 regen still pending | Deferred: it is a non-story chore that this fix unblocks; regenerate after h7 merges |

## Verification plan

1. `npm run test:harness` → green incl. new classification + regression tests.
2. Reflexive: on the `story-h7` branch, `npx tsx harness/dod-check/dod-check.ts` → the under-target
   envelope (5 < 6) is reported `(advisory)` and exit is **0** even out of draft.
3. Negative: a temp non-story repo out of draft → `story-id-unresolved (advisory)`, exit 0; an
   over-max temp repo out of draft → `commit-envelope` hard, exit 1.
4. `npm run lint && npm run build && npm test` → green (product tree untouched).
5. `npm run typecheck:harness`; `grep` for cross-tree imports → empty.
6. `npx tsx harness/drift-scan/drift-scan.ts` → exit 0 on this plan.

## DoR checklist

- [x] Phase 1 (plan) drafted
- [x] Phase 2 (plan-reviewer + sibling-overlap, parallel) — complete 2026-07-03; #151 filed;
      plan-reviewer 22 findings (13/15 rule-tags apply, design confirmed complete/non-overlapping) +
      sibling-overlap (no overlap); all tagged below
- [ ] Phase 3 (Sonnet implementation)
- [ ] Phase 4 (code review + refactor)
- [ ] Phase 5 (retrospective); merge gate with the user

## Suggestion log

Phase 2 run 2026-07-03: `plan-reviewer` (22 findings; design confirmed complete + non-overlapping;
13/15 rule-tags apply — R1/R2/R6/R7/R11/R12/R13/R16-convention/R17/R19/R21/R23 satisfied) +
`sibling-overlap` (no overlap; #151 not a duplicate; loop.csv correctly deferred). Pass-confirmations
not repeated.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Boundary tests (`min-1`/`min`/`max`/`max+1`) promised only in the risk table, not an acceptance criterion | adopted | Selected solution: explicit boundary-classification unit-test requirement added |
| P1 | R13 self-consistency (story tunes the rule that judges it) is transparent but a judgment call | acknowledged | Intentional + dogfooded (Scenario B); falsifiable — if the classification were wrong the story would hard-fail on itself. Accepted |
| P2 | Two always-advisory sub-cases (not-declared vs under-min) both render bare `(advisory)` — CI reader can't distinguish | adopted | Selected solution: three distinguishable label strings specified (over/under/not-declared) |
| P2 | Honesty — findings still reported, only exit changes | acknowledged | Explicitly designed so; Alternatives rejects report-layer suppression |
| P3 | Plan hedges whether `isAlwaysAdvisory` is a pure helper vs inline in `main()` | adopted | Committed: top-level pure predicate beside `isHardFinding`, directly unit-tested |
| P3 | R11 empty-refactor justification deferred | acknowledged | Justification authored at Phase 4 if the slot lands |
| P3 | CLAUDE.md § 8 jumps R21→R23 (no R22 row) | acknowledged | Pre-existing (R22 was an h1 `*(pending)*` candidate never codified); out of scope for h7, not introduced here |
| Sibling | loop.csv post-h6 regen must sequence after h7 (it's the PR that first hits the regression) | adopted | Risks table: deferred follow-up, regenerate after h7 merges |
| Sibling | #150 / #147 adjacent, independent | acknowledged | No file/logic contention; referenced, not absorbed |
