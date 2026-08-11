# Story maint-38 — Ratchet coverage thresholds for src/infra and src/cli

## Context

Originated from [#242](https://github.com/xavierbriand/accounting/issues/242) (deferred at
story-maint-29's Phase-2 plan review — P3 finding: "Infra/cli coverage now measured but
ungated"). story-maint-29 wired `@vitest/coverage-v8` with a hard `branches: 100` threshold
scoped to `src/core/**` only; infra/cli coverage became *measured* (included in the report) but
carried no threshold, so a regression there was silent. #242 proposed a follow-up once "a few
weeks of CI history" existed to read a real baseline instead of picking numbers arbitrarily.

**No model impact** — pure test/build-tooling config change (`vitest.config.ts`), no Core domain
concept touched (R24 default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, 2026-08-11.**

- **Sibling work check:** `gh pr list --state open` → #272 (dev-dependencies group bump), #273
  (csv-parse bump) — both `package.json`/`package-lock.json` only, no overlap. `gh issue list
  --state open` grepped for coverage/threshold/242 → only #242 itself. No sibling story targets
  this surface.
- **Story-id uniqueness (R23):** `story-maint-38` confirmed free — no match in
  `git ls-tree -r origin/main -- docs/plans/ docs/retrospectives/ docs/status.d/` and no open PR
  branch name collides.
- **Working tree clean:** yes. Session was already on a harness-assigned branch
  (`claude/refine-backlog-88be54`, at parity with `origin/main`'s `9a60b85`); renamed in place to
  `story-maint-38` per the preflight's session-branch precedent (story-ddd-1).
- **Backlog refinement:** a full `/refine-backlog` run happened earlier in this session (not
  re-run here). It closed [#165](https://github.com/xavierbriand/accounting/issues/165) (delivered,
  never closed), filed [#274](https://github.com/xavierbriand/accounting/issues/274) (#111 residue)
  and [#275](https://github.com/xavierbriand/accounting/issues/275) (batch re-triage tracking),
  fixed #94's Module 7 checkbox drift, applied 12 missing labels, and reprioritized #242 itself
  (comment noting its tripwire had fired) — this story is that reprioritization's follow-through.
- **Drain:** satisfied by the same `/refine-backlog` run this session (#165 closed + 12 label
  fixes + 2 new tracking issues) — not re-drained here to avoid double-counting.
- **`npm audit --audit-level=high`:** 4 high-severity transitive findings (brace-expansion,
  js-yaml, nanoid, postcss) — pre-existing, tracked by
  [#261](https://github.com/xavierbriand/accounting/issues/261)/[#262](https://github.com/xavierbriand/accounting/issues/262),
  confirmed unchanged (matches story-maint-33's retro note). Unrelated to this story's surface
  (`vitest.config.ts` only) — not fixed here.
- **Proceed-to-planning.**

**Lane: Reduced** (R26) — infra-only surface (`vitest.config.ts`, the test/build config), no
`src/core/` or DB-schema change. Phase 0 skipped per the no-model-impact declaration above.

## Story

> As a maintainer, I want CI to enforce a coverage floor on `src/infra` and the in-process-tested
> slice of `src/cli`, so that a coverage regression there is caught automatically instead of
> silently drifting — mirroring the `src/core` gate story-maint-29 already shipped, per #242.

## Domain model

No model impact — maintenance/config story, no Core domain concept touched (R24 default).

## Selected solution

**Option A — chosen.** Add three new `coverage.thresholds` glob entries in `vitest.config.ts`,
each a `branches`-only floor set ~5 points below the exact 2026-08-11 measured baseline (captured
via `vitest run --coverage`, one run with placeholder `branches: 100` thresholds to force vitest
to report the exact miss percentage per glob):

| Glob | Measured baseline | Floor (baseline − 5, rounded down) |
| --- | --- | --- |
| `src/infra/**` | 83.23% | 78% |
| `src/cli/commands/**` | 89.66% | 84% |
| `src/cli/utils/**` | 78.94% | 73% |

`src/cli/*.ts` composition-root files (`program.ts`, `migrate.ts`, the `ledger-command.ts`
wrapper) are **deliberately excluded** from the CLI glob — they read 0% under v8 instrumentation
because they're validated by the mandatory subprocess test (R4/R7) instead, which v8's in-process
coverage collector can't observe. A bare `src/cli/**` glob would be diluted by that 0% down to a
near-meaningless floor.

**Option B — single `src/cli/**` aggregate glob.** Rejected. Confirmed by measurement: including
the composition-root files in the same glob as `cli/commands` + `cli/utils` collapses the
meaningful ~85% signal down to a floor that gates almost nothing.

**Option C — move composition-root files into `coverage.exclude` instead of scoping the threshold
glob.** Rejected. `coverage.exclude` drops files from the *report* as well as the gate — we want
to keep reporting their (expected) 0% for visibility, just not gate CI on it. Scoping the
threshold glob to the two subdirectories achieves that without touching `coverage.include`/
`coverage.exclude`.

**Option D — exact baseline, zero margin.** Rejected (user decision, this session) — a 5-point
margin absorbs normal test-run variance without being loose enough to mask a real regression.

## Production-code surface (R2)

None. Pure test/build-tooling config change (`vitest.config.ts` `coverage.thresholds` block). No
`src/` type, signature, or output-format changes.

## Verification (pseudo-Gherkin, not automatable)

No `.feature` files — this is a CI-config change with no CLI-observable runtime behavior, same
shape as story-maint-27/h14/maint-34. Fenced as ` ```text ` rather than ` ```gherkin ` deliberately
(issue #198 — drift-scan's Gherkin↔step hard gate treats any ` ```gherkin ` block as scenarios
needing real `.feature`/step-definition backing).

```text
Feature: infra/cli coverage floor is CI-enforced instead of silently ungated

  Scenario: infra coverage floor is set from measured baseline
    Given src/infra/** measured 83.23% branch coverage on 2026-08-11
    When vitest.config.ts's coverage.thresholds gains a 'src/infra/**' entry
    Then its branches value is a few points below 83.23%, not an arbitrary number
    And `npm run test:coverage` passes at the current infra coverage level

  Scenario: cli floor excludes the subprocess-tested composition root
    Given program.ts / migrate.ts / ledger-command.ts read 0% under v8 instrumentation
      (validated instead by the mandatory subprocess test, R4/R7)
    When the cli threshold globs are added
    Then they scope to 'src/cli/commands/**' and 'src/cli/utils/**' only
    And a bare 'src/cli/**' glob is not used

  Scenario: a real infra/cli coverage regression now fails CI
    Given the new thresholds are in place
    When a future change drops src/infra/** or src/cli/{commands,utils}/** branch coverage below
      its floor
    Then `npm run test:coverage` (and CI's equivalent step) exits non-zero
    fails if: a genuine coverage drop below the configured floor — verified by manually raising
      one threshold above its real value and confirming a non-zero exit + an ERROR line (see
      Scenario 3's mechanism row). Correction from the original draft (Phase-4 code-reviewer
      finding, R6): vitest's checkThresholds prints nothing on a passing threshold and a glob
      matching zero files reports 100% (istanbul-lib-coverage's `percent(0,0) === 100`) — so a
      typo'd/renamed glob path would silently pass forever, not fail loudly or print "threshold
      not found." This is a pre-existing property of the mechanism (applies equally to the
      existing `src/core/**` threshold since story-maint-29), not something this story's globs
      introduce or can self-guard against at the config level. Tracked as a follow-up: #277.
```

| Scenario | Verification mechanism (not a new test file) |
| --- | --- |
| 1 — infra floor from baseline | `npm run test:coverage` local run, 2026-08-11: `Coverage for branches (83.23%) does not meet "src/infra/**" threshold (100%)` against a placeholder 100% threshold — confirms the exact baseline number used to derive the 78% floor. After landing the real 78% value, the same command exits 0 with no `src/infra/**` ERROR line. |
| 2 — cli floor excludes composition root | `git diff vitest.config.ts` glob keys: `'src/cli/commands/**'` and `'src/cli/utils/**'` present, no bare `'src/cli/**'` key added. `find src/cli -type f -name '*.ts'` confirms the only files outside those two subdirectories are the three named composition-root files (`program.ts`, `migrate.ts`, `ledger-command.ts`), which report 0% statements/branches in the coverage table (subprocess-tested per R4/R7, not v8-instrumented). |
| 3 — regression now fails CI | Manual demonstration performed 2026-08-11: temporarily raised `'src/cli/utils/**'` to `branches: 95`, ran `npm run test:coverage`, got `ERROR: Coverage for branches (78.94%) does not meet "src/cli/utils/**" threshold (95%)` (non-zero exit), then reverted to the real `73` value (not committed) before landing the real config. |

## Slice plan — R16 zero-behaviour-change collapse

Per CLAUDE.md § 8 R16: no `src/core`/`src/infra`/`src/cli` production-code logic changes, purely
CI-config — collapses to 4 change-body commits (2 change commits + empty refactor + retro),
matching the story-maint-34 precedent for a config-only Reduced-lane story.

1. `chore(docs): story-maint-38 plan + P1/P2/P3 review (story-maint-38)` — this plan doc.
   *(prep commit, uncounted per R30)*
2. `chore(vitest): add src/infra coverage ratchet floor from measured baseline (story-maint-38)`
   — `'src/infra/**': { branches: 78 }`.
3. `chore(vitest): add src/cli commands+utils coverage ratchet floor, exclude composition root
   (story-maint-38)` — `'src/cli/commands/**': { branches: 84 }`,
   `'src/cli/utils/**': { branches: 73 }`, plus the rationale comment explaining the
   composition-root exclusion.
4. `refactor: empty slot — nothing further to extract (story-maint-38)` — no-op; a 3-entry
   threshold-glob addition has no extractable structure.
5. `chore(retro): story-maint-38 retrospective (story-maint-38)`.

Squash on merge optional.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Baseline drifts between plan-time measurement (2026-08-11) and merge if sibling PRs land infra/cli test changes first | Re-run `npm run test:coverage` immediately before the implementation commit lands; adjust the two floor numbers if the measured baseline moved (unlikely given the two open sibling PRs are dependabot-only). |
| Composition-root files stay permanently coverage-gate-blind under this design | Accepted by design (Option A) — they're covered by the mandatory subprocess test (R4/R7) instead; not a gap this story is meant to close. |
| 5-point margin could still be too tight for infra/csv or infra/fs subfiles that individually sit near the floor (e.g. `read-bpce-csv.ts` at 50% branch) | Threshold is aggregate-per-glob, not per-file, so individual low-coverage files are absorbed by the group average — same model as the existing `src/core/**` gate. If this proves too coarse in practice, a per-file threshold is a future follow-up, not blocking here. |
| `coverage.thresholds` glob keys silently stop gating (report 100%, no error) if they ever match zero files — e.g. a future rename of `src/cli/commands/` without updating this config | Pre-existing property of the mechanism (also true of the existing `src/core/**` threshold since story-maint-29), not introduced by this story's new globs; currently verified non-empty. Follow-up tracked at [#277](https://github.com/xavierbriand/accounting/issues/277). |
| CLAUDE.md § 6 lane-trigger wording doesn't literally enumerate root-level config files like `vitest.config.ts` (4th documented occurrence of this gap, after maint-21/22/27) | Not blocking — Reduced-lane self-classification by analogy matches established precedent (story-maint-34). Follow-up tracked at [#278](https://github.com/xavierbriand/accounting/issues/278). |

Two deferred-suggestion issues opened at Phase 4: [#277](https://github.com/xavierbriand/accounting/issues/277)
(coverage-threshold glob silent-pass guard), [#278](https://github.com/xavierbriand/accounting/issues/278)
(recurring lane-trigger wording gap).

## Verification plan

`npm run test:coverage` — confirm all three new threshold lines pass at the captured baseline (no
ERROR lines for `src/infra/**`, `src/cli/commands/**`, or `src/cli/utils/**`). `npm run lint &&
npm run build && npm test` green. No new test files needed (R2: no production-code surface
changed).

## Suggestion log

Phase 2 review is **Reduced lane** (`vitest.config.ts` is infra-only tooling config — CLAUDE.md
§ 6 lane table, R26): `sibling-overlap` only, `plan-reviewer` dropped. Phase 4 adds
`code-reviewer` + a second `sibling-overlap` pass per the lane table.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 (P2, sibling-overlap) | Checked both open PRs (#272, #273 — both dependabot, manifest-only) and all 50 open issues; neither touches `vitest.config.ts`/coverage config/`src/infra/**`/`src/cli/**`, and no issue proposes overlapping threshold work. Baseline (83.23% / 89.66% / 78.94%) not at risk of going stale from either open PR. | acknowledge | No action needed — confirms the plan's own sibling-work check above. |
| 2 (P1, code-reviewer, R5) | Verification table's rows for Scenarios 1–2 named a mechanism but didn't quote actual output in the plan artifact itself. | fix-now | Rows rewritten with quoted command output / concrete `git diff`/`find` evidence (see Verification section above). |
| 3 (P1, code-reviewer, R6) | The pseudo-Gherkin's `fails if` clause claimed vitest enumerates threshold lines and prints "threshold not found for any file" on a misconfigured glob — factually wrong. vitest prints nothing on a passing threshold; a zero-matching glob reports 100% (istanbul `percent(0,0)`) and silently passes forever. | fix-now (plan text corrected) / defer-issue (the underlying mechanism gap) | `fails if` clause rewritten to state the true guard mechanism and honestly flag the silent-pass risk as accepted (pre-existing, applies to `src/core/**` too). Mechanism fix deferred to [#277](https://github.com/xavierbriand/accounting/issues/277) — out of scope for this story's small config addition. |
| 4 (P3, code-reviewer, R16/R28) | The 4th commit-slot's use (splitting one file's change into 2 commits by glob concern) doesn't literally match R16's "process and docs span" carve-out wording, though the resulting shape matches the maint-34 precedent's overall count. | defer-issue | Filed as part of [#278](https://github.com/xavierbriand/accounting/issues/278) alongside the related R26 finding below — a CLAUDE.md wording gap, not a defect in this story's commit shape. |
| 5 (P3, code-reviewer, R26) | CLAUDE.md § 6's Reduced-lane trigger doesn't literally enumerate root-level config files (`vitest.config.ts`) — 4th occurrence of a pattern first flagged in maint-21/22/27, narrowly closed by #200. | defer-issue | Filed as [#278](https://github.com/xavierbriand/accounting/issues/278). |
| 6 (soft, code-reviewer) | The pre-existing `npm audit` findings (#261/#262) noted in the Context's maintenance-sub-loop section weren't also carried into this formal Suggestion log table, the checklist's named exception-record location per `docs/security-checklist.md`. | fix-now | This row added; both issues linked (see Context above). |
| 7 (soft, code-reviewer) | Plan's own DoR checkbox for "Draft PR with template sections 1–6 filled" was left unchecked even though PR #276's live body has all 10 sections filled. | fix-now | Checkbox ticked below. |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — sibling-overlap, Reduced lane): findings triaged above.
- [x] Draft PR with template sections 1–6 filled.
