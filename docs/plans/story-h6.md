# Story-h6: Deterministic DoD checks — commit-subject, TODO/TBD, Gherkin↔step mapping

Closes [#144](https://github.com/xavierbriand/accounting/issues/144).

## Context

**Why:** Third and final story of the 2026-07-02 token-reduction arc (arc origin: `story-h4` Context).
`story-h4` (baseline telemetry, #99) and `story-h5` (context diet, #143) both shipped and merged
(PRs #145, #146). This story removes reviewer-prompt token cost permanently by moving three
mechanical Definition-of-Done checks out of the LLM reviewer prompts and into TypeScript — every
check moved is zero tokens forever and higher consistency (drift-scan precedent, story-h1/h2).

Like story-h1/h2/h3/h4/h5, this is a harness story **outside** the `docs/epics.md` FR/NFR numbering
— no FR coverage is claimed; the deliverable is process tooling, not product behaviour.

Three reviewer-context checks become deterministic scanners (the LLM reviewer keeps only the
judgment calls — e.g. "does this test actually *exercise* the scenario"; the scanner does
existence/mapping only):

1. **Commit-subject discipline** (§ 6.4 / DoD 5) — story id present in every commit subject; commit
   count vs the R13/R14/R16 envelope.
2. **TODO / TBD scan** (DoD 4 / 6) — `TODO` comments in the tree; `TBD` left in the PR-template body.
3. **R5 Gherkin↔test mapping** — `tests/features/*.feature` scenarios ↔ `steps/*.ts` definitions ↔
   plan-declared scenarios; report unmapped scenarios / orphan steps.

**Mandated refactor (rule-of-three).** Per the maintainer's Phase-4 note on #144: story-id→subject
pattern matching already exists twice — `harness/metrics/lib/loop-metrics.ts` (`buildStoryIdPattern`,
a JS `RegExp`) and `harness/metrics/usage-reader.ts` (`getStoryCommitWindow`, an ERE string for
`git log --grep`). The new commit-subject check is the third consumer, so this story **extracts a
shared matcher into `harness/lib/`** and refactors both metrics consumers onto it, rather than adding
a fourth copy.

**Adjacencies (cross-referenced, not absorbed):** #86 (markdown-link-check CI), #111 (Module 7
plan↔code sync), #119 (drift-scan subprocess tests). #119's temp-git-repo scaffolding + story-h4's
C1 fixtures are shared-helper candidates for this story's integration test.

**Future `harness/dod-check/` scanner-family candidates — explicitly out of scope for story-h6**
(§ 6.6 sizing; folding any of these in now would breach the R13 envelope): #147 (regression guard
that `test:quiet` stays wired to a minimal reporter — its body names #144's scanner family as a
fold-in target); and the two story-h4 retro *Try* items earmarked for #144 — committed-artifact
staleness (`loop.csv` regen check) and generated-reference-data provenance (`prices.json` `source`
note). They belong to the same tool but are separate behaviours; deferred, not rejected.

**Measured-by:** story-h4 baseline — a shrunk `code-reviewer` spec and shorter Phase-4 runs after
these checks stop being prose in the reviewer prompt.

### Maintenance sub-loop (§ 6.7) — run 2026-07-02 pre-planning

- **Sibling work check:** `gh pr list --state open` → none. #144 is this story; #86/#111/#119 are
  adjacent (cross-referenced above), not overlapping. To be re-confirmed by the parallel
  `sibling-overlap` audit at Phase 2.
- **Story-id uniqueness:** `git ls-tree origin/main -- docs/plans docs/retrospectives docs/status.d`
  shows story-h1..h5 taken (h5 merged via #146); no `story-h6` on `origin/main`; no open PR branch
  carries it. → **story-h6** chosen.
- **Working tree:** clean; the `story-h6` worktree is cut fresh from `origin/main` @ `689884d`
  (post-#148 loop.csv regen).
- **Open issues:** 0 open PRs; `deferred-suggestion` items untouched by this scope.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Proceed:** yes.

## Story

As the developer running this repo's agentic workflow, I want the mechanical DoD gates
(commit-subject story-ids + count envelope, TODO/TBD absence, Gherkin↔step existence-mapping) checked
by a deterministic harness tool, so that the P1/P2/P3 reviewer prompts stop carrying those checks as
prose — cutting reviewer context tokens to zero for them and making the gate consistent across
stories.

## Alternatives considered

- **Three separate tools** (`dod:commits`, `dod:tbd`, `dod:gherkin`) — set aside: drift-scan runs
  Check A + Check B in one invocation with one findings union and one hard exit. One tool
  (`harness/dod-check/`) with per-check pure libs matches that precedent and gives CI a single step.
- **Regex-parse `.feature` and step files by hand** — rejected: brittle. `@cucumber/gherkin` (feature
  AST) and `@cucumber/cucumber-expressions` (`{int}`/`{string}`/`{float}` → matcher) are already in
  `node_modules` (transitive via quickpickle). Use the official parsers; add them as explicit harness
  devDeps (R3 audit) so we don't depend on a transitive that quickpickle could drop.
- **Add a fourth story-id regex in the new check** — rejected by the #144 rule-of-three note; extract
  the shared matcher instead.
- **Uniform hard exit 1 for every finding** (drift-scan style) — refined to **draft-aware
  enforcement** (see Selected solution): the envelope-count and PR-body-TBD checks legitimately
  can't pass until a story is complete, so they stay advisory while the PR is a draft and become
  hard failures once it's marked ready-for-review.
- **Absorb #86/#111/#119** — rejected: § 6.6 sizing; cross-referenced as adjacencies.

## Selected solution

One harness tool, `harness/dod-check/`, same isolation pattern as `harness/drift-scan/` and
`harness/metrics/` (no imports to/from `src/`, `tests/`; covered by `vitest.harness.config.ts`;
coverage-exempt per CLAUDE.md § 5). Plus the shared story-id matcher under a new `harness/lib/`.

### Shared matcher — `harness/lib/story-id-matcher.ts`

One canonical spec of the three subject conventions (`[story-<id>]` bracket · bare `story-<id>` on a
word boundary · capitalized `Story <id>`), exported in the two shapes the consumers need:

- `buildStoryIdRegExp(storyId): RegExp` — JS regex for in-process subject matching. Consumers:
  `loop-metrics.ts` (refactored off its local `buildStoryIdPattern`) and the new commit-subject check.
- `buildStoryIdGitGrepPattern(storyId): string` — ERE string for `git log --extended-regexp --grep`.
  Consumer: `usage-reader.ts` (refactored off its inline pattern).

Unit + `fast-check` property tests pin the matcher; the existing metrics tests must stay green
(unifying the two subtly-different regexes is behaviour-affecting — pin both consumers' cases).

### Tool — `harness/dod-check/` (drift-scan structure)

Pure libs under `lib/` (zero fs/process imports), I/O + git + `gh` + dispatch in the entrypoint.
Finding types are a discriminated union (like `drift-parser.ts`), split by enforcement class:

| Finding | Check | Enforcement |
| --- | --- | --- |
| `missing-story-id` | subject has no story id | **hard** (always exit 1) |
| `todo-comment` | `TODO` in tracked `src/`/`tests/`/`harness/` source | **hard** |
| `unmapped-scenario` / `orphan-step` | feature step with no step-def / plan scenario absent from features | **hard** |
| `commit-envelope` | commit count outside the plan-declared R13/R14/R16 range | **draft-aware** |
| `pr-tbd` | `TBD` left in PR body (excluding the § 10 checklist placeholders) | **draft-aware** |

- **Story id** derived from the current branch name (`story-<id>` → `<id>`); fallback to the single
  plan file added in `origin/main...HEAD`. **Unresolved case** (no `story-` branch and zero-or-many
  plan files added — e.g. a maintenance PR, or a rare multi-story PR): the commit-subject check is
  skipped and reports a distinct advisory `story-id-unresolved` finding naming why — never a crash,
  never a silent pass.
- **Envelope rule** parsed from the plan's Slice-plan heading. The corpus uses several shapes
  (`## Slice plan`, `## Slice plan for Sonnet`, `## Slice plan (R13: …)`, `## Slice plan (R16: …)`,
  `## Sizing & commits — R16 collapse`), many with **no** R-tag in the heading. Parse rule: scan the
  plan for the first `R13|R14|R16` token inside a Slice-plan / Sizing heading **or its heading line**;
  if none is found → a reported advisory `commit-envelope` finding "envelope rule not declared in
  plan" (never a crash). A `todo-tbd.test.ts`/`commit-subject.test.ts` fixture set covers all five
  heading shapes so robustness is pinned by tests, not only by story-h6's own single shape.
- **Subprocess safety (P3):** every `git` / `gh` call in the entrypoint uses `execFileSync` with
  **array args** (the `harness/metrics` precedent), never a string-interpolated shell command — the
  branch-name-derived story id must never reach a shell. `execSync`-string form (used in drift-scan)
  is not used here.
- **Draft-aware exit:** hard findings → exit 1 always. Draft-aware findings → exit 1 **only when the
  PR is out of draft** (ready-for-review = the merge gate); while the PR is a draft, or when no PR /
  draft state resolves, they are reported but do not fail. Draft state resolves in priority order:
  (1) explicit CI env `DOD_PR_DRAFT` (wired from the Actions `pull_request` context — see Wiring);
  (2) local `gh pr view --json isDraft`. **All `gh`/`git` failure modes** (no PR, unauthenticated,
  rate-limited, network error, or an `isDraft` field that fails to parse) collapse to the *same*
  advisory-fallback path with a reported degradation line — they never throw and never suppress the
  hard-findings report. The `isDraft` JSON is parsed through a small typed guard (unknown → treated
  as draft/advisory); no zod dep at the harness tier.
- **Output contract** (drift-scan parity): human report grouped by check to stderr; `--json` findings
  array to stdout; `process.exit(hardFindings>0 || (advisoryFindings>0 && !isDraft) ? 1 : 0)`.

### Wiring

- **CI** (`.github/workflows/ci.yml`): a `Run DoD checks` step after `Drift scan`, running
  `npx tsx harness/dod-check/dod-check.ts` with the draft/number wired as **env** from the Actions
  workflow expressions (they are event-payload fields, not ambient env, so they must be mapped
  explicitly): `env: { DOD_PR_DRAFT: ${{ github.event.pull_request.draft }}, DOD_PR_NUMBER: ${{ github.event.pull_request.number }} }`.
  On `push` to `main` (no PR context) both are empty → draft-aware findings default to advisory.
  `fetch-depth: 0` is already set (full history for the commit scan).
- **PostToolUse** (`.claude/settings.json`): narrow hook — run the Gherkin↔step sub-check
  (`--check gherkin`) when an edit touches `tests/features/**`; mirrors drift-scan's plan/retro hook.
  The commit/PR checks stay CI + manual (per-edit is meaningless for them).
- **package.json:** `dod:check` script (+ `--check <name>` sub-selection).

## Production-code surface (R2)

No `src/` files touched. No migrations. No schema/product-behaviour change. Harness + config + docs.

**New files:**

| File | Purpose |
| --- | --- |
| `harness/lib/story-id-matcher.ts` | Shared story-id matcher (JS regex + ERE grep string) |
| `harness/lib/tests/story-id-matcher.test.ts` | Unit + `fast-check` property tests |
| `harness/dod-check/dod-check.ts` | Entrypoint: git/`gh`/fs I/O, dispatch, draft-aware exit |
| `harness/dod-check/lib/commit-subject.ts` | Pure: story-id presence + envelope check |
| `harness/dod-check/lib/todo-tbd.ts` | Pure: TODO-marker + PR-body-TBD-section scanners |
| `harness/dod-check/lib/gherkin-map.ts` | Pure: feature-AST ↔ step-def ↔ plan-scenario mapping |
| `harness/dod-check/tests/commit-subject.test.ts` | Unit tests (inline fixtures) |
| `harness/dod-check/tests/todo-tbd.test.ts` | Unit tests |
| `harness/dod-check/tests/gherkin-map.test.ts` | Unit tests |
| `harness/dod-check/tests/dod-check.integration.test.ts` | Subprocess smoke over a temp git repo + fixtures (R7): asserts one **draft** run (advisory `pr-tbd`/`commit-envelope` → exit 0) and one **out-of-draft** run (same findings → exit 1) via the `DOD_PR_DRAFT` env leg, plus a hard `missing-story-id` run (exit 1 regardless) |
| `harness/dod-check/fixtures/` | Synthetic feature/steps/plan/PR-body fixtures (no real content) |
| `harness/dod-check/README.md` | Invocation, checks, enforcement model, exit codes |
| `docs/plans/story-h6.md` | This plan (R1) |
| `docs/retrospectives/story-h6.md` | Phase 5 |
| `docs/status.d/2026-07-02-story-h6.md` | R17 fragment |

**Modified files:**

| File | Change |
| --- | --- |
| `harness/metrics/lib/loop-metrics.ts` | Consume shared `buildStoryIdRegExp`; drop local `buildStoryIdPattern` |
| `harness/metrics/usage-reader.ts` | Consume shared `buildStoryIdGitGrepPattern`; drop inline pattern |
| `harness/README.md` | "Shared helpers (`harness/lib/`)" note + `dod-check` in the invocation map |
| `.github/workflows/ci.yml` | `Run DoD checks` step |
| `.claude/settings.json` | PostToolUse hook + permission entries for `dod-check` |
| `package.json` | `dod:check` script; `@cucumber/gherkin` + `@cucumber/cucumber-expressions` as explicit devDeps (R3) |

**Output formats (R2):** `--json` → `{ findings: DodFinding[] }` (discriminated union above). Human
stderr report grouped `Commit subjects:` / `TODO/TBD:` / `Gherkin↔step:` with file/line anchors and,
for advisory findings, an `(advisory — PR is draft)` suffix.

## Acceptance scenarios

Harness tooling, not domain logic: scenarios map to harness vitest tests (in-process pure-lib tests +
one subprocess smoke — R7 scope stated per scenario).

**Scenario A — commit-subject discipline, draft-aware**
```gherkin
Given a temp repo whose branch is story-zz and commits where one subject omits the story id
And a plan file declaring the R13 envelope
When dod-check runs against a draft PR
Then the id-less subject is reported as missing-story-id and exit code is 1
And a commit count outside 6–10 is reported as an advisory envelope finding (does not fail on its own)
When the same repo is checked with the PR out of draft
Then the envelope finding becomes a hard failure
fails if: a subject missing the story id is not flagged, or the envelope finding fails a draft PR
(guards commit-subject.ts presence + envelope paths and the entrypoint draft-aware exit;
in-process lib tests + one subprocess smoke)
```

**Scenario B — TODO/TBD honesty**
```gherkin
Given a source file containing a TODO comment and a PR body with TBD left in section 2
When dod-check runs
Then the TODO is reported with its file and line and exit code is 1
And the TBD is reported as pr-tbd (hard when the PR is out of draft, advisory while draft)
And TBD-looking text inside the section-10 merge checklist is not flagged
fails if: a TODO is missed, or a checklist placeholder is a false positive
(guards todo-tbd.ts scanners; in-process — subprocess smoke covers wiring)
```

**Scenario C — Gherkin↔step existence mapping**
```gherkin
Given a feature scenario whose step has no matching step definition
And a plan-declared scenario name absent from the feature files
When dod-check runs
Then the unmatched step's scenario is reported unmapped and exit code is 1
And the plan-only scenario is reported as unmapped
And scenarios whose steps all resolve (regex or cucumber-expression defs) are not flagged
fails if: an unmapped scenario is silently passed, or a resolvable step is falsely flagged
(guards gherkin-map.ts using @cucumber/gherkin + cucumber-expressions; in-process)
```

**Scenario D — shared matcher covers all subject conventions**
```gherkin
Given commit subjects in bracket [story-<id>], bare story-<id>, and "Story <id>" forms
When buildStoryIdRegExp / buildStoryIdGitGrepPattern match them
Then all three forms match and a compound story-<id>-x does not false-match story-<id>
And the refactored loop-metrics and usage-reader tests stay green on the shared matcher
fails if: a convention regresses or a metrics consumer breaks on the extraction
(guards harness/lib/story-id-matcher.ts; unit + fast-check property test + green metrics suite)
```

## Slice plan (R13: target 6–10 commits)

Preparatory (before Phase 3; not counted per R16):
- **P0:** `chore(docs): story-h6 plan + P1/P2/P3 review [story-h6]`

Change-body commits (each check-family gets its own red/green pair — Phase-2 finding: the earlier
`C5/C6` bundled three behaviours into one pair, weakening TDD pairing and R12 subject clarity):
1. **C1:** `test(harness): shared story-id matcher — failing [story-h6]`
2. **C2:** `feat(harness): story-id-matcher + refactor metrics consumers — green [story-h6]`
3. **C3:** `test(harness): commit-subject + envelope check — failing [story-h6]`
4. **C4:** `feat(harness): commit-subject discipline, draft-aware envelope — green [story-h6]`
5. **C5:** `test(harness): TODO + PR-body-TBD scanners — failing [story-h6]`
6. **C6:** `feat(harness): todo-tbd scanners — green [story-h6]`
7. **C7:** `test(harness): Gherkin↔step mapping — failing [story-h6]`
8. **C8:** `feat(harness): gherkin-map + dod-check entrypoint + README — green [story-h6]`
9. **C9:** `chore(harness): CI + PostToolUse wiring, scripts, cucumber devDeps (R3), integration smoke [story-h6]`
10. **C10:** `chore(retro): story-h6 retrospective + status fragment [story-h6]`

**Total: 10 change-body + 1 preparatory.** At the top of the R13 6–10 envelope. A `refactor(harness):`
slice is **Phase-4-conditional**: it is authored only if the code-review produces fix-now items; if
it does, the count becomes 11 (R13 is a *target*, and story-h1 shipped 11–12 harness slices — a
one-over for a genuine refactor is acceptable and preferable to bundling). No empty R11 slot is
pre-declared. (R13 applies, not R16: this story ships four new observable harness behaviours delivered
as TDD slices — not a zero-behaviour-change story.)

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Cucumber libs are transitive (quickpickle) and could drop | Add `@cucumber/gherkin` + `@cucumber/cucumber-expressions` as explicit devDeps; R3 tool-bundle audit flagged at C7 |
| Draft state unavailable on a local run | Advisory fallback for draft-aware findings, degradation reported (never silent) |
| Envelope rule not declared in a plan | Reported as an advisory `envelope not declared` finding, not a crash |
| Commit set incomplete mid-PR (no retro commit yet) | Draft-aware advisory resolves this — envelope only hard-fails once the PR is ready-for-review |
| Unifying the two story-id regexes changes matching semantics | `fast-check` property test + keep both metrics suites green pin the canonical behaviour |
| Temp-git-repo integration scaffolding duplicates #119 | Evaluate a shared helper at Phase 4; cross-reference #119, no scope grab now |
| This plan outweighs the diff (Module 5 heuristic) | Three checks + refactor + fixtures exceed this plan's LOC; `metrics:loop` verifies reflexively in the retro |

## Phase-4 watch-items (from Phase-2 review, to confirm against the diff)

- `gherkin-map.ts` is the single riskiest file for the ~50-LOC-per-function standard (feature-AST
  walk + cucumber-expression matching + plan-scenario cross-ref) — confirm functions stay decomposed.
- Assert the `--json` output shape (not only the human report) against a **non-empty** findings
  fixture, covering every `DodFinding` `kind` (R8 mock-diversity, drift-scan `--json` test precedent).
- Confirm no `any` and no bare `catch` in the git/`gh` failure-collapse path.

## Verification plan

1. `npm run test:harness` → green, including new `harness/lib` + `harness/dod-check` tests.
2. `npx tsx harness/dod-check/dod-check.ts` on the story-h6 branch → reflexive: its own subjects carry
   `[story-h6]`, count within 6–10, no TODO/TBD, features map; exit 0 (advisory while draft).
3. Negative smoke: the integration test's temp repo (id-less subject, TODO, unmapped scenario, TBD
   PR body) → exit 1 with each finding reported.
4. `npm run lint && npm run build && npm test` → green (product tree untouched).
5. `grep -rE "from ['\"].*(src|tests)/" harness/ ; grep -rE "from ['\"].*harness/" src/ tests/` → empty
   (no cross-tree imports).
6. `npm run typecheck:harness` → green.
7. `npx tsx harness/drift-scan/drift-scan.ts` → exit 0 on this plan (surface paths exist post-impl).
8. `npm run metrics:loop` / existing metrics tests → green after the shared-matcher refactor.

## DoR checklist

- [x] Phase 1 (plan) drafted — this file
- [x] Phase 2 (plan-reviewer + sibling-overlap, launched in parallel in a single message) — complete
      2026-07-02; plan-reviewer 24 findings (15/21 rule-tags apply, R1/R2/R3/R5/R6/R7/R8/R11/R12/R13/
      R17/R19/R21/R23 satisfied) + sibling-overlap (no overlap, #147 coordination note); all tagged below
- [ ] Phase 3 (Sonnet implementation)
- [ ] Phase 4 (code review + refactor)
- [ ] Phase 5 (retrospective); merge gate (§ 7 DoD 11) with the user

## Suggestion log

Phase 2 run 2026-07-02: `plan-reviewer` (24 findings) + `sibling-overlap` (no overlap), in parallel.
Pass-confirmations (R1/R2/R3/R5/R6/R7/R8/R11/R12/R13/R17/R19/R21/R23 satisfied) are not repeated;
every substantive finding is tagged.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | story-h4 retro *Try* items (artifact-staleness, ref-data provenance) earmarked for #144 neither accepted nor rejected | adopted | Context: "Future scanner-family candidates — out of scope" note; deferred, not rejected |
| P1 | Envelope parser assumes one Slice-plan heading shape; corpus has ≥5, many without an R-tag | adopted | Selected solution: broadened parse rule over all five shapes + no-tag → advisory; test fixtures pin it |
| P1 | CI draft wiring imprecise — `pull_request.draft` is a workflow expression, not ambient env | adopted | Wiring: explicit `env: DOD_PR_DRAFT/DOD_PR_NUMBER` mapped from `github.event.*` |
| P1 | Scenario B subprocess leg doesn't pin which fixture exercises the draft vs ready path | adopted | Integration-test surface row: draft (exit 0) + out-of-draft (exit 1) legs via `DOD_PR_DRAFT` enumerated |
| P1 | Story-id derivation unspecified for zero-or-many-plan-file case | adopted | Selected solution: `story-id-unresolved` advisory finding, skip, never crash |
| P2 | PII / honesty / determinism | acknowledged | Plan already commits to synthetic fixtures + reported (never silent) degradation; QA spirit met (harness out of QA doc scope) |
| P3 | git/`gh` calls could be a shell-injection surface if string-interpolated | adopted | Selected solution: `execFileSync` array-args mandated; branch-name id never reaches a shell |
| P3 | `gh pr view` failure modes (unauth/rate-limit/network/parse) may throw instead of degrading | adopted | Draft-aware bullet: all `gh`/`git` failures collapse to advisory fallback; typed `isDraft` guard, no crash |
| P3 | `gh --json isDraft` is nominally an external boundary (Zod-spirit) | adopted | Typed guard (unknown → advisory); no zod dep at harness tier |
| P3 | C5/C6 bundled three behaviours in one red/green pair — weak TDD pairing + R12 dual-naming | adopted | Slice plan re-sliced: todo-tbd (C5/C6) and gherkin-map (C7/C8) each own a pair |
| P3 | `gherkin-map.ts` risks the ~50-LOC/function standard | acknowledged | Phase-4 watch-items list |
| P3 | Assert `--json` shape (not just human report) on a non-empty findings fixture (R8) | acknowledged | Phase-4 watch-items list |
| P3 | Confirm no `any` / no bare `catch` in failure-collapse path | acknowledged | Phase-4 watch-items list (plan-level; verifiable only against the diff) |
| Sibling | #147 names #144's scanner family as a fold-in target but isn't acknowledged | adopted | Context: listed as out-of-scope future scanner-family candidate |
| Sibling | #119 temp-git-repo shared-helper coordination | acknowledged | Already captured in Risks table; evaluate shared helper at Phase 4, no scope grab |
| Sibling | Story-id uniqueness + no open-PR overlap | acknowledged | Confirmed: `story-h6` free on `origin/main` and all branches; 0 open PRs |
