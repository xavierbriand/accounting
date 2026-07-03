# Story h8 — right-size the dev-loop gate: risk-based lanes + truthful weight metric

Issue [#160](https://github.com/xavierbriand/accounting/issues/160). Implements finding **F2** (+ part of **F7**) of [docs/learning/harness-health-check-2026-07-03.md](../learning/harness-health-check-2026-07-03.md). Scheduled before Epic 4 so later stories ship through leaner lanes.

## Context

The dev-loop applies one fixed ceremony floor to every story regardless of risk: full Phase 0–5, 4–6 sub-agent invocations, 11 plan sections, 10 PR sections, retro, status fragment, metrics row — the same for a 4-line change (maint-18) as for a Core money change. Two problems:

1. **No risk stratification.** Every story pays the full gate. The chartered fix (Module 3, #97) sat unshipped 65 days.
2. **The health metric lies.** `weight_ratio = plan_loc / diff_loc`, but `diff_loc` *includes* the ceremony (plan + retro + status fragment land in the same merge commit). So `weight_ratio` reports 0.38 / 0.64 ("healthy") when the true plan-vs-shipped ratio is 1.4:1 (h7) to 43:1 (maint-18) — structurally biased toward "healthy." The `>1.0` heuristic in [harness-engineering.md:81](../learning/harness-engineering.md) was never wired to anything. The `commits` column is dead (always 1 post-squash).

Outcome: three **risk-based lanes** in CLAUDE.md; a **truthful `diff_loc`** that excludes process artifacts; a **wired always-advisory dod-check trigger** when plan > shipped.

No FR coverage — this is harness/dev-loop tooling, not product behaviour.

### Maintenance sub-loop (§ 6.7) run 2026-07-03 pre-planning
- **Sibling work:** no open PRs. Open harness issues #161–#166 are the sequenced successors (h9 → post-Epic-4); none overlaps h8's scope. #97 is superseded-in-scope but **left untouched** (decision below).
- **Story-id uniqueness (R23):** `story-h8` free across `docs/plans/`, `docs/retrospectives/`, `docs/status.d/` on `origin/main`; no open PR branch holds it.
- **Working tree:** clean; branch `story-h8` cut from `origin/main` (`c0c7f06`).
- **Open issues / PRs:** no Dependabot PRs; deferred-suggestion backlog unchanged.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Proceed:** yes.

### Locked decisions (user-confirmed at planning)
- **#97:** do **not** close. No `Closes #97`, no label/edit — referenced in prose only. The tracker reset is reserved as story-h9's groomer acceptance test.
- **Reduced lane review pass:** keep **Phase 4 code-reviewer** (+ sibling-overlap for parallel-safety); drop the Phase 2 plan-reviewer.
- **Harness lane classification:** behavior-changing `harness/` code → **Reduced**; harness doc/spec-only → **Light**.
- **Lane bootstrapping:** lanes don't exist until this PR merges, so **h8 itself is planned under today's full process** (both review phases).

## Story

> As a dev-loop maintainer, I want stories routed into risk-based lanes and a weight metric that measures plan-vs-*shipped* code, so that low-risk changes stop paying the full-Core ceremony and the loop's health signal stops lying.

## Domain model

**No model impact** — harness tooling + process docs, no Core domain concept (R24; maint/process stories qualify by default).

## Selected solution

Three coordinated deliverables:

1. **Truthful weight metric.** A new single-source filter `harness/lib/process-artifacts.ts` (anticipates h10) excludes `docs/plans/`, `docs/retrospectives/`, `docs/status.d/` from `diff_loc`. `weight_ratio` keeps its `plan_loc / diff_loc` formula but now measures plan-vs-shipped; `>1.0` means "plan heavier than shipped." Drop the dead `commits` column.
2. **Wired always-advisory trigger.** A new dod-check `weight-ratio-heavy` finding fires when `planLoc > shippedLoc`, reusing the shared filter. Always-advisory — never gates CI (h7's "new checks enter advisory" lesson).
3. **Risk-based lanes** in CLAUDE.md § 6: Full / Reduced / Light, selected by risk surface, each fixing its Phase-0, review, commit-envelope, and plan-location shape. New R26 provenance row.

**Two hard constraints on the § 6 rewrite (from Phase-2 review):**
- **Additive, no renumbering.** Lanes enter as a new lane table + a short prose block at the head of § 6; the existing sub-section numbers (§ 6.1 phases, § 6.4 commits, § 6.6 sizing, § 6.7 maint) and the DoR/DoD phase-model wording ("phases 0–2 / 3–5") stay put. Six files cite those anchors — `docs/architecture.md`, `docs/engineering-standards.md`, `docs/quality-assurance.md`, `.claude/agents/ddd-modeler.md`, `.claude/agents/code-reviewer.md`, `.claude/agents/plan-reviewer.md`, plus `harness/dod-check/README.md` — and a read-only cross-reference audit of them is part of slice 5.
- **Lanes reuse existing envelope tags.** Full/Reduced → R13 (or R14 for adapter stories) exactly as today; Light → R16. **No new envelope tag** is minted, so `harness/dod-check/lib/commit-subject.ts`'s closed `EnvelopeRule['rule']` union (`'R13'|'R14'|'R16'`) and `ENVELOPE_TOKEN_PATTERN` are untouched. The lane only selects *which* existing tag a story declares.

*Alternatives set aside:* rename `diff_loc → shipped_loc` (rejected — breaks CSV consumers; issue #160 says keep the name, redefine); make the trigger a soft-gate (rejected — h7 established new checks enter advisory); LOC-based lane selection (rejected — issue mandates risk basis per #97's SPDD-delta); a new lane-specific envelope tag (rejected — see constraint above).

## Production-code surface (R2)

No product (`src/`) surface changes. Harness surface:
- **New module** `harness/lib/process-artifacts.ts`: exports `PROCESS_ARTIFACT_PREFIXES`, `isProcessArtifactPath(p)`, `sumShippedDiffLoc(numstatOutput)`.
- **`LoopRow` type** (`harness/metrics/lib/loop-metrics.ts`): drop `commits` field. `BuildLoopRowInput`: drop `commits`. `CSV_COLUMNS`: drop `commits`. Delete `countStoryCommits`.
- **CSV output format** (`docs/metrics/loop.csv`): 5 columns `story_id,plan_loc,diff_loc,weight_ratio,retro_loop_metrics` (was 6). `diff_loc` semantics change: shipped-only.
- **New module** `harness/dod-check/lib/weight-ratio.ts` (matches the one-check-one-lib-file convention of `commit-subject.ts` / `todo-tbd.ts` / `gherkin-map.ts`): exports the pure `WeightRatioHeavyFinding` type and a `checkWeightRatio(planLoc: number, shippedLoc: number): WeightRatioHeavyFinding | null` (returns `null` when `shippedLoc === 0` or `ratio ≤ 1.0`).
- **`DodFinding` union** (`harness/dod-check/dod-check.ts`): add `WeightRatioHeavyFinding = { kind: 'weight-ratio-heavy'; planLoc: number; shippedLoc: number; ratio: number }`. New `runWeightRatioCheck` + `checks['weight-ratio']`. `isAlwaysAdvisory` returns true for `'weight-ratio-heavy'`. New human-report line. When there is no plan file or `shippedLoc === 0`, the check pushes a `degraded` note and emits no finding (so `ratio` never needs a degraded representation in the type).

## Gherkin acceptance scenarios

Harness tooling has no `tests/features/*.feature` surface — acceptance is asserted via harness unit + integration tests (existing convention: `harness/metrics/tests/`, `harness/dod-check/tests/`). Scenarios below map to those tests, not quickpickle features. `program.ts` is untouched → R4 N/A.

**S1 — diff_loc excludes process artifacts** (unit, `harness/lib/tests/process-artifacts.test.ts`)
> Given numstat output mixing `src/core/money.ts` and `docs/plans/story-x.md`
> When `sumShippedDiffLoc` runs
> Then only the non-process paths are summed.
> *fails if* the path-field ([2]) filter in `sumShippedDiffLoc` is removed — the process lines would inflate the total. In-process.

**S2 — commits column dropped** (unit, `harness/metrics/tests/loop-metrics.test.ts`; integration subprocess)
> Given a set of loop rows
> When `formatCsv` emits the CSV
> Then the header is `story_id,plan_loc,diff_loc,weight_ratio,retro_loop_metrics` with no `commits`.
> *fails if* `commits` is re-added to `CSV_COLUMNS`/`LoopRow`. Unit in-process; integration subprocess via `npx tsx harness/metrics/loop-metrics.ts` (R7).

**S3 — weight-ratio-heavy advisory finding** (unit + integration, `harness/dod-check/tests/`)
> Given a story branch whose plan LOC exceeds shipped diff LOC
> When dod-check runs
> Then a `weight-ratio-heavy` finding is emitted, printed as advisory, and **exit code is 0**.
> *fails if* the finding is dropped from `isAlwaysAdvisory` (exit would flip to 1 out of draft) or `runWeightRatioCheck` is unregistered. Unit in-process for `isAlwaysAdvisory`; integration subprocess for exit code (R7).

**S4 — no finding when plan ≤ shipped** (integration)
> Given a plan LOC ≤ shipped diff LOC
> When dod-check runs
> Then no `weight-ratio-heavy` finding appears.
> *fails if* the `ratio > 1.0` guard is inverted or dropped. Subprocess.

## Slice plan

R13 (6–10 commits); h8 planned full-process. Prep commit `chore(docs): story-h8 plan + P1/P2/P3 review` authored before Phase 3 (not a body slice).

1. `test(metrics): diff_loc excludes process artifacts, commits column dropped — failing` (includes the `aa`-fixture content change)
2. `feat(metrics): shared process-artifact filter + shipped-only diff_loc, drop commits column — minimal green` (regenerate `docs/metrics/loop.csv`)
3. `test(dod-check): weight-ratio-heavy advisory finding — failing`
4. `feat(dod-check): weight-ratio always-advisory check wired — minimal green`
5. `docs(workflow): CLAUDE.md risk-based lanes + R26 + maint-01/18 retro comparison` (includes the read-only § 6 cross-ref audit; fill the Retroactive-comparison section below with real numbers)
6. `refactor(metrics): collapse buildLoopRow's three duplicated row-return blocks into a helper` (real content — the Phase-2 soft suggestion; falls back to empty-w/-justification per R11 only if it doesn't cleanly reduce)
7. `chore(retro): story-h8 retrospective + status fragment`

Drift-scan (R21) note: the § 8 R26 row is `table-only` drift until the slice-7 retro references `R26`. Run `drift-scan` **after slice 7**; if an interim run is needed between slices 5 and 7, mark the row `*(pending)*` per R21's opt-out.

## Risks & deferred items

| Risk | Mitigation |
|---|---|
| `diff_loc` semantic change silently confuses CSV readers | Column comment in `loop-metrics.ts` + note in retro Loop-metrics section; `weight_ratio` interpretation documented in CLAUDE.md § 3-adjacent metric note |
| Rename/binary numstat rows mis-parsed by prefix filter | `sumShippedDiffLoc` keeps `Number.isFinite` tolerance; renames within process dirs are rare and non-critical for a health heuristic |
| Light-lane stories have no plan file → ratio check can't compute | Check emits nothing + a `degraded` note when no plan file / `shippedLoc===0`; heuristic targets file-plan lanes |
| **Integration-test fixture flips to a skip (Phase-2 finding).** The `aa` fixture in `loop-metrics.integration.test.ts` commits only `docs/plans/story-aa.md`; once `diff_loc` excludes that dir, `aa`'s diff_loc → 0 and `buildLoopRow`'s zero-diff branch turns it into a **skipped** row (`n/a` + `skips[]`), not the current included `aa,5,5,1,1,true` row | Slice 2 must **change fixture content**, not just header assertions: add a shipped (non-process, e.g. `src/…`) file to the `aa` commit so a happy-path numeric row still exists, and keep `bb` as the unresolved-skip control. This is a deliberate fixture edit, tracked in slice 2 |
| **CLAUDE.md § 6 cross-references break if renumbered (Phase-2 finding).** 6+ files cite § 6.1/6.4/6.6/6.7 anchors | Additive rewrite only (see Selected-solution constraint); slice 5 includes a read-only grep audit of the citing files, expecting **zero** edits |
| **Forgetting the `isAlwaysAdvisory` branch fails silently** — an unmatched `kind` defaults to the draft-aware soft-gate bucket (advisory in draft, hard once ready), not advisory | S3 integration test asserts **exit 0** out of draft, which only passes when the branch is present — turns the silent gap into a loud failure |

Deferred follow-ups (if any) get a GitHub issue at Phase-2 tagging. **None deferred** — all Phase-2 findings adopted or acknowledged (see Suggestion log).

## Retroactive comparison (maint-01 / maint-18) — issue #160 item 4

Demonstrates the metric fix by recomputing `weight_ratio` under shipped-only `diff_loc`. Numbers filled in slice 5 from `git show --numstat <merge-sha>` on each story's squashed merge commit (old `diff_loc` = all paths; new `diff_loc` = non-process paths only).

| Story | plan_loc | old diff_loc (all) | old weight_ratio | new diff_loc (shipped) | new weight_ratio | crosses 1.0? |
|---|---|---|---|---|---|---|
| maint-01 | 276 | 395 | 0.70 | 59 | 4.68 | **yes** |
| maint-18 | 104 | 163 | 0.64 | 4 | 26.00 | **yes** |

Computed from each story's squashed merge commit on `origin/main` (`git show --numstat <sha>`), filtered through the same `sumShippedDiffLoc`/`isProcessArtifactPath` logic landed in slice 2: maint-01 = `1e269b7`, maint-18 = `bdf9198`. `plan_loc` cross-checked via `git show <sha>:docs/plans/story-<id>.md | wc -l`.

Narrative confirmed: maint-18 (a 4-line `src`/`.claude`-adjacent change wrapped in ~159 lines of plan/retro/status-fragment ceremony) reported "healthy" at 0.64 under the old all-paths `diff_loc`; under shipped-only measurement it flips to 26.00 — correctly flagging an over-heavy gate. maint-01 (a `tsconfig.test.json` + small test-file fix wrapped in a 276-line plan and 60-line retro) shows the same direction: 0.70 → 4.68. Both stories cross the `>1.0` threshold that the new `weight-ratio-heavy` dod-check trigger (slice 3/4) now wires to an always-advisory finding.

## Verification plan

- `npm run lint && npm run build && npm test` — green.
- `npm run metrics:loop` → `docs/metrics/loop.csv` has the 5-column header (no `commits`); maint-18's `weight_ratio` now `> 1.0`; stderr top-3 recompute against shipped-only LOC.
- dod-check integration: large-plan / tiny-diff fixture emits `weight-ratio-heavy` as advisory with **exit 0**; plan ≤ shipped emits nothing.
- `npx tsx harness/drift-scan/drift-scan.ts` — green after the § 8 R26 row.

## Suggestion log

<!-- Filled at Phase 2 (plan-reviewer + sibling-overlap in parallel). Every row tagged ADOPT / DEFER (issue link) / REJECT (reason) / ACKNOWLEDGE. -->

Sources: `plan-reviewer` (P1×10 / P2×2 / P3×10 = 22) + `sibling-overlap` (3 coordination notes). Confirmations/N-A findings collapsed into ACKNOWLEDGE rows.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | Integration `aa` fixture flips to a skip once `docs/plans/` is excluded — fixture-content change, not header-only | **ADOPT** | Slice 2 adds a shipped file to the `aa` commit; Risks row + slice note added |
| 2 | CLAUDE.md § 6 rewrite risks breaking 6+ external § 6.x cross-references | **ADOPT** | Additive-no-renumber constraint + read-only cross-ref audit added to Selected solution & slice 5 |
| 3 | `EnvelopeRule['rule']` is a closed `R13\|R14\|R16` union — a new lane tag would silently null-out `parseEnvelopeRule` | **ADOPT** | Lanes reuse existing tags verbatim; constraint documented; `commit-subject.ts` untouched |
| 4 | Weight-ratio logic bypasses one-check-one-lib-file convention | **ADOPT** | New `harness/dod-check/lib/weight-ratio.ts` with pure `checkWeightRatio`; added to surface + files |
| 5 | Retroactive maint-01/maint-18 comparison must live in the plan doc; maint-01 unmentioned | **ADOPT** | Added "Retroactive comparison" section (table filled in slice 5) |
| 6 | `buildLoopRow` has three duplicated return blocks — collapse opportunity in slice 2/6 | **ADOPT** | Slice 6 retitled to the concrete refactor (helper extraction) |
| 7 | Drift-scan Check A: R26 row is `table-only` until the retro cites it | **ADOPT** | Slice ordering note: run drift-scan after slice 7; `*(pending)*` marker for interim runs |
| 8 | `WeightRatioHeavyFinding` field types left as shorthand | **ADOPT** | Typed `planLoc/shippedLoc/ratio: number` in surface; degraded case emits no finding |
| 9 | S3 `fails if` combines two failure modes in one clause | **ACKNOWLEDGE** | Mechanism note already splits unit(isAlwaysAdvisory)/subprocess(exit); wording left, semantics correct |
| 10 | `isAlwaysAdvisory` unmatched-kind defaults to soft-gate (silent) | **ACKNOWLEDGE** | Risks row added; S3 exit-0 assertion converts the gap to a loud failure |
| 11 | Issue #160 body says "closes #97"; plan says do-not-close | **ACKNOWLEDGE** | Deliberate user override (Locked decisions); #97 stays open for h9 groomer |
| 12 | sibling-overlap: h11 (#163) shares `dod-check.ts` + F7/loop.csv surface | **ACKNOWLEDGE** | No open PR; h11 must build on h8's merged 5-column CSV + `isAlwaysAdvisory` shape — noted for h11 planning |
| 13 | sibling-overlap: h10 (#162) row-driven walk must inherit R26; `process-artifacts.ts` anticipates it | **ACKNOWLEDGE** | Keep R26 drift-clean (finding 7); shared filter intentionally single-source |
| 14 | P2 QA / R8 mock-diversity not walked | **REJECT** | Out of scope — no product (`src/`) surface, no user-facing structured output; QA doc scopes both to product |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): 22 + 3 findings triaged in the Suggestion log (8 ADOPT, 5 ACKNOWLEDGE, 1 REJECT, 0 DEFER).
- [ ] Draft PR with template sections 1–6 filled.
