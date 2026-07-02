# Story h2 — Promote `table-only` drift to hard finding

## Context

**Why this change.** Story-h1 ([PR #115](https://github.com/xavierbriand/accounting/pull/115)) shipped `harness/drift-scan/` with a documented compromise: `table-only` findings (a § 8 row with no retro reference) exit 0 instead of 1. The reason was a chicken-and-egg — R21 was codified in § 8 by story-h1's slice 10, but the retro that mentions R21 was only authored at slice 12; promoting `table-only` to hard then would have made slice 10's verification step ("`tsx harness/drift-scan/drift-scan.ts` exits 0 on the live repo") unachievable. See [story-h1.md § Change](../retrospectives/story-h1.md) and the Phase-4 R2 finding.

Story-h1 has now merged ([12a6c13](https://github.com/xavierbriand/accounting/commit/12a6c13)). Its retro is on main and references R21. Every R-tag in § 8 (R1..R21) now has an originating retro reference, so the precondition holds: promoting `table-only` to hard restores Check A's bidirectional invariant **without** breaking the live-repo run.

Tracked at [#120](https://github.com/xavierbriand/accounting/issues/120). This story closes it.

**Why now.** The compromise weakens the very invariant story-h1 shipped. Every additional retro authored under the soft regime is a place where a § 8 row could land without an originating retro and go unflagged. The fix is 1 LOC + a test + a README cleanup; the cost of leaving it is open-ended.

**Maintenance sub-loop (§ 6.7) run 2026-05-11 pre-planning.** Following [docs/templates/maintenance-sub-loop.md](../templates/maintenance-sub-loop.md):

- [x] **Working tree clean.** On worktree branch `claude/pedantic-kirch-ea8971`, rebased on `origin/main` at `12a6c13`.
- [x] **Open PRs check (R19).** 4 open PRs: #118 (`docs(learning)` — application-layer comparison, unrelated tree), #122/#123/#124 (dependabot — no overlap with `harness/`). None touch drift-scan, CLAUDE.md § 8, or retrospectives.
- [x] **Open issues / sibling work (R19).** #119 (drift-scan default-scope diff filter tests) and #120 (this story) are the only drift-scan-touching open issues. #119 is independent — separate test infrastructure. No conflict.
- [x] **`origin/main` fetched.** `git fetch origin` returned the dependabot-branch listing only.
- [x] **`npm audit --audit-level=high`** — to be run during sonnet-implementer's verification.
- [x] **Proceed-to-planning.**

## Story

> As the maintainer of the drift-scan tooling, I want `table-only` findings (a § 8 row whose R-tag has no retro reference) to exit 1, so that Check A's bidirectional invariant is restored now that R21 has an originating retro on main.

**FR coverage:** none (harness/process tooling, not product behaviour). **R2 production-code surface:** small but non-zero — one filter literal in `drift-scan.ts`, one paragraph in `harness/drift-scan/README.md`, one new subprocess test.

**Epic coverage:** none — harness-engineering follow-up under [#94](https://github.com/xavierbriand/accounting/issues/94) umbrella. Out of scope of [docs/epics.md](../epics.md).

## Selected solution

### 1. `harness/drift-scan/drift-scan.ts` — promote `table-only` to hard

Today:

```ts
const hardFindings = findings.filter(
  (f) => f.kind === 'retro-only' || f.kind === 'missing-path',
);
process.exit(hardFindings.length > 0 ? 1 : 0);
```

Change to:

```ts
process.exit(findings.length > 0 ? 1 : 0);
```

Deleting the filter (not extending the kinds list) — once `table-only` is hard, every finding kind is hard, and the variable name `hardFindings` no longer carries information. The simpler form makes the invariant ("any finding fails the scan") legible at the call site. Verified with `grep -n hardFindings harness/drift-scan/drift-scan.ts` before editing — sole occurrence is at the filter site.

### 2. `harness/drift-scan/README.md` — remove the soft/hard distinction

Current § Exit codes:

```
- `0` — no **hard** findings.
- `1` — one or more hard findings.

A finding is **hard** (contributes to exit 1) when it represents drift between artefacts that should already be in sync: `retro-only` … and `missing-path` … A finding is **soft** (informational, does not affect exit code) for `table-only` … but do not gate CI.
```

Replace with:

```
- `0` — no findings.
- `1` — one or more findings (any kind: `retro-only`, `table-only`, `missing-path`).
```

The "exit 1 on any drift" wording matches the original story-h1 plan § 1.3 output contract before the chicken-and-egg compromise.

### 3. New subprocess test — `tests/drift-scan.integration.test.ts`

Add a single test (**appended at the END of the existing `describe` block** so it runs after the existing tests — keeps `R97` injection in the `--json` test order-independent from the new R96 injection) that introduces a § 8 row whose R-tag has no retro reference and asserts the scanner exits 1 with that tag named on stderr.

**Mechanism — temporary CLAUDE.md mutation with snapshot/restore.** The cleanest pattern given the existing test infrastructure (no `--claude-md=<path>` flag plumbed; adding one would expand scope). The test:

1. Reads the current `CLAUDE.md` and stashes its content in a module-level variable `CLAUDE_MD_SNAPSHOT: string | null`.
2. Appends one row `| R96 | drift-scan test orphan | [none](docs/retrospectives/none.md) |` to the end of the file (the section is the last in the file, so appending to EOF places the row inside the region per `extractSectionEightTags`'s "EOF terminates region" branch).
3. Runs the scanner; asserts `status === 1` and stderr contains `R96` and the substring `table-only:`.
4. Restores `CLAUDE.md` to the stashed original via a **second `afterEach`** (added alongside the existing `TEMP_RETRO_FILES` hook, not folded into it — keeps the new cleanup scoped to its own slice and avoids touching the existing hook's code).

**Exact comment block for the new test:**

```ts
// fails if the hardFindings filter (or its successor) in drift-scan.ts
// excludes table-only from the exit-1 gate. Mutates CLAUDE.md in place
// and restores it via afterEach — if a hard crash leaks the mutation,
// run `git checkout CLAUDE.md` to recover (the appended R96 row is
// the only diff).
```

Cleanup is **mandatory and exception-safe** — if the test process crashes between mutate and restore, CLAUDE.md would be left in a corrupt state on disk and would leak into the next run / next commit. The `CLAUDE_MD_SNAPSHOT` variable is set **before** the mutating write, so the snapshot is always captured by the time `afterEach` runs. The `afterEach` resets the variable to `null` after restore so subsequent tests don't double-write. `fs.writeFileSync` in the hook is not wrapped in try/catch — per `docs/engineering-standards.md`, bare catches that swallow errors are forbidden; an unhandled throw in `afterEach` surfaces as a vitest hook error and is the correct failure mode (user recovers via `git checkout CLAUDE.md`).

**Test-mechanism honesty (R7):** subprocess-tier, real fs, real `CLAUDE.md` (mutated and restored). Asserts the full pipeline: parser → composer → exit-code logic. No mocks.

**Mock diversity (R8):** the existing `--json` integration test already asserts the discriminated-union shape for `table-only` entries. This new test asserts the exit-code path. Together they pin both the data shape and the gating behaviour.

### 3a. Stale comment cleanup in the existing clean-repo test

The clean-repo test at `harness/drift-scan/tests/drift-scan.integration.test.ts:57-67` carries two now-stale references that this story makes inaccurate:

1. The block comment says `false positive in composeDrift's hard-findings filter` — `hardFindings` is the eliminated variable, not a name inside `composeDrift`. Rewrite the comment to name the actual current path: the exit-code gate in `drift-scan.ts` and `composeDrift` in `drift-parser.ts`.
2. The comment says `Stderr is allowed to carry table-only informational findings (R21 today)` — this becomes false post-promotion. Rewrite to: clean repo means **no** drift of any kind on stderr (retro-only, missing-path, table-only).
3. The assertions cover only `retro-only:` and `missing-path:`. Strengthen by adding `expect(result.stderr).not.toContain('table-only:')` — closes a regression gap where a future stray § 8 row would silently pass this test if the only assertion gap is on `table-only:`.

Folded into **slice 3** (same slice as the production-code change) because the test whose semantics are inverted by the promotion belongs in the same diff. Without this cleanup the comment block becomes a misleading historical artefact and the new behaviour is under-asserted on the clean-repo path.

### 4. CLAUDE.md update — no rule change

This story does **not** add a new R-tag. R21's rule statement ("drift-scan enforces CLAUDE.md § 8 ↔ retro and plan ↔ source consistency at write/CI time; opt-out via `*(pending)*` marker") already covers bidirectional enforcement; promoting `table-only` is a behaviour-tightening within R21's scope, not a new rule. CLAUDE.md is untouched (except by Phase 4 if a finding lands there).

## Production-code surface (R2)

| Path | New/Modified | Layer | Purpose |
| --- | --- | --- | --- |
| `harness/drift-scan/drift-scan.ts` | modified | harness | Delete the `hardFindings` filter; gate exit code on `findings.length`. |
| `harness/drift-scan/README.md` | modified | harness | Drop the soft/hard distinction paragraph; restore "exit 1 on any drift" wording. |
| `harness/drift-scan/tests/drift-scan.integration.test.ts` | modified | harness | New subprocess test: orphan § 8 row exits 1. `afterEach` snapshot/restore for CLAUDE.md. |
| `docs/plans/story-h2.md` | new | docs | This file. |
| `docs/retrospectives/story-h2.md` | new | docs | Authored at the retro slice. |
| `docs/status.d/2026-05-11-story-h2.md` | new | docs | Per R17, dropped at the retro slice. |

**Type/signature/format changes outside this story:** none.

**No new dependencies (R3 audit).** `harness/drift-scan/tests/drift-scan.integration.test.ts` already imports `vitest`, `node:child_process`, `node:fs`, `node:path`. No new imports needed for the snapshot/restore pattern (string in a closure + the existing `fs.writeFileSync`/`fs.readFileSync`).

## Acceptance scenarios

```gherkin
Feature: table-only drift fails the scan

  Scenario: § 8 row with no retro reference exits 1
    Given CLAUDE.md § 8 contains an R96 row
    And no retro file references R96
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then it exits 1
    And the report names R96 and the table-only kind
    fails if the `hardFindings` filter in `drift-scan.ts` excludes `table-only`, or the exit gate ignores a `table-only`-only findings list.

  Scenario: clean repo still passes
    Given every § 8 row has an originating retro reference
    And no retro references an R-tag missing from § 8
    When I run `tsx harness/drift-scan/drift-scan.ts`
    Then it exits 0
    fails if the new filter promotes false positives (e.g. counts a finding when the array is empty), or if Check A's bidirectional logic in `composeDrift` regresses.
```

The first scenario maps onto the new subprocess test in slice 2. The second scenario maps onto the existing clean-repo test in `drift-scan.integration.test.ts` (no change needed — it already asserts `status === 0` and stderr cleanliness; the change is that `table-only:` lines on the **live repo** would now also fail it, which on main today they do not).

## Slice plan

R13 envelope: 6–10 commits. This story sits at the **lower bound** with **4 body slices** + the preparatory plan commit + the retro commit. Justification: a single-behaviour change (one filter literal) with a single new test. The R9 trivial-inline carve-out (≤5 LOC, single file, pre-specified) almost applies but the change spans `drift-scan.ts` + README + a new test, so the formal phases run. Below R13's lower bound by 2 slices, accepted because the unit of behaviour change is genuinely small — conflating slices would either fold the test into the green commit (breaking the red→green pairing) or merge the README cleanup with the code change (mixing docs and behaviour).

1. **`chore(docs): plan + P1/P2/P3 review (story-h2)`** — preparatory. Commits this plan file with the suggestion log filled after Phase 2. **Not counted in R13's body.**
2. **`test(drift-scan): table-only finding contributes to exit 1 — failing`** *(red)*. Adds the new subprocess test with the `afterEach` snapshot/restore for CLAUDE.md. Fails today because `table-only` exits 0.
3. **`feat(drift-scan): gate exit code on all findings — minimal green`**. Deletes the `hardFindings` filter; replaces `hardFindings.length > 0` with `findings.length > 0` at the `process.exit` call. Updates the stale clean-repo test block comment (§ 3a above) and adds the `not.toContain('table-only:')` assertion. The slice-2 test goes green; the existing clean-repo test stays green because every § 8 row on main has an originating retro reference.
4. **`docs(harness): drop soft/hard distinction in drift-scan README`**. Rewrites § Exit codes to the simpler form. No behaviour change.
5. **`chore(retro): write retrospective + status fragment (story-h2)`**. `docs/retrospectives/story-h2.md` + `docs/status.d/2026-05-11-story-h2.md`. Closes [#120](https://github.com/xavierbriand/accounting/issues/120) in the PR body so merge auto-closes it.

**R11 empty-refactor slot.** Folded into slice 3 — deleting the filter *is* the structural simplification; no separate empty `refactor:` commit unless Phase 4 surfaces a real refactor. If Phase 4 is empty, the body stays at 4 commits (R13 lower-bound).

## Risks & deferred items

- **CLAUDE.md mutation leak.** If slice-2's test crashes between the file mutation and the `afterEach` restore, CLAUDE.md is left corrupt on disk. Mitigations: the `afterEach` uses the stashed string and a try/finally-equivalent vitest hook contract; the test asserts within a tight scope (3 lines between write and assertions); a fallback git-stash recovery is documented in the test comment. The same risk applies to the existing tempfile-based tests, but those create *new* files rather than mutating tracked files — the new test is the first to mutate CLAUDE.md in-place. **Considered alternative:** plumb a `--claude-md=<path>` flag through `drift-scan.ts` and write a temp CLAUDE.md to a scratch dir. Rejected: expands the production-code surface (new CLI flag, new arg-parsing path, doc updates) for a test affordance. Snapshot/restore is the smaller change.
- **R-tag collision.** Using `R96` for the test row; if a future retro introduces R96, the test's invariant would conflict. R-tags advance monotonically (next is R22); R96 is outside the foreseeable allocation horizon. Same reasoning as the existing tests that use R97/R98/R99 for orphan injection.
- **Test order interaction.** vitest runs tests in source order by default; the new test mutates CLAUDE.md *after* the existing tests have read it. The `afterEach` restore makes order-independence explicit. Verified by mental walk of vitest 3.x's hook semantics.

## Verification plan

1. `npm run lint && npm run build && npm test` — green. Product test count unchanged.
2. `npm run test:harness` — green. New test count: +1 (5 → 6 integration tests; unit tests untouched).
3. `npm run typecheck:harness` — green.
4. `npx tsx harness/drift-scan/drift-scan.ts` on the live repo — exits 0. (Pre-condition: story-h1's retro mentioning R21 is on main — verified at planning time, [12a6c13](https://github.com/xavierbriand/accounting/commit/12a6c13).)
5. **Negative-case rehearsal.** Manually run the integration test in isolation (`npm run test:harness -- -t 'table-only finding contributes'`); confirm it fails before slice 3 and passes after. Confirm CLAUDE.md is restored after each run via `git diff CLAUDE.md` returning empty.
6. **CI gate confirmation.** Push the feature branch; observe the Run Harness Tests step picks up the new test and the Drift scan step exits 0.

## DoR checklist

- [x] Phase 1 (Plan): this document.
- [x] Phase 2 (Critical review): 11 findings (6 P1, 1 P2, 4 P3). 7 adopted, 2 acknowledged, 0 deferred.
- [ ] Draft PR with template sections 1–6 filled — pending (slice 1 commit + push + `gh pr create`).

## Suggestion log

Phase 2 (P1 / P2 / P3) by `plan-reviewer` sub-agent on 2026-05-11 — 11 findings (6 P1, 1 P2, 4 P3).

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Slice 3 commit subject (`include table-only in hardFindings`) contradicts the change (which deletes `hardFindings` entirely); misleads `git log` readers. | adopted | Renamed slice 3 to `feat(drift-scan): gate exit code on all findings — minimal green`. Accurate per R12. |
| P1 | Existing clean-repo test's `fails if` comment references `composeDrift's hard-findings filter` — a construct eliminated by this story; will become stale. | adopted | Added § 3a; slice 3 rewrites the comment to name the actual current path (exit-code gate in `drift-scan.ts` + `composeDrift` in `drift-parser.ts`). |
| P1 | Plan ambiguous on whether the CLAUDE.md restore is in the existing `afterEach` or a new second hook. | adopted (clarified) | § 3 now specifies a **second `afterEach`** hook, added alongside the existing `TEMP_RETRO_FILES` hook (not folded into it). Keeps cleanup scoped to the new slice. |
| P1 | Comment text for git-stash recovery instruction not specified — Sonnet would invent it. | adopted (clarified) | § 3 now contains the exact comment block to write into the test, including the `git checkout CLAUDE.md` recovery hint. |
| P1 | Test insertion position unspecified; if inserted before the `--json` test, R96 mutation could pollute the R97 test's run. | adopted (clarified) | § 3 now specifies: append at the **END** of the existing `describe` block. |
| P1 / P2 | Existing clean-repo test's body comment `Stderr is allowed to carry table-only informational findings (R21 today)` is invalidated by this story's behaviour change; misleads future readers about the QA expectation. | adopted | § 3a; slice 3 rewrites the body comment AND adds `expect(result.stderr).not.toContain('table-only:')` to strengthen the assertion against the new behaviour. |
| P3 | Slice 3 commit subject mismatch (R12). | adopted | Same as P1 finding 1 above. |
| P3 | `fs.writeFileSync` in `afterEach` could throw; plan silent on try/catch. | acknowledged | Per `docs/engineering-standards.md`, bare catches swallowing errors are forbidden. Vitest's hook-error reporting is the correct failure mode; user recovers via `git checkout CLAUDE.md`. § 3 now explicitly states this design choice. |
| P3 | Surface table doc-paths (`docs/retrospectives/story-h2.md`, `docs/status.d/2026-05-11-story-h2.md`) aren't matched by Check B (only `src/`, `tests/`, `harness/` prefixes). | acknowledged | Intentional scanner scope rule; no action. Documented here so a future reviewer doesn't wonder why doc paths are unlinted. |
| P3 (soft) | `afterEach` structural ambiguity (single hook modified vs second hook added). | adopted | Same as P1 finding 3 above — second hook, added alongside the existing. |
| — | R1, R2, R3, R7, R8, R11 — factual confirmations. | (no action) | Reviewer-confirmed compliant. |

**Tally:** 7 adopted/clarified · 2 acknowledged · 0 rejected · 0 deferred. **DoR gate met.**

## Phase 4 retro-check

Phase 4 (P1 / P2 / P3 retro-check) by `code-reviewer` sub-agent on 2026-05-11 — 3 findings (0 P1, 0 P2, 3 P3 soft).

| Phase | Finding | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P3 (soft) | R98 retro-only test's `fails if` comment uses the deleted identifier `hardFindings` as a label (`main() ignores a non-empty hard-findings list`). | fix-now | Renamed to `non-empty findings list` (Phase-4 refactor `2cecd75`). |
| P3 (soft) | New `table-only` test missing `(Gherkin scenario N: …)` label for parity with the five pre-existing tests. | fix-now | Added `(Gherkin scenario h2-1: orphan § 8 row exits 1)`; tightened `fails if` phrasing to name the exit-code gate directly (Phase-4 refactor `2cecd75`). |
| P3 (soft) | Clean-repo test description retains `(slice 10)` — a story-h1 internal slice reference. | acknowledged | Historically accurate — slice 10 of story-h1 is when R21 was codified. Renaming it would lose that pin. |
| — | R1, R2, R3, R5, R6, R7, R8, R10, R12, R13, R21 — factual confirmations. | (no action) | Reviewer-confirmed compliant. |

**Tally:** 2 fix-now · 1 acknowledged · 0 defer-issue · 0 rejected. **DoD gates 8 + 9 ready** pending retro authoring.
