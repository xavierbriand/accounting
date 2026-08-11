# Story maint-39 — Guard coverage.thresholds glob keys against silent zero-match drift

## Context

Originated from [#277](https://github.com/xavierbriand/accounting/issues/277) (found during
story-maint-38's Phase-4 code-reviewer review, PR #276). `vitest.config.ts`'s `coverage.thresholds`
block gates `src/core/**`, `src/infra/**`, `src/cli/commands/**`, and `src/cli/utils/**` by glob.
If a glob key ever matches **zero files** — a typo, or a future rename/move of the matched
directory without updating the config — `istanbul-lib-coverage`'s `percent(covered, total)`
returns `100.0` when `total === 0`, so the threshold silently reports 100% and passes forever.
`vitest`'s `checkThresholds` prints nothing on a passing threshold, so there is no CI signal
distinguishing "genuinely well-covered" from "gating nothing because the glob matched nothing."
This defeats the entire point of the coverage-gate mechanism story-maint-29 and story-maint-38
introduced: catching regressions instead of letting them drift silently.

**No model impact** — pure test/build-tooling addition, no Core domain concept touched (R24
default for maint/process stories).

**Maintenance sub-loop (CLAUDE.md § 6.7) — this run, 2026-08-11.**

- **Sibling work check:** `gh pr list --state open` → #272 (dev-dependencies group bump), #273
  (csv-parse bump) — both `package.json`/`package-lock.json` only, no overlap. `gh issue list
  --state open` grepped for coverage/threshold/277/278 → only #277 (this story's origin) and #278
  (a related but distinct CLAUDE.md-wording issue, not a code change) and #242 (already resolved
  by story-maint-38). No sibling story targets this surface.
- **Story-id uniqueness (R23):** `story-maint-39` confirmed free — no match in
  `git ls-tree -r origin/main -- docs/plans/ docs/retrospectives/ docs/status.d/` and no open PR
  branch name collides.
- **Working tree clean:** yes. Cut a fresh branch `story-maint-39` directly from `origin/main`
  (`74f5ae4`, includes story-maint-38's merge) — the prior worktree branch (`story-maint-38`) was
  already merged.
- **`npm audit --audit-level=high`:** 4 high-severity transitive findings (brace-expansion,
  js-yaml, nanoid, postcss) — pre-existing, tracked by
  [#261](https://github.com/xavierbriand/accounting/issues/261)/[#262](https://github.com/xavierbriand/accounting/issues/262),
  unchanged. Unrelated to this story's surface — not fixed here.
- **Drain:** this story itself drains #277 (a deferred-suggestion issue from the prior story).
- **Proceed-to-planning.**

**Lane: Reduced** (R26, by the same analogy precedent story-maint-38 used — infra/build-tooling
config + a new test file, no `src/core/`/DB-schema change). Note: this story's own surface
(`vitest.config.ts`, a new root `vitest.coverage-thresholds.ts`, a new `tests/integration/` file)
is itself a live example of the wording gap tracked at
[#278](https://github.com/xavierbriand/accounting/issues/278) — none of it sits literally under
`src/infra`/`src/cli`. Not blocking; noted as further corroboration for #278's disposition.

## Story

> As a maintainer, I want CI to fail loudly if a `coverage.thresholds` glob key ever matches zero
> files, so that a future typo or directory rename can't silently turn off part of the coverage
> gate without anyone noticing — per #277.

## Domain model

No model impact — test-tooling addition, no Core domain concept touched (R24 default).

## Selected solution

**Option A — chosen.** Extract the `coverage.thresholds` object out of `vitest.config.ts` into a
new root-level module, `vitest.coverage-thresholds.ts`, exporting a single typed constant. Import
it both from `vitest.config.ts` (unchanged behavior — same object, just relocated) and from a new
integration test, `tests/integration/coverage-thresholds-glob.test.ts`, which iterates every key,
resolves it against the real repo filesystem, and asserts at least one `.ts` file matches.

The checker only needs to support the glob shape every current (and realistically future) key
actually uses — `'<dir>/**'` — not a general-purpose glob engine. Using
`fs.readdirSync(dir, { recursive: true })` (no new dependency; direct precedent:
`tests/unit/core/ingest/no-default-rules.test.ts` already does exactly this for a different
repo-structural check) to walk `<dir>` and count `.ts` files.

Extracting the shared constant (rather than hand-duplicating the four glob strings inside the
test) is the part that actually closes the gap #277 describes: a future key addition, rename, or
typo is automatically covered by the same test with zero extra wiring, because the test reads the
live config object, not a copy of it.

**Option B — inline the four glob strings directly in the test, no shared module.** Rejected. A
future threshold-key change would need the person making it to remember to also update a
hand-copied list in the test — exactly the kind of silent-drift risk this story exists to close.

**Option C — a `harness/`-tier check (mirroring `drift-scan`) instead of a `tests/integration/`
test.** Rejected. This validates the *product's own* build/test config (`vitest.config.ts`), not
the dev-loop harness itself (`harness/` is a separate bounded context per CLAUDE.md § 2/§ 27) —
it belongs in the product's own test suite, gated by the same `npm test`/`test:coverage` CI step
the thresholds themselves run under.

**Option D — use a real glob library (e.g. add `fast-glob`/`tinyglobby` as a dependency).**
Rejected. R3 (tool-bundle import audit) applies to any new framework/library — not justified here
when every actual (and realistically future) threshold key follows the simple `'<dir>/**'` shape,
which `fs.readdirSync(..., { recursive: true })` handles without a new dependency.

## Production-code surface (R2)

None. No `src/` file touched. New root config module (`vitest.coverage-thresholds.ts`) and a new
test file (`tests/integration/coverage-thresholds-glob.test.ts`); `vitest.config.ts` changes only
to import the relocated constant instead of inlining it (identical resulting config).

## Gherkin acceptance scenarios

Real automated test (not pseudo-Gherkin this time — this story adds an actual `.test.ts` file with
genuine red→green TDD, unlike story-maint-38's config-only change). No `.feature` file — this is
below the CLI-observable-behavior line quickpickle's acceptance tier targets, same tier judgment
as `no-default-rules.test.ts`'s structural check. Docblock in the test file itself carries the
Gherkin-shaped scenario per that file's established precedent.

```text
Feature: coverage.thresholds glob keys are guarded against silent zero-match drift

  Scenario: every configured threshold glob matches at least one real file
    Given vitest.config.ts's coverage.thresholds keys live in vitest.coverage-thresholds.ts
    When tests/integration/coverage-thresholds-glob.test.ts runs
    Then each key (stripped of its trailing "/**") resolves to a directory
    And that directory contains at least one .ts file
    fails if: any threshold key's directory contains zero .ts files (typo, or the directory was
      renamed/moved without updating the config) — this is the exact silent-pass failure mode
      #277 describes; verified by temporarily pointing one key at a nonexistent directory and
      confirming the test fails with a clear assertion message, then reverting (not committed)
```

| Scenario | Verification mechanism |
| --- | --- |
| 1 — every glob matches ≥1 file | `npm test -- tests/integration/coverage-thresholds-glob.test.ts` passes against the real, current `coverage.thresholds` object |
| fails-if guard actually fires | Manual demonstration: temporarily change one key's directory to a nonexistent path, re-run the test, confirm it fails with the assertion's message naming the bad key, then revert (not committed) before landing the real commits |

## Slice plan

Real behavior added (a new guard that can itself fail), not a zero-behaviour-change collapse —
R13 target applies, though justified smaller given the story's narrow scope (one small guard, no
Core/infra/cli logic).

1. `chore(docs): story-maint-39 plan + P1/P2/P3 review (story-maint-39)` — this plan doc.
   *(prep commit, uncounted per R30)*
2. `test(tooling): coverage-threshold glob keys must match at least one file — failing
   (story-maint-39)` — add `tests/integration/coverage-thresholds-glob.test.ts`, importing the
   not-yet-created `vitest.coverage-thresholds.ts` (fails: module doesn't exist).
3. `feat(tooling): extract coverage.thresholds into vitest.coverage-thresholds.ts, wire into
   vitest.config.ts — minimal green (story-maint-39)` — creates the shared module (same four
   entries story-maint-38 landed, unchanged values), `vitest.config.ts` imports it instead of
   inlining. Test now green (R28: this test+feat pair counts as one slice).
4. `refactor: empty slot — nothing further to extract (story-maint-39)` — no-op; a
   config-extraction + one test file has no further extractable structure at this size.
5. `chore(retro): story-maint-39 retrospective (story-maint-39)`.

Justification for a smaller-than-6 envelope: single narrow guard, one glob shape, no Core/infra
logic — matches the size precedent of other small Reduced-lane maintenance stories
(story-maint-38's 3-counted-slice shape for a comparably narrow change).

Squash on merge optional.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| The `'<dir>/**'`-only glob-shape assumption breaks if a future threshold key ever uses a different glob shape (e.g. `'src/infra/db/**/*.ts'`) | The test's own shape-match assertion fails loudly (not silently) if a key doesn't match `'<dir>/**'`, per Option D's scope note — prompting a deliberate extension rather than a silent gap. Not blocking; documented as a known scope boundary. |
| This story's own surface (root config + `tests/integration/`) doesn't literally fit CLAUDE.md § 6's Reduced-lane wording, the exact gap #278 tracks | Not blocking — self-classified by the same analogy precedent story-maint-38 used. Further corroboration for #278's disposition, not a new issue. |

No new deferred-suggestion issues opened by this story (draining #277, not adding to the pile).

## Verification plan

`npm test` (full suite, includes the new integration test) green. `npm run test:coverage` still
passes with the same four thresholds (relocated, not changed). `npm run lint && npm run build`
green. Manual fails-if demonstration per the Gherkin table above, reverted before the real commits
land.

## Suggestion log

Phase 2 review is **Reduced lane** (test-tooling/config surface — CLAUDE.md § 6 lane table, R26):
`sibling-overlap` only, `plan-reviewer` dropped.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 (P2, sibling-overlap) | Checked both open PRs (#272, #273 — both dependabot, manifest-only) and all 50 open issues. #277 is this story's own origin (not overlap). #278 read in full — proposes only a CLAUDE.md wording change, no code/test surface, no collision with this story's files. #242 confirmed already closed. No story-id collision. | acknowledge | No action needed — confirms the plan's own sibling-work check above. |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — sibling-overlap, Reduced lane): findings triaged above.
- [ ] Draft PR with template sections 1–6 filled.
